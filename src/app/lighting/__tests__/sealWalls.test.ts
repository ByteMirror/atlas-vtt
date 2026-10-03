import { describe, expect, it } from 'vitest';
import { sealWalls, sealedWalls } from '../sealWalls';
import { crosses, segOf } from '../segments';
import { computeVisibility, pointInPolygon } from '../../vision/visibility';
import type { WallSegment } from '../../types/wallTypes';
import { TOLERANCE, wall } from './sealFixtures';

// Wall-clock bound of the timed tests here. They take a few milliseconds; stepping along a wall
// ten million pixels long, point by point, took minutes or never ended. The bound is far above
// the first and far below the second, so a machine under load does not fail them.
const SLOW = 15_000;


describe('sealTolerance', () => {
  it('is about 13 px at 2 px texels', () => {
    expect(TOLERANCE).toBeCloseTo(13, 9);
  });
});

describe('sealWalls', () => {
  it('bridges a hand-drawn corner narrower than the tolerance', () => {
    const walls = [wall('a', 0, 0, 100, 0), wall('b', 110, 5, 110, 100)];
    const sealed = sealWalls(walls, TOLERANCE);
    expect(sealed).toHaveLength(3);
    expect(sealed[2]).toMatchObject({ type: 'solid', p1: { x: 100, y: 0 }, p2: { x: 110, y: 5 } });
    expect(sealed[2]!.direction).toBeUndefined();
  });

  it('closes the corner for sight', () => {
    const walls = [wall('a', 0, 0, 100, 0), wall('b', 110, 5, 110, 100)];
    const inside = { x: 105, y: 50 };
    const behind = { x: 105, y: -20 };
    expect(pointInPolygon(behind, computeVisibility(inside, 500, walls))).toBe(true);
    expect(pointInPolygon(behind, computeVisibility(inside, 500, sealWalls(walls, TOLERANCE)))).toBe(false);
  });

  it('bridges a T-junction that stops short across the wall it meets', () => {
    const tee = wall('t', 50, 50, 50, 8);
    const sealed = sealWalls([wall('a', 0, 0, 100, 0), tee], TOLERANCE);
    expect(sealed).toHaveLength(3);
    const bridge = sealed[2]!;
    expect(bridge.p1).toEqual({ x: 50, y: 8 });
    expect(bridge.p2.x).toBeCloseTo(50, 9);
    expect(bridge.p2.y).toBeLessThan(0);
    expect(crosses(bridge.p1.x, bridge.p1.y, bridge.p2.x, bridge.p2.y, segOf(wall('a', 0, 0, 100, 0)))).toBe(true);
  });

  it('lands a T-junction touching the wall just across it', () => {
    const sealed = sealWalls([wall('a', 0, 0, 100, 0), wall('t', 50, 50, 50, 0)], TOLERANCE);
    expect(sealed).toHaveLength(3);
    expect(sealed[2]!.p2.y).toBeCloseTo(-0.01, 9);
  });

  it('keeps gaps wider than the tolerance open', () => {
    const walls = [wall('a', 0, 0, 100, 0), wall('b', 114, 0, 200, 0), wall('t', 150, 50, 150, 14)];
    expect(sealWalls(walls, TOLERANCE)).toEqual(walls);
  });

  it('needs no bridge where ends coincide, nor between the two ends of one short wall', () => {
    const walls = [wall('a', 0, 0, 100, 0), wall('b', 100, 0, 100, 100), wall('s', 300, 0, 305, 0)];
    expect(sealWalls(walls, TOLERANCE)).toEqual(walls);
  });

  it('leaves the drawn walls exactly as they are', () => {
    const walls = [wall('a', 0, 0, 100, 0), wall('b', 102, 3, 102, 100, { direction: 'left' }), wall('d', 50, 60, 50, 4, { type: 'door', closed: false })];
    const sealed = sealWalls(walls, TOLERANCE);
    expect(sealed.slice(0, walls.length)).toEqual(walls);
    expect(sealed.slice(walls.length).every((b) => b.type === 'solid' && b.id.startsWith('seal:'))).toBe(true);
  });

  it('builds one bridge per pair of points, with ids that do not depend on wall order', () => {
    // Chain a-b shares a vertex; c's end is near that vertex: two wall ends, one bridge.
    const walls = [wall('a', 0, 0, 100, 0), wall('b', 100, 0, 100, 100), wall('c', 105, -5, 200, -5)];
    const sealed = sealWalls(walls, TOLERANCE);
    const bridges = sealed.slice(walls.length);
    expect(bridges).toHaveLength(1);
    const reversed = sealWalls([...walls].reverse(), TOLERANCE).slice(walls.length);
    expect(reversed.map((b) => b.id)).toEqual(bridges.map((b) => b.id));
  });

  it('is deterministic', () => {
    const walls = Array.from({ length: 40 }, (_, i) => wall(`w${i}`, (i * 37) % 300, (i * 53) % 300, ((i * 37) % 300) + 40, ((i * 53) % 300) + 7));
    expect(sealWalls(walls, TOLERANCE)).toEqual(sealWalls(walls, TOLERANCE));
  });

  it('memoises per walls array and texel', () => {
    const walls = [wall('a', 0, 0, 100, 0), wall('b', 110, 0, 200, 0)];
    expect(sealedWalls(walls, 2)).toBe(sealedWalls(walls, 2));
    expect(sealedWalls(walls, 2)).toHaveLength(3);
    // Coarser texels seal wider gaps.
    expect(sealedWalls([wall('a', 0, 0, 100, 0), wall('b', 120, 0, 200, 0)], 4)).toHaveLength(3);
    expect(sealedWalls([wall('a', 0, 0, 100, 0), wall('b', 120, 0, 200, 0)], 2)).toHaveLength(2);
  });
});

describe('sealWalls with walls far beyond the map', () => {
  /** A room whose corners stop short of each other, with a wall inside that stops short of its north wall. */
  const room = (): WallSegment[] => [
    wall('n', 0, 0, 300, 0), wall('e', 308, 4, 308, 300), wall('s', 300, 306, 0, 306), wall('w', -6, 300, -6, 5), wall('t', 150, 150, 150, 9),
    ...Array.from({ length: 60 }, (_, i) => wall(`p${i}`, 20 + i * 4, 40 + (i % 7) * 30, 23 + i * 4, 52 + (i % 7) * 30)),
  ];
  const bridgesOf = (walls: WallSegment[]): WallSegment[] => sealWalls(walls, TOLERANCE).slice(walls.length);

  it('seals a room alike with a wall ten million pixels long among its walls, without stepping along it', () => {
    const far = wall('far', -5_000_000, 5_000, 5_000_000, 5_400);
    const expected = bridgesOf(room());
    expect(expected.length).toBeGreaterThanOrEqual(5);

    const started = performance.now();
    const bridges = bridgesOf([...room(), far]);

    expect(performance.now() - started).toBeLessThan(SLOW);
    expect(bridges).toEqual(expected);
  });

  it('still bridges a wall end that stops short of the middle of such a wall', () => {
    const far = wall('far', -5_000_000, -8, 5_000_000, -8);

    const bridges = bridgesOf([wall('n', 0, 0, 300, 0), far]);

    expect(bridges.map((bridge) => bridge.id).sort()).toEqual(['seal:n:p1:far', 'seal:n:p2:far']);
    expect(bridges[0]).toMatchObject({ p1: { x: 0, y: 0 }, p2: { x: 0 } });
    expect(bridges[0]!.p2.y).toBeCloseTo(-8, 1);
  });

  it('stays quick with a hundred such walls, which no grid of points could step along', () => {
    const far = Array.from({ length: 100 }, (_, i) => wall(`far${i}`, -1_150_000, -1_150_000 + i * 70, 1_150_000, 1_150_000 - i * 70));

    const started = performance.now();
    const sealed = sealWalls([...room(), ...far], TOLERANCE);

    expect(performance.now() - started).toBeLessThan(SLOW);
    expect(sealed.length).toBeGreaterThanOrEqual(room().length + 100);
  });

  it.each([
    ['not a number', NaN],
    ['infinite', Infinity],
    ['infinite the other way', -Infinity],
    ['too large to square', 1e200],
  ])('skips a wall with a coordinate that is %s', (_label, value) => {
    const broken = [wall('x1', value, 0, 100, 100), wall('x2', 0, 0, 100, value), wall('x3', value, value, value, value)];

    expect(bridgesOf([...room(), ...broken])).toEqual(bridgesOf(room()));
  });
});
