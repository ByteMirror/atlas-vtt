import { Buffer, BufferUsage, Container, Geometry, Mesh, RenderTexture, Shader } from 'pixi.js';
import { describe, expect, it } from 'vitest';
import { createTestRenderer, readFloats } from './gpuTestUtils';

// Proves what the engine relies on: float render targets, min blending, instancing, clear
// values above 1 and our own clip-space mapping (no PIXI projection).
describe('PIXI capabilities', () => {
  it('min-blends instanced quads into an r16float target', async () => {
    const renderer = await createTestRenderer(64);
    const target = RenderTexture.create({ width: 4, height: 1, format: 'r16float', scaleMode: 'nearest', autoGenerateMipmaps: false });
    const quad = new Buffer({ data: new Float32Array([0, 0, 1, 0, 0, 1, 1, 1]), usage: BufferUsage.VERTEX });
    const values = new Buffer({ data: new Float32Array([5, 3]), usage: BufferUsage.VERTEX });
    const geometry = new Geometry({
      attributes: {
        aPosition: { buffer: quad, format: 'float32x2' },
        aValue: { buffer: values, format: 'float32', instance: true },
      },
      indexBuffer: new Buffer({ data: new Uint32Array([0, 1, 2, 1, 3, 2]), usage: BufferUsage.INDEX }),
      instanceCount: 2,
    });
    const shader = Shader.from({
      gl: {
        vertex: 'in vec2 aPosition; in float aValue; out float vValue; void main() { vValue = aValue; gl_Position = vec4(aPosition * 2.0 - 1.0, 0.0, 1.0); }',
        fragment: 'in float vValue; out vec4 finalColor; void main() { finalColor = vec4(vValue, 0.0, 0.0, 1.0); }',
        name: 'atlas-capability-test',
        preferredFragmentPrecision: 'highp',
      },
      resources: {},
    });
    const mesh = new Mesh({ geometry, shader });
    mesh.blendMode = 'min';
    renderer.render({ container: mesh, target, clear: true, clearColor: [128, 0, 0, 1] });
    const texels = readFloats(renderer, target);
    expect(texels[0]).toBe(3);
    renderer.render({ container: new Container(), target, clear: true, clearColor: [128, 0, 0, 1] });
    expect(readFloats(renderer, target)[0]).toBe(128);
  });
});
