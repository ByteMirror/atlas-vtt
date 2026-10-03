import { Texture, type WebGLRenderer } from 'pixi.js';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { BOUNCE, FLICKER_INTERVAL_MS, LIGHT_REACH } from '../../../../lighting/lightingConstants';
import { LightingWorld } from '../LightingWorld';
import type { DrawnLight } from '../LightMap';
import type { EngineLight } from '../types';
import { createTestRenderer } from './gpuTestUtils';

const torch: EngineLight = { key: 'torch', x: 300, y: 300, bright: 60, dim: 120, flame: 10, color: [1, 0.8, 0.6], intensity: 1, animation: 'torch' };
const START = 10_000;

describe('LightingWorld.animate', () => {
  const cleanup: (() => void)[] = [];
  afterEach(() => {
    vi.restoreAllMocks();
    while (cleanup.length) cleanup.pop()!();
  });

  /** A world with one torch whose bounce and first flicker frame were drawn at `START`. */
  async function setup(): Promise<{ renderer: WebGLRenderer; world: LightingWorld }> {
    const renderer = await createTestRenderer(256);
    cleanup.push(() => renderer.destroy());
    const world = new LightingWorld(renderer, { width: 1024, height: 1024 });
    cleanup.push(() => world.destroy());
    world.update([], [torch], null);
    expect(world.animate(START)).toBe(true);
    return { renderer, world };
  }

  it('redraws a flickering light only once per flicker interval', async () => {
    const { world } = await setup();
    const draw = vi.spyOn(world.lightMap, 'draw');

    expect(world.animate(START + 8)).toBe(false);
    expect(world.animate(START + FLICKER_INTERVAL_MS - 1)).toBe(false);
    expect(draw).not.toHaveBeenCalled();

    expect(world.animate(START + FLICKER_INTERVAL_MS)).toBe(true);
    expect(draw).toHaveBeenCalledTimes(1);
    expect(world.animate(START + FLICKER_INTERVAL_MS + 8)).toBe(false);
    expect(world.busy()).toBe(true);
  });

  it('flickers the brightness and the bright radius of a light, never where it ends', async () => {
    const { world } = await setup();
    const draw = vi.spyOn(world.lightMap, 'draw');
    for (let frame = 1; frame <= 40; frame++) world.animate(START + frame * 2 * FLICKER_INTERVAL_MS);
    const drawn = draw.mock.calls.map(([lights]) => lights[0] as DrawnLight);
    expect(drawn).toHaveLength(40);
    expect(new Set(drawn.map((light) => light.intensity)).size).toBeGreaterThan(10);
    expect(new Set(drawn.map((light) => light.bright)).size).toBeGreaterThan(10);
    for (const light of drawn) {
      expect(light.dim).toBe(torch.dim);
      expect(light.reach).toBe(torch.dim * LIGHT_REACH);
    }
  });

  it('puts the flicker back at once after a moved light was redrawn steady', async () => {
    const { world } = await setup();
    const draw = vi.spyOn(world.lightMap, 'draw');

    world.update([], [{ ...torch, x: 320 }], null);
    expect(draw).toHaveBeenCalledTimes(1);
    expect(world.animate(START + 1)).toBe(true);
    expect(draw).toHaveBeenCalledTimes(2);
  });

  it('builds a dirty bounce when it is due, between flicker redraws too', async () => {
    const { world } = await setup();
    expect(world.animate(START + BOUNCE.throttleMs - 10)).toBe(true);
    const build = vi.spyOn(world.cascades, 'build');
    const draw = vi.spyOn(world.lightMap, 'draw');

    world.update([], [torch], Texture.WHITE);
    expect(world.animate(START + BOUNCE.throttleMs - 5)).toBe(false);
    expect(build).not.toHaveBeenCalled();

    expect(world.animate(START + BOUNCE.throttleMs)).toBe(true);
    expect(build).toHaveBeenCalledTimes(1);
    // Steady for the bounce, then flickering again
    expect(draw).toHaveBeenCalledTimes(2);
  });
});
