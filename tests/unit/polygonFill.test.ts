import { describe, expect, it } from 'vitest';
import { filledPieces } from '../../src/app/lighting/polygonFill';
import type { Point } from '../../src/app/types/visionTypes';

const p = (x: number, y: number): Point => ({ x, y });

/** How often `outline` winds around `point`: what the nonzero rule fills is where this is not 0. */
function windingAt(outline: readonly Point[], point: Point): number {
  let winding = 0;
  outline.forEach((a, i) => {
    const b = outline[(i + 1) % outline.length]!;
    const side = (b.x - a.x) * (point.y - a.y) - (point.x - a.x) * (b.y - a.y);
    if (a.y <= point.y && b.y > point.y && side > 0) winding++;
    else if (a.y > point.y && b.y <= point.y && side < 0) winding--;
  });
  return winding;
}

/** Whether a convex piece, given by its corners in order, holds the point. */
function holds(piece: readonly Point[], point: Point): boolean {
  let sign = 0;
  for (let i = 0; i < piece.length; i++) {
    const a = piece[i]!, b = piece[(i + 1) % piece.length]!;
    const side = (b.x - a.x) * (point.y - a.y) - (point.x - a.x) * (b.y - a.y);
    if (side === 0) continue;
    if (sign !== 0 && Math.sign(side) !== sign) return false;
    sign = Math.sign(side);
  }
  return true;
}

function area(piece: readonly Point[]): number {
  return Math.abs(piece.reduce((sum, a, i) => {
    const b = piece[(i + 1) % piece.length]!;
    return sum + a.x * b.y - b.x * a.y;
  }, 0)) / 2;
}

const total = (pieces: Point[][]): number => pieces.reduce((sum, piece) => sum + area(piece), 0);

/** Points on a grid shifted off every corner and edge of the test outlines. */
function samples(size: number, step: number): Point[] {
  const points: Point[] = [];
  for (let y = 0.37; y < size; y += step) for (let x = 0.41; x < size; x += step) points.push(p(x, y));
  return points;
}

/** Every sample is in exactly one piece where the outline fills, and in none where it does not. */
function expectFillsLike(outline: Point[], size = 100, step = 2.3): void {
  const pieces = filledPieces(outline);
  for (const point of samples(size, step)) {
    const within = pieces.filter((piece) => holds(piece, point)).length;
    expect(within, `at ${point.x}, ${point.y}`).toBe(windingAt(outline, point) === 0 ? 0 : 1);
  }
}

describe('filledPieces', () => {
  it('fills a rectangle and a triangle as they are', () => {
    const square = [p(10, 10), p(60, 10), p(60, 40), p(10, 40)];
    expect(total(filledPieces(square))).toBeCloseTo(1500, 6);
    expectFillsLike(square);
    const triangle = [p(10, 10), p(90, 30), p(40, 80)];
    expect(total(filledPieces(triangle))).toBeCloseTo(area(triangle), 6);
    expectFillsLike(triangle);
  });

  it('fills an outline whichever way round it was drawn', () => {
    const square = [p(10, 10), p(60, 10), p(60, 40), p(10, 40)];
    expect(total(filledPieces([...square].reverse()))).toBeCloseTo(1500, 6);
    expectFillsLike([...square].reverse());
  });

  it('fills a hollow shape around its notch, not across it', () => {
    // A U: the notch between its arms stays empty.
    const u = [p(10, 10), p(30, 10), p(30, 60), p(60, 60), p(60, 10), p(80, 10), p(80, 80), p(10, 80)];
    expect(total(filledPieces(u))).toBeCloseTo(70 * 70 - 30 * 50, 6);
    expectFillsLike(u);
  });

  it('fills both loops of an outline that crosses itself', () => {
    // A figure of eight: the path crosses at (50, 50).
    const eight = [p(10, 10), p(90, 90), p(90, 10), p(10, 90)];
    expect(total(filledPieces(eight))).toBeCloseTo(2 * (80 * 40) / 2, 6);
    expectFillsLike(eight);
  });

  it('fills ground the outline goes around twice once, as a canvas does', () => {
    // Twice around the same square, the second round a little larger.
    const twice = [p(20, 20), p(70, 20), p(70, 70), p(20, 70), p(20, 15), p(80, 15), p(80, 80), p(15, 80), p(15, 20)];
    expectFillsLike(twice);
    const pieces = filledPieces(twice);
    expect(pieces.filter((piece) => holds(piece, p(45.3, 45.7)))).toHaveLength(1);
  });

  it('fills a lasso whose end overshoots its start, without anything far from the outline', () => {
    // A loop that crosses its own beginning before the hand lets go.
    const lasso = [p(30, 20), p(70, 20), p(80, 50), p(60, 80), p(30, 75), p(20, 45), p(34, 12), p(45, 8)];
    expectFillsLike(lasso);
    for (const piece of filledPieces(lasso)) {
      for (const corner of piece) {
        expect(corner.x).toBeGreaterThanOrEqual(20);
        expect(corner.x).toBeLessThanOrEqual(80);
        expect(corner.y).toBeGreaterThanOrEqual(8);
        expect(corner.y).toBeLessThanOrEqual(80);
      }
    }
  });

  it('fills random scribbles exactly where they wind', () => {
    let seed = 12345;
    const rand = (): number => ((seed = (seed * 16807) % 2147483647) / 2147483647);
    for (let trial = 0; trial < 40; trial++) {
      const corners = 3 + Math.floor(rand() * 14);
      const scribble = Array.from({ length: corners }, () => p(5 + rand() * 90, 5 + rand() * 90));
      expectFillsLike(scribble, 100, 3.1);
    }
  });

  it('fills a room outline whose joints overlap by a hair, as hand-drawn walls do', () => {
    // Each wall's end lies a pixel past the next wall's start.
    const room = [p(10, 10), p(91, 10.8), p(90, 9.5), p(90.6, 91), p(91.2, 90), p(9, 90.5), p(10, 91.3), p(10.7, 9)];
    expectFillsLike(room, 100, 1.7);
    for (const piece of filledPieces(room)) {
      for (const corner of piece) {
        expect(corner.x).toBeGreaterThan(8.9);
        expect(corner.x).toBeLessThan(91.3);
      }
    }
  });

  it('fills nothing for an outline without area', () => {
    expect(filledPieces([])).toEqual([]);
    expect(filledPieces([p(1, 1), p(9, 9)])).toEqual([]);
    expect(filledPieces([p(1, 5), p(9, 5), p(4, 5)])).toEqual([]);
    expect(total(filledPieces([p(1, 1), p(9, 9), p(5, 5)]))).toBe(0);
  });
});
