import { Buffer, BufferUsage, Geometry, RenderTexture, type Container, type Renderer, type TEXTURE_FORMATS } from 'pixi.js';

export type { Rect } from '../../../lighting/segments';

export const HIGHP = 'highp';

/** A render texture the engine samples without mipmaps. Our shaders write clip space directly. */
export function createTarget(width: number, height: number, format: TEXTURE_FORMATS, scaleMode: 'linear' | 'nearest' = 'linear'): RenderTexture {
  return RenderTexture.create({
    width: Math.max(1, Math.ceil(width)),
    height: Math.max(1, Math.ceil(height)),
    format,
    scaleMode,
    antialias: false,
    autoGenerateMipmaps: false,
    resolution: 1,
  });
}

export interface Quad {
  vertices: Buffer;
  indices: Buffer;
}

/** A unit square (0..1) in `aPosition`; shaders place it themselves. */
export function createQuad(): Quad {
  return {
    vertices: new Buffer({ data: new Float32Array([0, 0, 1, 0, 0, 1, 1, 1]), usage: BufferUsage.VERTEX }),
    indices: new Buffer({ data: new Uint32Array([0, 1, 2, 1, 3, 2]), usage: BufferUsage.INDEX }),
  };
}

export function quadGeometry(quad: Quad): Geometry {
  return new Geometry({ attributes: { aPosition: { buffer: quad.vertices, format: 'float32x2' } }, indexBuffer: quad.indices });
}

/** Renders `container` into `target` outside the stage's render, like `ExploredTexture` does. */
export function renderInto(renderer: Renderer, container: Container, target: RenderTexture, clearColor?: [number, number, number, number]): void {
  renderer.render(clearColor ? { container, target, clear: true, clearColor } : { container, target, clear: false });
}
