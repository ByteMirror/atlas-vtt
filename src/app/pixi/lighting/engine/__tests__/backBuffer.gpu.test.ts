import { Container, Graphics, Matrix, Sprite, Texture, WebGLRenderer } from 'pixi.js';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { SEES_ALL } from '../../../../vision/sight';
import { PLAIN_BACK_BUFFER_RESOLUTION } from '../backBuffer';
import { LightingEngine } from '../LightingEngine';
import type { EngineScene } from '../types';
import { copiedPixel, createTestRenderer } from './gpuTestUtils';

const SIZE = 256;
const MAP = 1024;
const SCALE = SIZE / MAP;
const scene: EngineScene = {
  bounds: { width: MAP, height: MAP },
  albedo: null,
  walls: [],
  lights: [{ key: 'l', x: 300, y: 300, bright: 60, dim: 120, flame: 10, color: [1, 0.8, 0.6], intensity: 1, animation: 'none' }],
  sight: SEES_ALL,
  sightRadius: 20,
  ambient: 0,
};

/** Whether the back buffer PIXI renders the canvas through is multisampled; undefined before it exists. */
function backBufferMultisampled(renderer: WebGLRenderer): boolean | undefined {
  const { _backBufferTexture: texture } = renderer.backBuffer as unknown as { _backBufferTexture: Texture | null };
  return texture?.source.antialias;
}

/** A renderer set up like the plugin's (`PixiAppManager`): antialiased, always through the back buffer. */
async function alwaysThroughBackBuffer(resolution: number): Promise<WebGLRenderer> {
  const renderer = new WebGLRenderer();
  await renderer.init({ width: SIZE, height: SIZE, antialias: true, useBackBuffer: true, backgroundAlpha: 1, backgroundColor: 0x000000, resolution });
  return renderer;
}

/** The canvas as a 2D copy, read in the task that rendered it. */
function canvasPixels(canvas: HTMLCanvasElement): Uint8ClampedArray {
  const context = new OffscreenCanvas(canvas.width, canvas.height).getContext('2d')!;
  context.drawImage(canvas, 0, 0);
  return context.getImageData(0, 0, canvas.width, canvas.height).data;
}

describe('the lighting back buffer', () => {
  const cleanup: (() => void)[] = [];
  afterEach(() => {
    vi.restoreAllMocks();
    while (cleanup.length) cleanup.pop()!();
  });

  /** An antialiased renderer with the engine over a white map; `always` draws through the back buffer like the plugin's. */
  async function setup(resolution: number, always = false): Promise<{
    renderer: WebGLRenderer; engine: LightingEngine; warn: ReturnType<typeof vi.spyOn>; render: () => { lit: number; dark: number };
  }> {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    const renderer = always ? await alwaysThroughBackBuffer(resolution) : await createTestRenderer(SIZE, resolution, true);
    cleanup.push(() => renderer.destroy());
    const engine = new LightingEngine(renderer);
    engine.setMode('player');
    const stage = new Container();
    const world = new Container();
    const map = new Sprite(Texture.WHITE);
    map.setSize(MAP, MAP);
    world.addChild(map, engine.layer);
    world.scale.set(SCALE);
    stage.addChild(world);
    cleanup.push(() => { world.removeChild(engine.layer); engine.destroy(); stage.destroy({ children: true }); });
    engine.setView(new Matrix(SCALE, 0, 0, SCALE, 0, 0).invert(), SCALE);

    /** Renders to the canvas; the red channel at the light and far from it. */
    const render = (): { lit: number; dark: number } => {
      renderer.render({ container: stage });
      const device = (world: number): number => Math.round(world * SCALE * resolution);
      return {
        lit: copiedPixel(renderer.canvas, device(300), device(300))[0]!,
        dark: copiedPixel(renderer.canvas, device(900), device(900))[0]!,
      };
    };
    return { renderer, engine, warn, render };
  }

  it('is not multisampled on a high-density display', async () => {
    const { renderer, engine, warn, render } = await setup(PLAIN_BACK_BUFFER_RESOLUTION);
    engine.setEnabled(true);
    engine.update(scene);
    engine.flush();

    const { lit, dark } = render();

    expect(backBufferMultisampled(renderer)).toBe(false);
    expect(lit).toBeGreaterThan(150);
    expect(dark).toBe(0);
    expect(warn).not.toHaveBeenCalled();
  });

  it('stays multisampled, like the canvas, at resolution 1', async () => {
    const { renderer, engine, warn, render } = await setup(1);
    engine.setEnabled(true);
    engine.update(scene);
    engine.flush();

    const { lit, dark } = render();

    expect(backBufferMultisampled(renderer)).toBe(true);
    expect(lit).toBeGreaterThan(150);
    expect(dark).toBe(0);
    expect(warn).not.toHaveBeenCalled();
  });

  it('keeps working when lighting is switched off and on again', async () => {
    const { renderer, engine, warn, render } = await setup(PLAIN_BACK_BUFFER_RESOLUTION);
    engine.setEnabled(true);
    engine.update(scene);
    engine.flush();
    render();

    engine.setEnabled(false);
    expect(renderer.backBuffer.useBackBuffer).toBe(false);
    // Straight to the canvas: the white map, unlit
    expect(render()).toEqual({ lit: 255, dark: 255 });

    engine.setEnabled(true);
    engine.update(scene);
    engine.flush();
    const { lit, dark } = render();

    expect(backBufferMultisampled(renderer)).toBe(false);
    expect(lit).toBeGreaterThan(150);
    expect(dark).toBe(0);
    expect(warn).not.toHaveBeenCalled();
  });
  it('frees the back buffer when lighting no longer needs it', async () => {
    const { renderer, engine, render } = await setup(PLAIN_BACK_BUFFER_RESOLUTION);
    engine.setEnabled(true);
    engine.update(scene);
    engine.flush();
    render();
    expect(backBufferMultisampled(renderer)).toBe(false);

    engine.setEnabled(false);

    expect(backBufferMultisampled(renderer)).toBeUndefined();
  });

  describe('of a renderer that always draws through it, like the plugin\'s', () => {
    it('gives the canvas no samples and keeps the renderer\'s antialiasing in the back buffer', async () => {
      const { renderer, render } = await setup(PLAIN_BACK_BUFFER_RESOLUTION, true);

      expect(render()).toEqual({ lit: 255, dark: 255 });
      expect(renderer.gl.getContextAttributes()?.antialias).toBe(false);
      expect(backBufferMultisampled(renderer)).toBe(true);
    });

    it('draws plain while lighting is on at a high resolution, and antialiased again after', async () => {
      const { renderer, engine, warn, render } = await setup(PLAIN_BACK_BUFFER_RESOLUTION, true);
      engine.setEnabled(true);
      engine.update(scene);
      engine.flush();
      const { lit, dark } = render();

      expect(backBufferMultisampled(renderer)).toBe(false);
      expect(lit).toBeGreaterThan(150);
      expect(dark).toBe(0);

      engine.setEnabled(false);
      expect(renderer.backBuffer.useBackBuffer).toBe(true);
      expect(render()).toEqual({ lit: 255, dark: 255 });
      expect(backBufferMultisampled(renderer)).toBe(true);
      expect(warn).not.toHaveBeenCalled();
    });

    it('stays multisampled while lighting is on at resolution 1', async () => {
      const { renderer, engine, render } = await setup(1, true);
      engine.setEnabled(true);
      engine.update(scene);
      engine.flush();
      render();

      expect(backBufferMultisampled(renderer)).toBe(true);
    });

    it('antialiases edges as much as an antialiased canvas did', async () => {
      const shape = new Graphics().poly([20, 30, 230, 60, 120, 240]).fill(0xffffff).circle(180, 180, 40.3).stroke({ width: 1.5, color: 0xff8800 });
      cleanup.push(() => shape.destroy());
      const pixels = async (renderer: WebGLRenderer): Promise<Uint8ClampedArray> => {
        cleanup.push(() => renderer.destroy());
        renderer.background.color = 0x000000;
        renderer.render({ container: shape });
        return canvasPixels(renderer.canvas);
      };
      /** Pixels an edge only partly covers: what antialiasing makes. */
      const edges = (image: Uint8ClampedArray): number => {
        let count = 0;
        for (let i = 0; i < image.length; i += 4) if (image[i]! > 0 && image[i]! < 255) count++;
        return count;
      };
      const before = await pixels(await createTestRenderer(SIZE, 1, true));
      const now = await pixels(await alwaysThroughBackBuffer(1));
      const plain = await pixels(await createTestRenderer(SIZE, 1, false));

      let worst = 0;
      for (let i = 0; i < before.length; i++) worst = Math.max(worst, Math.abs(before[i]! - now[i]!));
      expect(edges(plain)).toBe(0);
      expect(edges(before)).toBeGreaterThan(200);
      expect(Math.abs(edges(now) - edges(before))).toBeLessThan(edges(before) * 0.05);
      // Four samples either way. A texture is drawn upside down, which mirrors the sample pattern,
      // so an edge pixel may cover one sample more or less: a quarter of full intensity.
      expect(worst).toBeLessThanOrEqual(Math.ceil(255 / 4));
    });
  });
});
