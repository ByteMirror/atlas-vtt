import { Graphics, RenderTexture, type WebGLRenderer } from 'pixi.js';
import { afterEach, describe, expect, it } from 'vitest';
import type { WallSegment } from '../../../../types/wallTypes';
import { computeSight } from '../../../../vision/sight';
import type { Polygon } from '../../../../vision/visibility';
import { LightingEngine } from '../LightingEngine';
import type { LightingMode } from '../compositeFilter';
import type { EngineLight, EngineScene } from '../types';
import { createTestRenderer, renderThroughEngine, type PixelReader } from './gpuTestUtils';

const SIZE = 512;
const MAP = 1024;
/** The whole map on screen: one screen pixel is two world pixels. */
const camera = { size: SIZE, scale: SIZE / MAP, x: 0, y: 0, tint: 0x6699cc };
const torch: EngineLight = { key: 'torch', x: 300, y: 500, bright: 80, dim: 160, flame: 10, color: [1, 1, 1], intensity: 1, animation: 'none' };
/** A wall right of the viewer: what lies behind it is out of sight. */
const walls: WallSegment[] = [{ id: 'w', kind: 'wall', type: 'solid', p1: { x: 640, y: 300 }, p2: { x: 640, y: 700 } }];
/** A party token with normal sight only, which sees 700 px far. */
const sight = computeSight([{ tokenId: 't', origin: { x: 500, y: 500 }, range: 700, senses: [] }], walls);
const UNEXPLORED = '#336699';

/** World points: in sight and dark, remembered (the left half is) and not; behind the wall, remembered and not; in the torch's light. */
const DARK_REMEMBERED = { x: 400, y: 850 };
const DARK_UNEXPLORED = { x: 600, y: 850 };
const HIDDEN_UNEXPLORED = { x: 800, y: 500 };
const LIT = { x: 300, y: 520 };

describe('explored memory inside line of sight', () => {
  const cleanup: (() => void)[] = [];
  afterEach(() => {
    while (cleanup.length) cleanup.pop()!();
  });

  /** A memory of `polygons` (world pixels), at half the map's size. */
  function memoryOf(renderer: WebGLRenderer, polygons: Polygon[]): RenderTexture {
    const texture = RenderTexture.create({ width: MAP / 2, height: MAP / 2 });
    const g = new Graphics();
    for (const polygon of polygons) g.poly(polygon.flatMap((p) => [p.x / 2, p.y / 2])).fill({ color: 0xffffff });
    renderer.render({ container: g, target: texture, clear: true, clearColor: [0, 0, 0, 0] });
    g.destroy();
    return texture;
  }

  const LEFT_HALF: Polygon = [{ x: 0, y: 0 }, { x: 512, y: 0 }, { x: 512, y: MAP }, { x: 0, y: MAP }];

  async function render(remembered: Polygon[], scene: Partial<EngineScene> = {}, mode: LightingMode = 'player'): Promise<(point: { x: number; y: number }) => readonly [number, number, number]> {
    const renderer = await createTestRenderer(SIZE);
    cleanup.push(() => renderer.destroy());
    const explored = memoryOf(renderer, remembered);
    cleanup.push(() => explored.destroy(true));
    const engine = new LightingEngine(renderer);
    cleanup.push(() => engine.destroy());
    engine.setEnabled(true);
    engine.setMode(mode);
    engine.setExplored(explored);
    engine.update({ bounds: { width: MAP, height: MAP }, albedo: null, walls, lights: [torch], sight, sightRadius: 20, ambient: 0, unexploredColor: UNEXPLORED, ...scene });
    engine.flush();
    const at: PixelReader = renderThroughEngine(engine, renderer, camera);
    return (point) => at(Math.floor(point.x * camera.scale), Math.floor(point.y * camera.scale));
  }

  const near = (a: readonly number[], b: readonly number[], by = 2): boolean => a.every((channel, i) => Math.abs(channel - b[i]!) <= by);
  const sum = (pixel: readonly number[]): number => pixel[0]! + pixel[1]! + pixel[2]!;

  it('shows what is remembered where the party sees no light, and the unexplored colour where nothing is', async () => {
    const at = await render([LEFT_HALF]);
    // The remembered look, as it shows out of sight: the dim grey map.
    const memory = (await render([LEFT_HALF], { sight: computeSight([{ tokenId: 't', origin: { x: 500, y: 500 }, range: 100, senses: [] }], walls) }))(DARK_REMEMBERED);
    expect(sum(memory)).toBeGreaterThan(40);
    expect(near(at(DARK_REMEMBERED), memory)).toBe(true);
    // Never explored: the scene's unexplored colour, in sight as out of it.
    expect(near(at(DARK_UNEXPLORED), [0x33, 0x66, 0x99], 1)).toBe(true);
    expect(near(at(HIDDEN_UNEXPLORED), [0x33, 0x66, 0x99], 1)).toBe(true);
  });

  it('leaves what is lit as it is, and fades a light\'s rim into the memory beneath it without a seam', async () => {
    const at = await render([LEFT_HALF]);
    const plain = await render([LEFT_HALF], { exploredMemory: false, unexploredColor: '#000000' });
    expect(at(LIT)).toEqual(plain(LIT));
    expect(sum(at(LIT))).toBeGreaterThan(300);
    // From the torch outwards the picture only ever darkens, down to the memory: no dip to black between light and memory.
    const memory = sum(at({ x: 300, y: 760 }));
    expect(memory).toBeGreaterThan(40);
    let last = Infinity;
    for (let y = 520; y <= 760; y += 2) {
      const now = sum(at({ x: 300, y }));
      expect([y, now <= last + 3, now >= memory - 3]).toEqual([y, true, true]);
      last = now;
    }
  });

  it('draws no line along the edge of a shadow: no pixel there differs from both sides', async () => {
    // What the token sees now is exactly what is remembered, as after standing here a while.
    const seenNow = sight.regions[0]!.polygon!;
    // Never explored is black here, so a grey line between the dark in sight and the dark behind the wall would show.
    const at = await render([seenNow], { lights: [], unexploredColor: '#000000' });
    const inside = at({ x: 560, y: 760 });
    const outside = at({ x: 760, y: 760 });
    expect(sum(inside)).toBeGreaterThan(40);
    expect(sum(outside)).toBeLessThan(10);
    // Across the shadow the wall's lower end casts, at three distances from it.
    for (const y of [740, 800, 860]) {
      for (let x = 560; x <= 760; x += 2) {
        const pixel = at({ x, y });
        pixel.forEach((channel, i) => {
          expect([x, y, channel >= Math.min(inside[i]!, outside[i]!) - 2 && channel <= Math.max(inside[i]!, outside[i]!) + 2]).toEqual([x, y, true]);
        });
      }
    }
  });

  it('shows the scene as before with explored memory off, with token vision off, and to the GM', async () => {
    const off = await render([LEFT_HALF], { exploredMemory: false });
    // In sight and dark: black, as the light shows it; out of sight: the unexplored colour.
    expect(sum(off(DARK_REMEMBERED))).toBeLessThan(10);
    expect(sum(off(DARK_UNEXPLORED))).toBeLessThan(10);
    expect(near(off(HIDDEN_UNEXPLORED), [0x33, 0x66, 0x99], 1)).toBe(true);
    const all = await render([LEFT_HALF], { sight: { all: true, regions: [] } });
    expect(sum(all(DARK_REMEMBERED))).toBeLessThan(10);
    expect(sum(all(HIDDEN_UNEXPLORED))).toBeLessThan(10);
    const gm = await render([LEFT_HALF], {}, 'gm');
    const gmNoMemory = await render([], { exploredMemory: false }, 'gm');
    for (const point of [DARK_REMEMBERED, DARK_UNEXPLORED, HIDDEN_UNEXPLORED, LIT]) expect(gm(point)).toEqual(gmNoMemory(point));
  });

  it('shows what is remembered under magical darkness as without it: where nothing lit is swallowed no veil gives the darkness away', async () => {
    const darkness: EngineLight = { key: 'darkness', x: 400, y: 850, bright: 0, dim: 80, flame: 1, color: [1, 1, 1], intensity: 1, animation: 'none', darkness: true };
    // A room with no light at all: nothing lit for the darkness to swallow.
    const at = await render([LEFT_HALF], { lights: [darkness] });
    const plain = await render([LEFT_HALF], { lights: [] });
    expect(sum(plain(DARK_REMEMBERED))).toBeGreaterThan(40);
    // Over the whole darkness and past its edge, on remembered floor and on unexplored floor (right of x = 512).
    for (let x = darkness.x - 90; x <= darkness.x + 130; x += 10) {
      for (let y = darkness.y - 90; y <= darkness.y + 90; y += 10) expect([x, y, at({ x, y })]).toEqual([x, y, plain({ x, y })]);
    }
  });
});
