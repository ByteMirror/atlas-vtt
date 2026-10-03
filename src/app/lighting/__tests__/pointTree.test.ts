import { describe, expect, it } from 'vitest';
import { PointTree, steeper } from '../pointTree';
import { random } from './sealFixtures';

type Cloud = (rand: () => number, count: number) => [number, number][];

/** Points as maps crowd them: anywhere, in a heap, along the diagonals (where the eight directions meet), on a grid, and many at one place. */
const CLOUDS: Record<string, Cloud> = {
  anywhere: (rand, count) => Array.from({ length: count }, () => [rand() * 200, rand() * 200]),
  heap: (rand, count) => Array.from({ length: count }, () => [100 + rand() * 9, 100 + rand() * 9]),
  diagonal: (rand, count) => Array.from({ length: count }, () => {
    const t = rand() * 40;
    return [100 + t, 100 + t];
  }),
  otherDiagonal: (rand, count) => Array.from({ length: count }, () => {
    const t = rand() * 40;
    return [100 + t, 100 - t];
  }),
  cross: (rand, count) => Array.from({ length: count }, (_, i) => {
    const t = Math.floor(rand() * 80) * 0.25 - 10;
    return i % 2 ? [100 + t, 100 + t] : [100 + t, 100 - t];
  }),
  grid: (rand, count) => Array.from({ length: count }, () => [100 + Math.floor(rand() * 12), 100 + Math.floor(rand() * 12)]),
  nearlyDiagonal: (rand, count) => Array.from({ length: count }, () => {
    const t = rand() * 40;
    return [100 + t, 100 + t * 1.000001];
  }),
};

const directionOf = (px: number, py: number, x: number, y: number): number => (px < x ? 4 : 0) + (py < y ? 2 : 0) + (steeper(px, py, x, y, px < x, py < y) ? 1 : 0);

describe('PointTree against looking at every point', () => {
  it.each(Object.keys(CLOUDS))('finds the nearest point in each of eight directions: %s', (name) => {
    let asked = 0, found = 0;
    for (let seed = 1; seed <= 12; seed++) {
      const rand = random(seed * 977 + name.length);
      const points = CLOUDS[name]!(rand, 20 + Math.floor(rand() * 1500));
      const xs = Float64Array.from(points, (p) => p[0]), ys = Float64Array.from(points, (p) => p[1]);
      const tree = new PointTree(xs, ys);
      const nearest = new Int32Array(8), distances = new Float64Array(8);
      for (let query = 0; query < 120; query++) {
        const [x, y] = rand() < 0.7 ? points[Math.floor(rand() * points.length)]! : [100 + rand() * 40, 100 + rand() * 40];
        const radius = 0.5 + rand() * 20;
        const skipped = rand() < 0.3 ? Math.floor(rand() * points.length) : -1;
        tree.nearestByDirection(x, y, radius, (index) => index === skipped, nearest, distances);
        const expected = new Array<number>(8).fill(-1);
        const best = new Array<number>(8).fill(Infinity);
        points.forEach(([px, py], index) => {
          const d2 = (px - x) ** 2 + (py - y) ** 2;
          if (d2 === 0 || Math.hypot(px - x, py - y) > radius || index === skipped) return;
          const direction = directionOf(px, py, x, y);
          if (d2 < best[direction]!) {
            best[direction] = d2;
            expected[direction] = index;
          }
        });
        asked++;
        found += expected.filter((index) => index >= 0).length;
        expect([name, seed, query, [...nearest]]).toEqual([name, seed, query, expected]);
      }
    }
    expect(asked).toBe(1440);
    expect(found).toBeGreaterThan(1440);
  });

  it('tells the two directions of a quarter apart as |dx| against |dy| does, away from the diagonals', () => {
    const rand = random(5);
    for (let i = 0; i < 20_000; i++) {
      const [x, y, px, py] = [rand() * 500, rand() * 500, rand() * 500, rand() * 500];
      const [dx, dy] = [px - x, py - y];
      if (Math.abs(Math.abs(dx) - Math.abs(dy)) < 1e-6) continue;
      expect(steeper(px, py, x, y, dx < 0, dy < 0)).toBe(Math.abs(dx) < Math.abs(dy));
    }
  });

  it('counts a point at the very radius as `Math.hypot` does, whichever way its square falls in the last bit', () => {
    // Distances that are the radius to the last bit or one off it: a point at 3-4-5 times a factor, measured from the origin.
    let onTheEdge = 0;
    const rand = random(99);
    for (let i = 0; i < 4000; i++) {
      const factor = rand() * 7 + 0.01;
      const [px, py] = [3 * factor, 4 * factor];
      const radius = Math.hypot(px, py) * (1 + (Math.floor(rand() * 3) - 1) * 1.1e-16);
      const tree = new PointTree(Float64Array.of(px, 100), Float64Array.of(py, 100));
      const found: number[] = [];
      tree.within(0, 0, radius, (index) => {
        found.push(index);
        return false;
      });
      const nearest = new Int32Array(8), distances = new Float64Array(8);
      tree.nearestByDirection(0, 0, radius, () => false, nearest, distances);
      const inside = Math.hypot(px, py) <= radius;
      if (px * px + py * py <= radius * radius !== inside) onTheEdge++;
      expect([i, found, nearest.includes(0)]).toEqual([i, inside ? [0] : [], inside]);
    }
    // The square and the root disagree on some of them: the check can tell the two apart.
    expect(onTheEdge).toBeGreaterThan(0);
  });

  it('finds every point within a radius, and those beside a segment', () => {
    for (const name of Object.keys(CLOUDS)) {
      const rand = random(name.length * 131);
      const points = CLOUDS[name]!(rand, 900);
      const xs = Float64Array.from(points, (p) => p[0]), ys = Float64Array.from(points, (p) => p[1]);
      const tree = new PointTree(xs, ys);
      for (let query = 0; query < 60; query++) {
        const [x, y] = points[Math.floor(rand() * points.length)]!;
        const radius = 0.5 + rand() * 15;
        const within: number[] = [];
        tree.within(x, y, radius, (index) => {
          within.push(index);
          return false;
        });
        expect(within.sort((a, b) => a - b)).toEqual(points.flatMap(([px, py], index) => (Math.hypot(px - x, py - y) <= radius ? [index] : [])));
        const a = { x: 90 + rand() * 60, y: 90 + rand() * 60 }, b = { x: 90 + rand() * 60, y: 90 + rand() * 60 };
        const beside: number[] = [];
        new PointTree(xs, ys).beside(a, b, radius, new Uint8Array(points.length), (index) => beside.push(index));
        const [dx, dy] = [b.x - a.x, b.y - a.y];
        const expected = points.flatMap(([px, py], index) => {
          const along = (px - a.x) * dx + (py - a.y) * dy, cross = (px - a.x) * dy - (py - a.y) * dx;
          const off = Math.abs(cross) / Math.hypot(dx, dy);
          const clear = Math.hypot(px - a.x, py - a.y) > radius && Math.hypot(px - b.x, py - b.y) > radius;
          // A point on the very edge of the reach may fall either way in the last bit.
          return along > 0 && along < dx * dx + dy * dy && clear && off <= radius * (1 - 1e-9) ? [index] : [];
        });
        expect(expected.filter((index) => !beside.includes(index))).toEqual([]);
        expect(beside.length).toBeLessThanOrEqual(expected.length + 3);
      }
    }
  });
});
