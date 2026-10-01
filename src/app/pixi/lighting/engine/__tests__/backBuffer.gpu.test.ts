import { Container, Matrix, Sprite, Texture, type WebGLRenderer } from 'pixi.js';
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

describe('the lighting back buffer', () => {
  const cleanup: (() => void)[] = [];
  afterEach(() => {
    vi.restoreAllMocks();
    while (cleanup.length) cleanup.pop()!();
  });

  /** An antialiased canvas, like the plugin's, with the engine over a white map. */
  async function setup(resolution: number): Promise<{
    renderer: WebGLRenderer; engine: LightingEngine; warn: ReturnType<typeof vi.spyOn>; render: () => { lit: number; dark: number };
  }> {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    const renderer = await createTestRenderer(SIZE, resolution, true);
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
});
