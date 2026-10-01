import { GlBackBufferSystem, type Renderer, type Texture, type WebGLRenderer } from 'pixi.js';
import { describe, expect, it, vi } from 'vitest';
import { PLAIN_BACK_BUFFER_RESOLUTION, setBackBuffer } from '../../src/app/pixi/lighting/engine/backBuffer';

/**
 * PIXI's own back buffer system on a renderer without a GL context, set up as PIXI does for an
 * antialiased canvas. `setBackBuffer` writes a private field of it; these tests fail when a
 * PIXI update stops reading that field for the texture it renders the canvas through.
 */
function backBufferFor(resolution: number): { renderer: Renderer; texture: () => Texture } {
  const canvasTexture = { width: 2880, height: 1720, _resolution: resolution };
  const renderer = {
    name: 'webgl',
    resolution,
    context: { supports: { msaa: true } },
    renderTarget: { getRenderTarget: () => ({ isRoot: true, colorTexture: canvasTexture }) },
  } as unknown as WebGLRenderer;
  const backBuffer = new GlBackBufferSystem(renderer);
  backBuffer.init({ useBackBuffer: false, antialias: true });
  Object.assign(renderer, { backBuffer });
  return {
    renderer,
    texture: () => {
      // What a render to the canvas starts with: PIXI swaps the target for its back buffer texture
      const options = { target: canvasTexture } as unknown as Parameters<GlBackBufferSystem['renderStart']>[0];
      backBuffer['renderStart'](options);
      return options.target as Texture;
    },
  };
}

describe('setBackBuffer', () => {
  it('gives PIXI a plain back buffer on a high-density display', () => {
    const { renderer, texture } = backBufferFor(PLAIN_BACK_BUFFER_RESOLUTION);

    setBackBuffer(renderer, true);

    expect(texture().source.antialias).toBe(false);
    expect(texture().source.pixelWidth).toBe(2880 * PLAIN_BACK_BUFFER_RESOLUTION);
  });

  it('leaves the back buffer multisampled, like the canvas, below that', () => {
    const { renderer, texture } = backBufferFor(1);

    setBackBuffer(renderer, true);

    expect(texture().source.antialias).toBe(true);
  });

  it('switches the back buffer off again and never touches other renderers', () => {
    const { renderer } = backBufferFor(PLAIN_BACK_BUFFER_RESOLUTION);
    setBackBuffer(renderer, true);
    expect((renderer as WebGLRenderer).backBuffer.useBackBuffer).toBe(true);
    setBackBuffer(renderer, false);
    expect((renderer as WebGLRenderer).backBuffer.useBackBuffer).toBe(false);

    const canvasRenderer = { name: 'canvas', resolution: 2 } as unknown as Renderer;
    expect(() => setBackBuffer(canvasRenderer, true)).not.toThrow();
    vi.restoreAllMocks();
  });
});
