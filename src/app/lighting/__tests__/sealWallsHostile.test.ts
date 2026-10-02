import { describe, expect, it } from 'vitest';
import type { WallSegment } from '../../types/wallTypes';
import { sealWalls } from '../sealWalls';
import { TOLERANCE, key, random, wall } from './sealFixtures';

// Wall-clock bound of the timed tests here. Each input seals in 0.15 to 0.9 s run alone; before
// the fixes they guard (the tree's pivot, the eight directions along the diagonals, the capped
// bridges across passing walls) the same inputs took 3.5 to 18 s and made millions of bridges.
// The bound leaves a machine under load its room; the count of bridges is asserted beside it.
const SLOW = 15_000;

/**
 * Inputs made to be slow or to make bridges without end: ends along a diagonal, where no box
 * around them tells one direction from the next; strokes side by side, whose points come as
 * sorted runs; walls beyond counting that pass one end from every side; ends a hair outside
 * the tolerance of walls a hair apart. A foreign or damaged map may hold any of them, and a map
 * must open all the same.
 */
const SQRT2 = Math.SQRT2;
type Maker = () => WallSegment[];

/** `count` walls with both ends on the line through (500, 500) along (1, `slope`), within `span` px of it. */
const onLine = (count: number, span: number, slope: number) => (): WallSegment[] => {
  const rand = random(17);
  const at = (t: number): [number, number] => [500 + t / SQRT2, 500 + (t / SQRT2) * slope];
  return Array.from({ length: count }, (_, i) => wall(`d${i}`, ...at(rand() * span), ...at(rand() * span)));
};

/** A chain of `count` segments along the line through (cx, cy) along (1, `slope`), `span` px long. */
function chain(name: string, count: number, span: number, slope: number, cx = 500, cy = 500): WallSegment[] {
  const at = (i: number): [number, number] => [cx + ((i / count - 0.5) * span) / SQRT2, cy + (((i / count - 0.5) * span) / SQRT2) * slope];
  return Array.from({ length: count }, (_, i) => wall(`${name}${i}`, ...at(i), ...at(i + 1)));
}

/** Steps of a thousandth of a pixel, right and down in turn. */
function staircase(): WallSegment[] {
  return Array.from({ length: 20_000 }, (_, i) => {
    const [x, y] = [500 + Math.ceil(i / 2) * 0.001, 500 + Math.floor(i / 2) * 0.001];
    return i % 2 ? wall(`step${i}`, x, y, x, y + 0.001) : wall(`step${i}`, x, y, x + 0.001, y);
  });
}

/** 64 long walls tangent to a circle of ten pixels, and short walls with both ends on a diagonal in the half pixel at its middle. */
function tangents(): WallSegment[] {
  const rand = random(23);
  const long = Array.from({ length: 64 }, (_, k) => {
    const a = (k / 64) * Math.PI * 2, [fx, fy] = [500 + Math.cos(a) * 10, 500 + Math.sin(a) * 10];
    return wall(`tangent${k}`, fx - Math.sin(a) * 300, fy + Math.cos(a) * 300, fx + Math.sin(a) * 300, fy - Math.cos(a) * 300);
  });
  const short = Array.from({ length: 19_936 }, (_, i) => {
    const [s, t] = [rand() * 0.35, rand() * 0.35];
    return wall(`short${i}`, 500 + s, 500 + s, 500 + t, 500 + t);
  });
  return [...long, ...short];
}

/** 64 long walls on either side of a stretch of 300 px, each at its own slope, and short walls with their ends along that stretch. */
function bundle(): WallSegment[] {
  const rand = random(29);
  const long = Array.from({ length: 64 }, (_, k) => {
    const d = (k - 31.5) * 0.36, slope = d * 0.0008;
    return wall(`bundle${k}`, 300, 500 + d - slope * 350, 1000, 500 + d + slope * 350);
  });
  const short = Array.from({ length: 19_936 }, (_, i) => {
    const x = 500 + rand() * 300;
    return wall(`short${i}`, x, 500, x + rand() * 0.2, 500);
  });
  return [...long, ...short];
}

/** Long walls a hair apart, and as many stubs with both ends a millionth of a pixel beyond the tolerance of the nearest. */
const hairApart = (count: number) => (): WallSegment[] => {
  const long = Array.from({ length: count }, (_, i) => wall(`long${i}`, 0, 500 + i * 0.0001, 2400, 500 + i * 0.0001));
  const y = 500 - TOLERANCE - 1e-6;
  const stubs = Array.from({ length: count }, (_, i) => wall(`stub${i}`, 100 + i * 0.1, y, 100.04 + i * 0.1, y));
  return [...long, ...stubs];
};

const HOSTILE: [string, Maker][] = [
  ['ends on a diagonal in half a pixel inside 64 tangent walls', tangents],
  ['both ends of 20,000 walls on one diagonal in nine pixels', onLine(20_000, 9, 1)],
  ['the same on the other diagonal', onLine(20_000, 9, -1)],
  ['the same on a line a millionth off the diagonal', onLine(20_000, 9, 1.000001)],
  ['10,000 long walls a hair apart and 10,000 stubs a hair beyond their reach', hairApart(10_000)],
  ['20,000 of each', hairApart(20_000)],
  ['a staircase of 20,000 steps along a diagonal', staircase],
  ['64 long walls along 300 px and 19,936 short walls beside them', bundle],
  ['one chain of 60,000 segments on a diagonal in twelve pixels', () => chain('c', 60_000, 12, 1)],
  ['two chains of 30,000 crossing as an X', () => [...chain('a', 30_000, 12, 1), ...chain('b', 30_000, 12, -1)]],
  // Two sorted runs one after the other: the tree's quickselect took the middle point as its pivot, the least of what was left each time.
  ['two strokes of 90,000 segments side by side', () => [...chain('a', 90_000, 5000, 0, 2500, 500), ...chain('b', 90_000, 5000, 0, 2500, 520)]],
];

describe('sealWalls on hostile input', () => {
  const places = (walls: WallSegment[]): number => new Set(walls.flatMap((w) => [key(w.p1), key(w.p2)])).size;

  it.each(HOSTILE)('seals %s within the bound, with a bounded number of bridges', { timeout: 300_000 }, (name, make) => {
    const walls = make();
    const started = performance.now();
    const bridges = sealWalls(walls, TOLERANCE).length - walls.length;
    const ms = performance.now() - started;
    console.info(`sealWalls, ${name}: ${walls.length} walls, ${places(walls)} places, ${bridges} bridges, ${ms.toFixed(0)} ms`);
    expect(ms).toBeLessThan(SLOW);
    // At most eight bridges are begun at a place, eight more to the far ends of walls on their own, and sixteen across the walls that pass it.
    expect(bridges).toBeLessThanOrEqual(places(walls) * 32);
    // None of these makes more than a few bridges for each of its places.
    expect(bridges).toBeLessThan(places(walls) * 6);
  });
});
