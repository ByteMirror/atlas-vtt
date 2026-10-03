import type { WebGLRenderer } from 'pixi.js';
import { afterEach, describe, expect, it } from 'vitest';
import { srgbToLinear } from '../../../../lighting/srgb';
import { computeSight, SEES_ALL, type Sight } from '../../../../vision/sight';
import { LightingEngine } from '../LightingEngine';
import type { EngineLight, EngineScene } from '../types';
import { createTestRenderer, renderThroughEngine, type PixelReader } from './gpuTestUtils';

const SIZE = 256;
const LUMA = [0.2126, 0.7152, 0.0722] as const;
/** A warm light at world (300, 300); the camera below puts it at screen (128, 128). */
const light: EngineLight = { key: 'l', x: 300, y: 300, bright: 60, dim: 120, flame: 10, color: [1, 0.8, 0.6], intensity: 1, animation: 'none' };
const camera = { size: SIZE, scale: 0.5, x: -22, y: -22, tint: 0x6699cc };
/** Floor lit by the light's dim ring: world (370, 300) and (300, 370). */
const ring: readonly [number, number][] = [[163, 128], [128, 163]];

/** A token far from the light, whose sight (100 px) never reaches it. */
const farSight: Sight = computeSight([{ tokenId: 't', origin: { x: 850, y: 850 }, range: 100, senses: [] }], []);

function scene(sight: Sight): EngineScene {
  return { bounds: { width: 1024, height: 1024 }, albedo: null, walls: [], lights: [light], sight, sightRadius: 20, ambient: 0 };
}

function linear(pixel: readonly [number, number, number]): number[] {
  return pixel.map((channel) => srgbToLinear(channel / 255));
}

function luminance(pixel: readonly [number, number, number]): number {
  return linear(pixel).reduce((sum, channel, i) => sum + channel * LUMA[i]!, 0);
}

/** Chroma relative to luminance, in linear light: independent of how bright the pixel is. */
function saturation(pixel: readonly [number, number, number]): number {
  const channels = linear(pixel);
  return (Math.max(...channels) - Math.min(...channels)) / luminance(pixel);
}

describe('GM composite', () => {
  const cleanup: (() => void)[] = [];
  afterEach(() => {
    while (cleanup.length) cleanup.pop()!();
  });

  async function renderGm(sight: Sight): Promise<PixelReader> {
    const renderer: WebGLRenderer = await createTestRenderer(SIZE);
    cleanup.push(() => renderer.destroy());
    const engine = new LightingEngine(renderer);
    cleanup.push(() => engine.destroy());
    engine.setEnabled(true);
    engine.setMode('gm');
    engine.update(scene(sight));
    engine.flush();
    return renderThroughEngine(engine, renderer, camera);
  }

  it('shows a light no token sees at full strength', async () => {
    const seen = await renderGm(SEES_ALL);
    const unseen = await renderGm(farSight);
    for (const [x, y] of ring) {
      const full = luminance(seen(x, y));
      expect(full).toBeGreaterThan(0.05);
      // 8-bit channels and dither: a few percent.
      expect(Math.abs(luminance(unseen(x, y)) - full)).toBeLessThan(0.03 * full + 0.003);
    }
  });

  it('marks what no token sees by fading its colour', async () => {
    const seen = await renderGm(SEES_ALL);
    const unseen = await renderGm(farSight);
    for (const [x, y] of ring) {
      const ratio = saturation(unseen(x, y)) / saturation(seen(x, y));
      expect(ratio).toBeGreaterThan(0.45);
      expect(ratio).toBeLessThan(0.8);
    }
  });

  it('draws what a token sees exactly as with everything seen', async () => {
    const seen = await renderGm(SEES_ALL);
    const watched = await renderGm(computeSight([{ tokenId: 't', origin: { x: 300, y: 300 }, range: 400, senses: [] }], []));
    for (const [x, y] of ring) {
      for (let channel = 0; channel < 3; channel++) expect(Math.abs(watched(x, y)[channel]! - seen(x, y)[channel]!)).toBeLessThanOrEqual(1);
    }
  });
});
