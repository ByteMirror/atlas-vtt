import type { WebGLRenderer } from 'pixi.js';
import { afterEach, describe, expect, it } from 'vitest';
import type { Polygon } from '../../../../vision/visibility';
import { ExploredTexture } from '../../ExploredTexture';
import { createTestRenderer, readRgba } from './gpuTestUtils';

const SIZE = 64;
const p = (x: number, y: number): { x: number; y: number } => ({ x, y });
/** A right triangle whose hypotenuse runs diagonally through the map, x + y = 40. */
const TRIANGLE: Polygon = [p(0, 0), p(40, 0), p(0, 40)];
const EVERYTHING: Polygon = [p(-10, -10), p(SIZE + 10, -10), p(SIZE + 10, SIZE + 10), p(-10, SIZE + 10)];

describe('explored stamps', () => {
  const cleanup: (() => void)[] = [];
  afterEach(() => {
    while (cleanup.length) cleanup.pop()!();
  });

  async function stamped(polygons: Polygon[], clip: Polygon[] | null): Promise<(x: number, y: number) => number> {
    const renderer: WebGLRenderer = await createTestRenderer(SIZE);
    cleanup.push(() => renderer.destroy());
    const explored = new ExploredTexture(renderer, { width: SIZE, height: SIZE });
    cleanup.push(() => explored.destroy());
    explored.add({ polygons, clip });
    const pixels = readRgba(renderer, explored.texture);
    return (x, y) => pixels[(y * SIZE + x) * 4]!;
  }

  it('draws a diagonal edge anti-aliased', async () => {
    const at = await stamped([TRIANGLE], null);
    expect(at(5, 5)).toBe(255);
    expect(at(60, 60)).toBe(0);
    let partial = 0;
    for (let x = 0; x < 40; x++) {
      for (const y of [39 - x, 40 - x]) if (y >= 0 && y < SIZE && at(x, y) > 20 && at(x, y) < 235) partial++;
    }
    expect(partial).toBeGreaterThanOrEqual(30);
  });

  it('writes nothing outside the clip', async () => {
    const at = await stamped([EVERYTHING], [[p(0, 0), p(20, 0), p(20, SIZE), p(0, SIZE)]]);
    expect(at(10, 30)).toBe(255);
    for (let x = 22; x < SIZE; x++) for (let y = 0; y < SIZE; y += 7) expect(at(x, y)).toBe(0);
  });

  it('saves the smooth edge through toCanvas', async () => {
    const renderer = await createTestRenderer(SIZE);
    cleanup.push(() => renderer.destroy());
    const explored = new ExploredTexture(renderer, { width: SIZE, height: SIZE });
    cleanup.push(() => explored.destroy());
    explored.add({ polygons: [TRIANGLE], clip: null });
    const canvas = explored.toCanvas();
    const data = canvas.getContext('2d')!.getImageData(0, 0, SIZE, SIZE).data;
    expect(data[(5 * SIZE + 5) * 4]).toBe(255);
    const edge = data[(20 * SIZE + 19) * 4]!;
    expect(edge).toBeGreaterThan(0);
    expect(edge).toBeLessThan(255);
  });

  it('only ever grows', async () => {
    const renderer = await createTestRenderer(SIZE);
    cleanup.push(() => renderer.destroy());
    const explored = new ExploredTexture(renderer, { width: SIZE, height: SIZE });
    cleanup.push(() => explored.destroy());
    explored.add({ polygons: [TRIANGLE], clip: null });
    const before = readRgba(renderer, explored.texture).slice();
    explored.add({ polygons: [[p(50, 50), p(60, 50), p(60, 60)]], clip: null });
    const after = readRgba(renderer, explored.texture);
    for (let i = 0; i < before.length; i += 4) expect(after[i]!).toBeGreaterThanOrEqual(before[i]!);
  });
});
