import { afterEach, describe, expect, it } from 'vitest';
import { watchGl, type GlWatch } from './strictGl';

const VERTEX = `#version 300 es
#define SHADER_NAME watch-test
in vec2 aPosition;
in vec4 aSegment;
void main() { gl_Position = vec4(aPosition + aSegment.xy, 0.0, 1.0); }`;
const FRAGMENT = `#version 300 es
precision highp float;
uniform vec3 uTint;
out vec4 color;
void main() { color = vec4(uTint, 1.0); }`;

/** The watch must be able to fail: each check against a call that breaks its rule. */
describe('the strict GL watch', () => {
  let gl: WebGL2RenderingContext;
  let watch: GlWatch;
  let program: WebGLProgram;

  function compile(type: number, source: string): WebGLShader {
    const shader = gl.createShader(type)!;
    gl.shaderSource(shader, source);
    gl.compileShader(shader);
    return shader;
  }

  function attribute(name: string, data: number[], size: number, divisor: number): void {
    const location = gl.getAttribLocation(program, name);
    gl.bindBuffer(gl.ARRAY_BUFFER, gl.createBuffer());
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array(data), gl.STATIC_DRAW);
    gl.enableVertexAttribArray(location);
    gl.vertexAttribPointer(location, size, gl.FLOAT, false, 0, 0);
    gl.vertexAttribDivisor(location, divisor);
  }

  function indices(data: number[]): void {
    gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, gl.createBuffer());
    gl.bufferData(gl.ELEMENT_ARRAY_BUFFER, new Uint16Array(data), gl.STATIC_DRAW);
  }

  /** A program in use with a quad in `aPosition`, `segments` instances in `aSegment` and six indices. */
  function start(segments: number): void {
    gl = new OffscreenCanvas(16, 16).getContext('webgl2')!;
    program = gl.createProgram();
    gl.attachShader(program, compile(gl.VERTEX_SHADER, VERTEX));
    gl.attachShader(program, compile(gl.FRAGMENT_SHADER, FRAGMENT));
    gl.linkProgram(program);
    gl.useProgram(program);
    gl.bindVertexArray(gl.createVertexArray());
    attribute('aPosition', [0, 0, 1, 0, 0, 1, 1, 1], 2, 0);
    attribute('aSegment', new Array<number>(segments * 4).fill(0), 4, 1);
    indices([0, 1, 2, 1, 3, 2]);
    watch = watchGl(gl);
  }

  afterEach(() => {
    watch.stop();
    gl.getExtension('WEBGL_lose_context')?.loseContext();
  });

  it('finds nothing in valid calls, and counts them', () => {
    start(3);
    gl.uniform3f(gl.getUniformLocation(program, 'uTint'), 1, 0.5, 0);
    gl.drawElements(gl.TRIANGLES, 6, gl.UNSIGNED_SHORT, 0);
    gl.drawElementsInstanced(gl.TRIANGLES, 6, gl.UNSIGNED_SHORT, 0, 3);
    gl.drawArraysInstanced(gl.TRIANGLE_STRIP, 0, 4, 3);
    expect(watch.findings).toEqual([]);
    expect(watch.uniforms()).toBe(1);
    expect(watch.draws()).toBe(3);
  });

  it('finds a uniform set with the wrong size, once however often it happens', () => {
    start(1);
    const location = gl.getUniformLocation(program, 'uTint');
    gl.uniform4f(location, 1, 1, 1, 1);
    gl.uniform4f(location, 1, 1, 1, 1);
    expect(watch.findings).toEqual(['INVALID_OPERATION from uniform4f (watch-test)']);
  });

  it('finds an instanced attribute with fewer elements than instances', () => {
    start(2);
    gl.drawElementsInstanced(gl.TRIANGLES, 6, gl.UNSIGNED_SHORT, 0, 3);
    expect(watch.findings).toContain('drawElementsInstanced (watch-test): attribute aSegment needs 48 bytes for 3 instances (divisor 1), its buffer has 32');
  });

  it('finds a per-vertex attribute shorter than the highest index', () => {
    start(1);
    indices([0, 1, 2, 1, 4, 2]);
    gl.drawElements(gl.TRIANGLES, 6, gl.UNSIGNED_SHORT, 0);
    expect(watch.findings).toContain('drawElements (watch-test): attribute aPosition needs 40 bytes for 5 vertices, its buffer has 32');
  });

  it('finds an active attribute that is not enabled, or enabled without a buffer', () => {
    start(1);
    gl.disableVertexAttribArray(gl.getAttribLocation(program, 'aSegment'));
    gl.drawElements(gl.TRIANGLES, 6, gl.UNSIGNED_SHORT, 0);
    expect(watch.findings).toEqual(['drawElements (watch-test): active attribute aSegment is not enabled']);
  });

  it('finds indices past the end of the index buffer', () => {
    start(1);
    gl.drawElements(gl.TRIANGLES, 9, gl.UNSIGNED_SHORT, 0);
    expect(watch.findings[0]).toBe('drawElements (watch-test): 9 indices from byte 0 do not fit the index buffer of 12 bytes');
  });

  it('leaves the context as it was once stopped', () => {
    start(1);
    watch.stop();
    expect(Object.hasOwn(gl, 'drawElements')).toBe(false);
    gl.uniform4f(gl.getUniformLocation(program, 'uTint'), 1, 1, 1, 1);
    expect(watch.findings).toEqual([]);
    expect(gl.getError()).toBe(gl.INVALID_OPERATION);
  });
});
