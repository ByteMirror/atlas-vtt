import { Container, Graphics, Matrix, RenderTexture, Sprite, Texture, type WebGLRenderer } from 'pixi.js';
import { afterEach, describe, expect, it } from 'vitest';
import type { Sight } from '../../../../vision/sight';
import { LightingEngine } from '../LightingEngine';
import { createTestRenderer, readRgba } from './gpuTestUtils';

const SIZE = 256;
const SCALE = 4;
const MAP = 1024;
/** World pixels per texel of the explored memory, as on a map of about 4,500 px. */
const EXPLORED_TEXEL = 2;
/** The memory covers x < EDGE. */
const EDGE = 512;
const NOTHING_SEEN: Sight = { all: false, polygons: [], origins: [], darkvision: [], darkvisionOrigins: [] };

describe('explored memory', () => {
  const cleanup: (() => void)[] = [];
  afterEach(() => {
    while (cleanup.length) cleanup.pop()!();
  });

  function exploredLeftOf(renderer: WebGLRenderer, x: number): RenderTexture {
    const texture = RenderTexture.create({ width: MAP / EXPLORED_TEXEL, height: MAP / EXPLORED_TEXEL });
    const g = new Graphics().rect(0, 0, x / EXPLORED_TEXEL, MAP / EXPLORED_TEXEL).fill({ color: 0xffffff });
    renderer.render({ container: g, target: texture, clear: true, clearColor: [0, 0, 0, 0] });
    g.destroy();
    return texture;
  }

  it('fades out smoothly over more than a texel of the memory', async () => {
    const renderer = await createTestRenderer(SIZE);
    cleanup.push(() => renderer.destroy());
    const engine = new LightingEngine(renderer);
    cleanup.push(() => engine.destroy());
    const explored = exploredLeftOf(renderer, EDGE);
    cleanup.push(() => explored.destroy(true));
    engine.setEnabled(true);
    engine.setMode('player');
    engine.setExplored(explored);
    engine.update({ bounds: { width: MAP, height: MAP }, albedo: null, walls: [], lights: [], sight: NOTHING_SEEN, sightRadius: 20, ambient: 1 });
    engine.flush();

    const ox = SIZE / 2 - EDGE * SCALE, oy = SIZE / 2 - 300 * SCALE;
    const stage = new Container();
    const map = new Sprite(Texture.WHITE);
    map.setSize(MAP, MAP);
    const world = new Container();
    world.addChild(map, engine.layer);
    world.scale.set(SCALE);
    world.position.set(ox, oy);
    stage.addChild(world);
    engine.setView(new Matrix(SCALE, 0, 0, SCALE, ox, oy).invert(), SCALE);
    const target = RenderTexture.create({ width: SIZE, height: SIZE });
    renderer.render({ container: stage, target, clear: true });
    const pixels = readRgba(renderer, target);
    world.removeChild(engine.layer);
    stage.destroy({ children: true });
    target.destroy(true);

    const row = SIZE / 2;
    const profile = Array.from({ length: SIZE }, (_, sx) => pixels[(row * SIZE + sx) * 4]!);
    const peak = profile[0]!;
    expect(peak).toBeGreaterThan(40);
    expect(profile[SIZE - 1]).toBe(0);
    // Monotonic down to the dither's one level.
    for (let sx = 1; sx < SIZE; sx++) expect(profile[sx]!).toBeLessThanOrEqual(profile[sx - 1]! + 1);
    const between = profile.filter((v) => v > 1 && v < peak - 1).length;
    expect(between / SCALE).toBeGreaterThanOrEqual(2 * EXPLORED_TEXEL);
  });
});
