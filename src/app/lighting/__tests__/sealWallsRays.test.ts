import { describe, expect, it } from 'vitest';
import type { WallSegment } from '../../types/wallTypes';
import { computeVisibility, pointInPolygon } from '../../vision/visibility';
import { lightReach } from '../../vision/sight';
import { sealWalls } from '../sealWalls';
import { FAMILIES, at, crowds, turn } from './sealFamilies';
import { TOLERANCE, clearOfEnds, random, sealAllPairs, stops, wall, type XY } from './sealFixtures';

/** Some of the walls become doors, open or closed, or one-way walls: what blocks nothing must not be counted on to close a gap. */
function mixed(walls: WallSegment[], rand: () => number): WallSegment[] {
  return walls.map((w) => {
    const kind = rand();
    if (kind < 0.12) return { ...w, type: 'door' as const, closed: false };
    if (kind < 0.2) return { ...w, type: 'door' as const, closed: true };
    if (kind < 0.32) return { ...w, direction: rand() < 0.5 ? 'left' as const : 'right' as const };
    return w;
  });
}

/** The rays from A to B through the junction that all-pairs bridging stops and the capped one lets through. */
function leaks(walls: WallSegment[], rand: () => number, rays: number): { from: XY; to: XY; by: string }[] {
  const capped = sealWalls(walls, TOLERANCE);
  const all = sealAllPairs(walls);
  const found: { from: XY; to: XY; by: string }[] = [];
  for (let i = 0; i < rays; i++) {
    const through = at(turn(rand), Math.sqrt(rand()) * 30);
    const heading = turn(rand);
    const a = at(heading, 14 + rand() * 120, through), b = at(heading + Math.PI, 14 + rand() * 120, through);
    if (!clearOfEnds(a, walls) || !clearOfEnds(b, walls)) continue;
    const stopped = stops(a, b, all);
    if (stopped && !stops(a, b, capped)) found.push({ from: a, to: b, by: stopped.id });
  }
  return found;
}

/** Of `rays` rays through the junction: those all pairs stops and the capped bridging lets through, and those only the capped one stops. */
function compare(walls: WallSegment[], rand: () => number, rays: number): { asked: number; leaks: number; overSeals: number } {
  const capped = sealWalls(walls, TOLERANCE);
  const all = sealAllPairs(walls);
  const counts = { asked: 0, leaks: 0, overSeals: 0 };
  for (let i = 0; i < rays; i++) {
    const through = at(turn(rand), Math.sqrt(rand()) * 30);
    const heading = turn(rand);
    const a = at(heading, 14 + rand() * 120, through), b = at(heading + Math.PI, 14 + rand() * 120, through);
    if (!clearOfEnds(a, walls) || !clearOfEnds(b, walls)) continue;
    counts.asked++;
    const [byAll, byCapped] = [!!stops(a, b, all), !!stops(a, b, capped)];
    if (byAll && !byCapped) counts.leaks++;
    if (byCapped && !byAll) counts.overSeals++;
  }
  return counts;
}

describe('capped bridging against a bridge for every pair', () => {
  it('counts, for every family, the rays it lets through that all pairs stops (none) and those it alone stops', { timeout: 300_000 }, () => {
    const table: Record<string, { asked: number; leaks: number; overSeals: number }> = {};
    for (const name of Object.keys(FAMILIES)) {
      const total = { asked: 0, leaks: 0, overSeals: 0 };
      for (let seed = 1; seed <= 60; seed++) {
        const rand = random(seed * 2_147_483 + name.length);
        const plain = FAMILIES[name]!(rand);
        for (const walls of [plain, mixed(plain, rand)]) {
          const counts = compare(walls, rand, 1500);
          total.asked += counts.asked;
          total.leaks += counts.leaks;
          total.overSeals += counts.overSeals;
        }
      }
      table[name] = total;
    }
    console.info(`sealing against all pairs, rays asked / leaks / stopped by the capped bridging alone:\n${Object.entries(table).map(([name, t]) => `  ${name}: ${t.asked} / ${t.leaks} / ${t.overSeals}`).join('\n')}`);
    expect(Object.fromEntries(Object.entries(table).map(([name, t]) => [name, t.leaks]))).toEqual(Object.fromEntries(Object.keys(table).map((name) => [name, 0])));
    // Only a plug stops more than a bridge for every pair does, and only walls beyond counting passing an end make one.
    for (const name of ['ring', 'twoClusters', 'line', 'octant', 'airlock', 'stroke', 'ladder']) expect([name, table[name]!.overSeals]).toEqual([name, 0]);
  });


  it.each(Object.keys(FAMILIES))('lets no ray through a junction that all pairs would stop: %s', (name) => {
    for (let seed = 1; seed <= 40; seed++) {
      const rand = random(seed * 7919 + name.length);
      const walls = FAMILIES[name]!(rand);
      expect([name, seed, leaks(walls, rand, 400)]).toEqual([name, seed, []]);
    }
  });

  it.each(Object.keys(FAMILIES))('nor with doors and one-way walls among them: %s', (name) => {
    for (let seed = 1; seed <= 40; seed++) {
      const rand = random(seed * 104_729 + name.length);
      const walls = mixed(FAMILIES[name]!(rand), rand);
      expect([name, seed, leaks(walls, rand, 400)]).toEqual([name, seed, []]);
    }
  });
});

describe('two walls on their own that stop nothing, facing each other between crowded ends', () => {
  /** Fourteen walls: two open doors of under four pixels, each end with more than eight others near it. */
  const walls = (kind: Partial<WallSegment>): WallSegment[] => [
    wall('door1', 500, 500, 498.5, 503.5, kind), wall('door2', 510, 504, 508.5, 507.5, kind),
    wall('n0', 508, 492, 430, 350), wall('n1', 509, 492, 460, 350), wall('n2', 510, 492, 490, 350), wall('n3', 508, 493, 520, 350), wall('n4', 509, 493, 550, 350), wall('n5', 510, 493, 580, 350),
    wall('s0', 500.5, 515.5, 430, 660), wall('s1', 499.5, 515.5, 460, 660), wall('s2', 498.5, 515.5, 490, 660), wall('s3', 500.5, 514.5, 520, 660), wall('s4', 499.5, 514.5, 550, 660), wall('s5', 498.5, 514.5, 580, 660),
  ];

  it.each([['open doors', { type: 'door', closed: false }], ['walls that block one way', { direction: 'left' }], ['walls that block the other way', { direction: 'right' }]] as [string, Partial<WallSegment>][])('joins the ends of the one to the ends of the other, though each is the other end\'s nearest: %s', (_name, kind) => {
    const sealed = sealWalls(walls(kind), TOLERANCE);
    const all = sealAllPairs(walls(kind));
    const [west, east] = [{ x: 485.7, y: 496.3 }, { x: 522.8, y: 511.2 }];
    expect(clearOfEnds(west, walls(kind)) && clearOfEnds(east, walls(kind))).toBe(true);
    for (const [a, b] of [[west, east], [east, west]] as const) {
      if (!stops(a, b, all)) continue;
      expect([a.x, !!stops(a, b, sealed)]).toEqual([a.x, true]);
    }
    const ids = sealed.map((w) => w.id);
    expect(ids).toContain('seal:door1:p1:door2:p2');
    expect(ids).toContain('seal:door1:p2:door2:p1');
    if (kind.direction) return;
    // From the west nothing east of the doors is seen, and a light there does not reach it.
    const seen = computeVisibility(west, 1000, sealed);
    for (let x = 512; x < 560; x += 8) for (let y = 496; y < 516; y += 2) expect([x, y, pointInPolygon({ x, y }, seen)]).toEqual([x, y, false]);
    expect(pointInPolygon(east, lightReach(west, 600, sealed).polygon)).toBe(false);
  });
});

describe('a wall end that stops short of many walls', () => {
  /**
   * Two rooms with a doorway that a stem all but closes: it ends 10 px short of the south wall,
   * and `dashes` short walls cross it 7 to 9.1 px above its end.
   */
  function ladder(dashes: number): WallSegment[] {
    return [
      wall('north', 300, 300, 700, 300), wall('east', 700, 300, 700, 500), wall('south', 700, 500, 300, 500), wall('west', 300, 500, 300, 300),
      wall('stem', 500, 300, 500, 490),
      ...Array.from({ length: dashes }, (_, i) => wall(`dash${i}`, 470, 483 - i * 0.3, 530, 483 - i * 0.3)),
    ];
  }

  it.each([7, 8, 20])('is bridged to the wall its gap is at, however many others are nearer: %i dashes', (dashes) => {
    const sealed = sealWalls(ladder(dashes), TOLERANCE);
    // From the west room, nothing of the east room is seen, and a torch there lights nothing of it.
    for (const viewer of [{ x: 400, y: 495 }, { x: 320, y: 320 }, { x: 495, y: 497 - 3 }]) {
      const seen = computeVisibility(viewer, 1000, sealed);
      for (let x = 520; x < 700; x += 12) {
        for (let y = 310; y < 500; y += 12) expect([dashes, viewer, x, y, pointInPolygon({ x, y }, seen)]).toEqual([dashes, viewer, x, y, false]);
      }
    }
    expect(pointInPolygon({ x: 690, y: 495 }, lightReach({ x: 400, y: 495 }, 600, sealed).polygon)).toBe(false);
    // Unsealed, the gap is open: the check can fail.
    expect(pointInPolygon({ x: 690, y: 495 }, computeVisibility({ x: 400, y: 495 }, 1000, ladder(dashes)))).toBe(true);
  });
});

describe('a short wall that blocks nothing between two crowded ends', () => {
  const KINDS: [string, Partial<WallSegment>][] = [
    ['an open door', { type: 'door', closed: false }], ['an open secret door', { type: 'secret-door', closed: false }],
    ['a one-way wall', { direction: 'left' }], ['a one-way wall the other way', { direction: 'right' }],
    ['a closed door', { type: 'door', closed: true }], ['a solid wall', {}],
  ];

  it.each(KINDS)('is not counted on to close the gap between them: %s', (_name, between) => {
    for (let seed = 1; seed <= 20; seed++) {
      const walls = crowds(between, seed);
      // Rays from west to east and back through the gap, which a bridge for every pair closes.
      const capped = sealWalls(walls, TOLERANCE);
      const all = sealAllPairs(walls);
      for (let y = 496.5; y <= 503.5; y += 0.5) {
        for (const [a, b] of [[{ x: 440, y }, { x: 560, y: 1000 - y }], [{ x: 560, y }, { x: 440, y: 1000 - y }]] as const) {
          expect(stops(a, b, all)).toBeDefined();
          expect([seed, y, a.x, !!stops(a, b, capped)]).toEqual([seed, y, a.x, true]);
        }
      }
      expect(leaks(walls, random(seed + 99), 300)).toEqual([]);
    }
  });
});
