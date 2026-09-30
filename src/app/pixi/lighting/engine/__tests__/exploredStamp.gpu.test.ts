import { Container, Graphics, Matrix, RenderTexture, type WebGLRenderer } from 'pixi.js';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { ExploredShapes } from '../../../../vision/exploredShapes';
import type { Polygon } from '../../../../vision/visibility';
import { ExploredTexture } from '../../ExploredTexture';
import { StampScratch, TILE } from '../../StampScratch';
import { saveExploredMask } from '../../exploredMaskSaving';
import { createTestRenderer, readRgba } from './gpuTestUtils';

const SIZE = 64;
const p = (x: number, y: number): { x: number; y: number } => ({ x, y });
/** A right triangle whose hypotenuse runs diagonally through the map, x + y = 40. */
const TRIANGLE: Polygon = [p(0, 0), p(40, 0), p(0, 40)];
/** A triangle whose edges cross the first one's hypotenuse, so both are partial where they overlap. */
const OTHER: Polygon = [p(10, 25), p(25, 10), p(50, 50)];
const EVERYTHING: Polygon = [p(-10, -10), p(SIZE + 10, -10), p(SIZE + 10, SIZE + 10), p(-10, SIZE + 10)];
const rect = (x0: number, y0: number, x1: number, y1: number): Polygon => [p(x0, y0), p(x1, y0), p(x1, y1), p(x0, y1)];
const stamp = (polygon: Polygon, clip: Polygon[] | null = null): ExploredShapes => ({ polygons: [polygon], clip });

/** The red channel of every texel, top row first. */
type Reds = (x: number, y: number) => number;

describe('explored stamps', () => {
  const cleanup: (() => void)[] = [];
  afterEach(() => {
    while (cleanup.length) cleanup.pop()!();
    vi.unstubAllGlobals();
  });

  async function memory(size = SIZE): Promise<{ renderer: WebGLRenderer; explored: ExploredTexture }> {
    const renderer = await createTestRenderer(SIZE);
    cleanup.push(() => renderer.destroy());
    const explored = new ExploredTexture(renderer, { width: size, height: size });
    cleanup.push(() => explored.destroy());
    return { renderer, explored };
  }

  function reds(renderer: WebGLRenderer, explored: ExploredTexture): Reds {
    const { pixels } = renderer.extract.pixels({ target: explored.texture });
    const width = explored.texture.width;
    return (x, y) => pixels[(y * width + x) * 4]!;
  }

  async function stamped(shapes: ExploredShapes[]): Promise<Reds> {
    const { renderer, explored } = await memory();
    for (const s of shapes) explored.add(s);
    return reds(renderer, explored);
  }

  /** Texels along the hypotenuse x + y = 40 with a value strictly between empty and full. */
  function partialAlongHypotenuse(at: Reds): number {
    let partial = 0;
    for (let x = 0; x < 40; x++) {
      for (const y of [39 - x, 40 - x]) if (y >= 0 && y < SIZE && at(x, y) > 20 && at(x, y) < 235) partial++;
    }
    return partial;
  }

  it('draws a diagonal edge anti-aliased', async () => {
    const at = await stamped([stamp(TRIANGLE)]);
    expect(at(5, 5)).toBe(255);
    expect(at(60, 60)).toBe(0);
    expect(partialAlongHypotenuse(at)).toBeGreaterThanOrEqual(30);
  });

  it('places a stamp exactly where it is, however far from the origin', async () => {
    const at = await stamped([stamp(rect(40, 44, 50, 52))]);
    expect(at(45, 48)).toBe(255);
    expect(at(39, 48)).toBe(0);
    expect(at(51, 48)).toBe(0);
    expect(at(45, 43)).toBe(0);
    expect(at(45, 53)).toBe(0);
    expect(at(5, 5)).toBe(0);
  });

  it('stamps correctly after a large stamp and a small one reuse its scratch', async () => {
    const at = await stamped([stamp(EVERYTHING), stamp(rect(1, 1, 3, 3)), stamp(rect(60, 60, 62, 62))]);
    expect(at(2, 2)).toBe(255);
    expect(at(61, 61)).toBe(255);
    expect(at(30, 30)).toBe(255);
  });

  it('maps a large map down to its texels', async () => {
    const { renderer, explored } = await memory(4096);
    expect(explored.texture.width).toBe(2048);
    explored.add(stamp(rect(1000, 1000, 2000, 2000)));
    const at = reds(renderer, explored);
    expect(at(750, 750)).toBe(255);
    expect(at(498, 750)).toBe(0);
    expect(at(1002, 750)).toBe(0);
  });

  it('draws a map-sized stamp without seams between tiles', async () => {
    const map = 4096;
    const big: Polygon = [p(-50, -50), p(map * 0.9, -50), p(map + 50, map * 0.6), p(map * 0.4, map + 50), p(-50, map * 0.8)];
    const { renderer, explored } = await memory(map);
    explored.add(stamp(big));
    const tiled = reds(renderer, explored);

    const reference = RenderTexture.create({ width: 2048, height: 2048, antialias: true });
    cleanup.push(() => reference.destroy(true));
    const g = new Graphics().poly(big.flatMap((v) => [v.x, v.y])).fill({ color: 0xffffff });
    const root = new Container();
    root.addChild(g);
    renderer.render({ container: root, target: reference, clear: true, clearColor: [0, 0, 0, 0], transform: new Matrix().scale(0.5, 0.5) });
    root.destroy({ children: true });
    const { pixels } = renderer.extract.pixels({ target: reference });

    // Tiles shift the vertices by whole texels in floating point, so an edge texel can land
    // on the other side of one of its four samples: at most one sample (64) and rarely.
    const ONE_SAMPLE = 64;
    let partial = 0;
    let off = 0;
    for (let y = 0; y < 2048; y++) {
      for (let x = 0; x < 2048; x++) {
        const expected = pixels[(y * 2048 + x) * 4]!;
        const error = Math.abs(tiled(x, y) - expected);
        if (expected > 0 && expected < 255) partial++;
        if (error > 1) off++;
        expect(error).toBeLessThanOrEqual(ONE_SAMPLE);
      }
    }
    expect(partial).toBeGreaterThan(2000);
    expect(off).toBeLessThan(partial / 100);

    // A seam would show as a line of errors along the tile border: compare the texels on both sides.
    for (const seam of [TILE, 2 * TILE, 3 * TILE]) {
      let error = 0;
      for (let y = 0; y < 2048; y++) {
        error += Math.abs(tiled(seam - 1, y) - pixels[(y * 2048 + seam - 1) * 4]!);
        error += Math.abs(tiled(seam, y) - pixels[(y * 2048 + seam) * 4]!);
      }
      expect(error / 4096).toBeLessThan(0.5);
    }
  });

  it('keeps one fixed scratch however large or small the stamps are', async () => {
    const renderer = await createTestRenderer(SIZE);
    cleanup.push(() => renderer.destroy());
    const scratch = new StampScratch(renderer);
    cleanup.push(() => scratch.destroy());
    const sizes: number[] = [];
    for (const polygon of [rect(0, 0, 4000, 4000), rect(1, 1, 3, 3), rect(0, 0, 900, 900), rect(5, 5, 6, 6)]) {
      scratch.begin(stamp(polygon));
      const target = scratch.renderTile(1, 0, 0);
      sizes.push(target.width, target.height);
    }
    expect(sizes.every((side) => side === TILE)).toBe(true);
  });

  it('writes nothing outside the clip and smooths the clip edge', async () => {
    const at = await stamped([stamp(EVERYTHING, [TRIANGLE])]);
    expect(at(5, 5)).toBe(255);
    expect(partialAlongHypotenuse(at)).toBeGreaterThanOrEqual(30);
    for (let x = 0; x < SIZE; x++) for (let y = 0; y < SIZE; y++) if (x + y >= 42) expect(at(x, y)).toBe(0);
  });

  it('keeps the larger of overlapping stamps texel by texel', async () => {
    const first = await stamped([stamp(TRIANGLE)]);
    const second = await stamped([stamp(OTHER)]);
    const both = await stamped([stamp(TRIANGLE), stamp(OTHER)]);
    const reversed = await stamped([stamp(OTHER), stamp(TRIANGLE)]);
    let overlapped = 0;
    for (let x = 0; x < SIZE; x++) {
      for (let y = 0; y < SIZE; y++) {
        const expected = Math.max(first(x, y), second(x, y));
        if (first(x, y) > 0 && second(x, y) > 0) overlapped++;
        expect(Math.abs(both(x, y) - expected)).toBeLessThanOrEqual(1);
        expect(Math.abs(reversed(x, y) - expected)).toBeLessThanOrEqual(1);
      }
    }
    expect(overlapped).toBeGreaterThan(50);
  });

  it('does not thicken an edge by stamping it again', async () => {
    const once = await stamped([stamp(TRIANGLE)]);
    const twice = await stamped([stamp(TRIANGLE), stamp(TRIANGLE)]);
    const nudged = await stamped([stamp(TRIANGLE), stamp([p(0, 0), p(40.4, 0), p(0, 40.4)])]);
    const nudgedAlone = await stamped([stamp([p(0, 0), p(40.4, 0), p(0, 40.4)])]);
    for (let x = 0; x < SIZE; x++) {
      for (let y = 0; y < SIZE; y++) {
        expect(Math.abs(twice(x, y) - once(x, y))).toBeLessThanOrEqual(1);
        expect(Math.abs(nudged(x, y) - Math.max(once(x, y), nudgedAlone(x, y)))).toBeLessThanOrEqual(1);
      }
    }
  });

  it('forgets everything on clear', async () => {
    const { renderer, explored } = await memory();
    explored.add(stamp(EVERYTHING));
    expect(reds(renderer, explored)(10, 10)).toBe(255);
    explored.clear();
    const at = reds(renderer, explored);
    for (let x = 0; x < SIZE; x++) for (let y = 0; y < SIZE; y += 5) expect(at(x, y)).toBe(0);
  });

  it('keeps an anti-aliased edge through repeated saves and loads', async () => {
    vi.stubGlobal('createEl', (tag: string, options?: { attr?: Record<string, string> }): HTMLElement => {
      const el = document.createElement(tag);
      for (const [name, value] of Object.entries(options?.attr ?? {})) el.setAttribute(name, value);
      return el;
    });
    const { renderer, explored } = await memory();
    explored.add(stamp(TRIANGLE));
    const original = reds(renderer, explored);
    expect(partialAlongHypotenuse(original)).toBeGreaterThanOrEqual(30);

    let current = explored;
    for (let cycle = 0; cycle < 3; cycle++) {
      const next = new ExploredTexture(renderer, { width: SIZE, height: SIZE });
      cleanup.push(() => next.destroy());
      await next.load(saveExploredMask(current.toCanvas()));
      current = next;
    }
    const restored = reds(renderer, current);
    for (let x = 0; x < SIZE; x++) for (let y = 0; y < SIZE; y++) expect(Math.abs(restored(x, y) - original(x, y))).toBeLessThanOrEqual(2);
  });
});
