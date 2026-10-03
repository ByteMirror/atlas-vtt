/**
 * Strict WebGL for a test: every `uniform*` and `draw*` call on the context is followed by
 * `getError`, and every draw is first checked the way ANGLE's Direct3D backend checks its
 * vertex buffers (`VertexDataManager::reserveSpaceForAttrib`), which Metal and OpenGL skip:
 * a per-vertex attribute needs max index + 1 elements, an instanced one
 * `ceil(instances / divisor)`, and the last element must end inside its buffer.
 */
export interface GlWatch {
  /** What went wrong, each kind once, in the order it first happened. */
  readonly findings: string[];
  /** Draw calls checked so far. */
  draws(): number;
  /** Uniform calls checked so far. */
  uniforms(): number;
  /** Removes the wrappers; the context behaves as before. */
  stop(): void;
}

type GlMethod = (...args: unknown[]) => unknown;

const DRAW_CALLS = ['drawArrays', 'drawElements', 'drawArraysInstanced', 'drawElementsInstanced', 'drawRangeElements'] as const;
type DrawCall = (typeof DRAW_CALLS)[number];

/** What a draw call reads: vertices `0..vertices-1`, `instances` instances (1 when not instanced). */
interface DrawExtent {
  vertices: number;
  instances: number;
}

export function watchGl(gl: WebGL2RenderingContext): GlWatch {
  const findings: string[] = [];
  const seen = new Set<string>();
  let draws = 0;
  let uniforms = 0;
  const report = (finding: string): void => {
    if (seen.has(finding)) return;
    seen.add(finding);
    findings.push(finding);
  };
  /** Errors left by calls this does not wrap would otherwise be blamed on the next wrapped one. */
  const drain = (before: string): void => {
    const error = gl.getError();
    if (error !== gl.NO_ERROR && error !== gl.CONTEXT_LOST_WEBGL) report(`${errorName(gl, error)} pending before ${before}`);
  };
  const check = (after: string): void => {
    const error = gl.getError();
    if (error !== gl.NO_ERROR && error !== gl.CONTEXT_LOST_WEBGL) report(`${errorName(gl, error)} from ${after} (${programName(gl)})`);
  };

  const wrapped: string[] = [];
  const wrap = (name: string, before: (args: unknown[]) => void): void => {
    const original = Reflect.get(gl, name) as GlMethod;
    const wrapper: GlMethod = (...args) => {
      if (gl.isContextLost()) return original.apply(gl, args);
      drain(name);
      before(args);
      const result = original.apply(gl, args);
      check(name);
      return result;
    };
    Reflect.defineProperty(gl, name, { value: wrapper, configurable: true, writable: true });
    wrapped.push(name);
  };

  for (const name in gl) {
    if (!/^uniform(?!BlockBinding)/.test(name) || typeof Reflect.get(gl, name) !== 'function') continue;
    wrap(name, () => { uniforms++; });
  }
  for (const name of DRAW_CALLS) {
    wrap(name, (args) => {
      draws++;
      const extent = drawExtent(gl, name, args as number[], report);
      if (extent) checkAttributes(gl, name, extent, report);
    });
  }

  return {
    findings,
    draws: () => draws,
    uniforms: () => uniforms,
    stop: (): void => {
      for (const name of wrapped) Reflect.deleteProperty(gl, name);
    },
  };
}

function errorName(gl: WebGL2RenderingContext, error: number): string {
  const names: Record<number, string> = {
    [gl.INVALID_ENUM]: 'INVALID_ENUM',
    [gl.INVALID_VALUE]: 'INVALID_VALUE',
    [gl.INVALID_OPERATION]: 'INVALID_OPERATION',
    [gl.INVALID_FRAMEBUFFER_OPERATION]: 'INVALID_FRAMEBUFFER_OPERATION',
    [gl.OUT_OF_MEMORY]: 'OUT_OF_MEMORY',
  };
  return names[error] ?? `GL error 0x${error.toString(16)}`;
}

/** The name PIXI writes into a program's sources (`#define SHADER_NAME`). */
function programName(gl: WebGL2RenderingContext): string {
  const program = gl.getParameter(gl.CURRENT_PROGRAM) as WebGLProgram | null;
  if (!program) return 'no program';
  for (const shader of gl.getAttachedShaders(program) ?? []) {
    const name = /#define SHADER_NAME (\S+)/.exec(gl.getShaderSource(shader) ?? '')?.[1];
    if (name) return name;
  }
  return 'unnamed program';
}

/** Null when the call draws nothing or its indices cannot be read (reported). */
function drawExtent(gl: WebGL2RenderingContext, call: DrawCall, args: number[], report: (finding: string) => void): DrawExtent | null {
  if (call === 'drawArrays' || call === 'drawArraysInstanced') {
    const [, first = 0, count = 0, instances = 1] = args;
    return count > 0 && instances > 0 ? { vertices: first + count, instances } : null;
  }
  const [count = 0, type = 0, offset = 0, instances = 1] = call === 'drawRangeElements' ? args.slice(3) : args.slice(1);
  if (count <= 0 || instances <= 0) return null;
  const where = `${call} (${programName(gl)})`;
  const buffer = gl.getParameter(gl.ELEMENT_ARRAY_BUFFER_BINDING) as WebGLBuffer | null;
  if (!buffer) {
    report(`${where}: no index buffer`);
    return null;
  }
  const indices = type === gl.UNSIGNED_INT ? new Uint32Array(count) : type === gl.UNSIGNED_SHORT ? new Uint16Array(count) : new Uint8Array(count);
  const size = gl.getBufferParameter(gl.ELEMENT_ARRAY_BUFFER, gl.BUFFER_SIZE) as number;
  if (offset + indices.byteLength > size) {
    report(`${where}: ${count} indices from byte ${offset} do not fit the index buffer of ${size} bytes`);
    return null;
  }
  gl.getBufferSubData(gl.ELEMENT_ARRAY_BUFFER, offset, indices);
  let max = 0;
  for (const index of indices) max = Math.max(max, index);
  return { vertices: max + 1, instances };
}

function checkAttributes(gl: WebGL2RenderingContext, call: DrawCall, extent: DrawExtent, report: (finding: string) => void): void {
  const program = gl.getParameter(gl.CURRENT_PROGRAM) as WebGLProgram | null;
  if (!program) {
    report(`${call}: no program in use`);
    return;
  }
  const where = `${call} (${programName(gl)})`;
  const active = gl.getProgramParameter(program, gl.ACTIVE_ATTRIBUTES) as number;
  for (let i = 0; i < active; i++) {
    const info = gl.getActiveAttrib(program, i);
    const location = info ? gl.getAttribLocation(program, info.name) : -1;
    // Built-ins (gl_VertexID, gl_InstanceID) have no location.
    if (!info || location < 0) continue;
    if (!gl.getVertexAttrib(location, gl.VERTEX_ATTRIB_ARRAY_ENABLED)) {
      report(`${where}: active attribute ${info.name} is not enabled`);
      continue;
    }
    const buffer = gl.getVertexAttrib(location, gl.VERTEX_ATTRIB_ARRAY_BUFFER_BINDING) as WebGLBuffer | null;
    if (!buffer) {
      report(`${where}: attribute ${info.name} is enabled without a buffer`);
      continue;
    }
    const divisor = gl.getVertexAttrib(location, gl.VERTEX_ATTRIB_ARRAY_DIVISOR) as number;
    const elementSize = (gl.getVertexAttrib(location, gl.VERTEX_ATTRIB_ARRAY_SIZE) as number)
      * componentBytes(gl, gl.getVertexAttrib(location, gl.VERTEX_ATTRIB_ARRAY_TYPE) as number);
    const stride = (gl.getVertexAttrib(location, gl.VERTEX_ATTRIB_ARRAY_STRIDE) as number) || elementSize;
    const offset = gl.getVertexAttribOffset(location, gl.VERTEX_ATTRIB_ARRAY_POINTER);
    const needed = divisor > 0 ? Math.ceil(extent.instances / divisor) : extent.vertices;
    const end = offset + (needed - 1) * stride + elementSize;
    const size = bufferSize(gl, buffer);
    if (end > size) {
      const kind = divisor > 0 ? `${extent.instances} instances (divisor ${divisor})` : `${extent.vertices} vertices`;
      report(`${where}: attribute ${info.name} needs ${end} bytes for ${kind}, its buffer has ${size}`);
    }
  }
}

function componentBytes(gl: WebGL2RenderingContext, type: number): number {
  if (type === gl.BYTE || type === gl.UNSIGNED_BYTE) return 1;
  if (type === gl.SHORT || type === gl.UNSIGNED_SHORT || type === gl.HALF_FLOAT) return 2;
  return 4;
}

/** A buffer's size is only readable while bound; the array buffer binding is put back. */
function bufferSize(gl: WebGL2RenderingContext, buffer: WebGLBuffer): number {
  const bound = gl.getParameter(gl.ARRAY_BUFFER_BINDING) as WebGLBuffer | null;
  gl.bindBuffer(gl.ARRAY_BUFFER, buffer);
  const size = gl.getBufferParameter(gl.ARRAY_BUFFER, gl.BUFFER_SIZE) as number;
  gl.bindBuffer(gl.ARRAY_BUFFER, bound);
  return size;
}
