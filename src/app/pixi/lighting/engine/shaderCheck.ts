import { ENGINE_SHADERS, type EngineShaderSource } from './engineShaders';
import { engineProgram } from './gpu';

export interface ShaderFailure {
  name: string;
  /** What the driver said about the shader's stages and its link. */
  log: string;
}

type Gl = WebGLRenderingContext | WebGL2RenderingContext;

/**
 * Compiles and links the sources PIXI will hand the driver for each engine program, and
 * returns those that fail. PIXI itself only logs a failed link and then throws from its
 * uniform sync, deep inside a render; asking the driver first keeps a device that rejects
 * the shaders (or a context that came back broken) from ever reaching that point.
 */
export function failedEngineShaders(gl: Gl, sources: readonly EngineShaderSource[] = Object.values(ENGINE_SHADERS)): ShaderFailure[] {
  const failures: ShaderFailure[] = [];
  for (const source of sources) {
    const { vertex = '', fragment = '' } = engineProgram(source);
    const log = linkLog(gl, vertex, fragment);
    if (log !== null) failures.push({ name: source.name, log });
  }
  return failures;
}

/** One line per failed shader, for the console. */
export function describeShaderFailures(failures: readonly ShaderFailure[]): string {
  return failures.map(({ name, log }) => `${name}: ${log}`).join('\n');
}

/** Null when the program links; otherwise the driver's logs. */
function linkLog(gl: Gl, vertexSource: string, fragmentSource: string): string | null {
  const vertex = compile(gl, gl.VERTEX_SHADER, vertexSource);
  const fragment = compile(gl, gl.FRAGMENT_SHADER, fragmentSource);
  const program = gl.createProgram();
  if (!vertex || !fragment || !program) {
    deleteAll(gl, program, vertex, fragment);
    return 'the graphics device created no shader object';
  }
  gl.attachShader(program, vertex);
  gl.attachShader(program, fragment);
  gl.linkProgram(program);
  const linked = gl.getProgramParameter(program, gl.LINK_STATUS) === true;
  const logs = linked ? [] : [gl.getShaderInfoLog(vertex), gl.getShaderInfoLog(fragment), gl.getProgramInfoLog(program)];
  deleteAll(gl, program, vertex, fragment);
  if (linked) return null;
  return logs.map((log) => log?.trim()).filter(Boolean).join('\n') || 'the driver gave no log';
}

function compile(gl: Gl, type: number, source: string): WebGLShader | null {
  const shader = gl.createShader(type);
  if (!shader) return null;
  gl.shaderSource(shader, source);
  gl.compileShader(shader);
  return shader;
}

function deleteAll(gl: Gl, program: WebGLProgram | null, vertex: WebGLShader | null, fragment: WebGLShader | null): void {
  if (program) gl.deleteProgram(program);
  if (vertex) gl.deleteShader(vertex);
  if (fragment) gl.deleteShader(fragment);
}
