import { describe, expect, it } from 'vitest';
import type { WallChannel, WallSegment } from '../../types/wallTypes';
import { concerns } from '../segments';
import { sealWalls } from '../sealWalls';
import { FAMILIES, at, crowds, turn } from './sealFamilies';
import { TOLERANCE, clearOfEnds, random, sealAllPairs, stops, wall, type XY } from './sealFixtures';

const CHANNELS: WallChannel[] = ['sight', 'light'];
const bridgesOf = (walls: WallSegment[]): WallSegment[] => sealWalls(walls, TOLERANCE).slice(walls.length);

describe('bridges between walls that block one thing', () => {
  /** Two walls whose ends are 6 px apart. */
  const joint = (a: Partial<WallSegment>, b: Partial<WallSegment>): WallSegment[] => [wall('a', 100, 100, 300, 100, a), wall('b', 306, 100, 306, 300, b)];
  /** A wall that ends 6 px short of another's middle. */
  const tee = (stem: Partial<WallSegment>, bar: Partial<WallSegment>): WallSegment[] => [wall('bar', 100, 100, 500, 100, bar), wall('stem', 300, 106, 300, 300, stem)];

  it.each([
    ['two curtains', { blocks: 'sight' }, { blocks: 'sight' }, 'sight'],
    ['two panes of glass', { blocks: 'light' }, { blocks: 'light' }, 'light'],
    ['two walls', {}, {}, undefined],
    ['a wall and a curtain', {}, { blocks: 'sight' }, undefined],
    ['a wall and glass', { blocks: 'light' }, {}, undefined],
    ['a curtain and glass', { blocks: 'sight' }, { blocks: 'light' }, undefined],
  ] as [string, Partial<WallSegment>, Partial<WallSegment>, WallChannel | undefined][])('take the kind both share, else block both: %s', (_name, a, b, kind) => {
    for (const walls of [joint(a, b), tee(a, b)]) {
      const bridges = bridgesOf(walls);
      expect(bridges).toHaveLength(1);
      expect(bridges[0]!.blocks).toBe(kind);
      expect(bridges[0]!.type).toBe('solid');
    }
  });

  it('reads the kind of a place where several walls end from all of them', () => {
    // Two curtains meet in a point; a third curtain ends 6 px from it, and so does a wall elsewhere.
    const corner = [wall('a', 100, 100, 300, 100, { blocks: 'sight' }), wall('b', 300, 100, 300, 300, { blocks: 'sight' })];
    expect(bridgesOf([...corner, wall('c', 306, 100, 500, 100, { blocks: 'sight' })]).map((b) => b.blocks)).toEqual(['sight']);
    expect(bridgesOf([...corner, wall('c', 306, 100, 500, 100)]).map((b) => b.blocks)).toEqual([undefined]);
    const mixed = [wall('a', 100, 100, 300, 100, { blocks: 'sight' }), wall('b', 300, 100, 300, 300)];
    expect(bridgesOf([...mixed, wall('c', 306, 100, 500, 100, { blocks: 'sight' })]).map((b) => b.blocks)).toEqual([undefined]);
  });

  it('closes a joint for the thing its walls block and for nothing else', () => {
    const sealed = sealWalls(joint({ blocks: 'sight' }, { blocks: 'sight' }), TOLERANCE);
    const [a, b]: [XY, XY] = [{ x: 290, y: 60 }, { x: 316, y: 140 }];
    expect(stops(a, b, sealed, 'sight')).toBeDefined();
    expect(stops(a, b, sealed, 'light')).toBeUndefined();
  });
});

/** Some of the walls block sight only, some light only, and some are doors or block one way. */
function kinds(walls: WallSegment[], rand: () => number): WallSegment[] {
  return walls.map((w) => {
    const kind = rand();
    const blocks = kind < 0.3 ? { blocks: 'sight' as const } : kind < 0.6 ? { blocks: 'light' as const } : {};
    const how = rand();
    if (how < 0.08) return { ...w, ...blocks, type: 'door' as const, closed: false };
    if (how < 0.14) return { ...w, ...blocks, type: 'door' as const, closed: true };
    if (how < 0.22) return { ...w, ...blocks, direction: rand() < 0.5 ? 'left' as const : 'right' as const };
    return { ...w, ...blocks };
  });
}

/** The rays that a bridge for every pair of the walls `channel` reads stops, and the sealing of all the walls lets through for it. */
function leaks(walls: WallSegment[], channel: WallChannel, rand: () => number, rays: number): { from: XY; to: XY; by: string }[] {
  const sealed = sealWalls(walls, TOLERANCE);
  const own = sealAllPairs(walls.filter((w) => concerns(w, channel)));
  const found: { from: XY; to: XY; by: string }[] = [];
  for (let i = 0; i < rays; i++) {
    const through = at(turn(rand), Math.sqrt(rand()) * 30);
    const heading = turn(rand);
    const a = at(heading, 14 + rand() * 120, through), b = at(heading + Math.PI, 14 + rand() * 120, through);
    if (!clearOfEnds(a, walls) || !clearOfEnds(b, walls)) continue;
    const stopped = stops(a, b, own, channel);
    if (stopped && !stops(a, b, sealed, channel)) found.push({ from: a, to: b, by: stopped.id });
  }
  return found;
}

describe('sealing walls of mixed kinds, for each thing they block', () => {
  it.each(Object.keys(FAMILIES))('closes for sight what its walls alone would close, and for light likewise: %s', (name) => {
    for (let seed = 1; seed <= 30; seed++) {
      const rand = random(seed * 15_485_863 + name.length);
      const walls = kinds(FAMILIES[name]!(rand), rand);
      for (const channel of CHANNELS) expect([name, seed, channel, leaks(walls, channel, rand, 300)]).toEqual([name, seed, channel, []]);
    }
  });

  it.each([
    ['a curtain', { blocks: 'sight' }], ['glass', { blocks: 'light' }], ['a closed door for sight only', { blocks: 'sight', type: 'door', closed: true }],
  ] as [string, Partial<WallSegment>][])('does not count on a short wall that blocks one thing to close the gap between two crowded ends: %s', (_name, between) => {
    for (let seed = 1; seed <= 20; seed++) {
      const walls = crowds(between, seed);
      const sealed = sealWalls(walls, TOLERANCE);
      for (const channel of CHANNELS) {
        for (let y = 496.5; y <= 503.5; y += 0.5) {
          for (const [a, b] of [[{ x: 440, y }, { x: 560, y: 1000 - y }], [{ x: 560, y }, { x: 440, y: 1000 - y }]] as const) {
            expect([seed, channel, y, a.x, !!stops(a, b, sealed, channel)]).toEqual([seed, channel, y, a.x, true]);
          }
        }
      }
    }
  });

  it('bridges a crowded place with walls for both, even where every wall there blocks the same thing', () => {
    // Twelve panes of glass end on a circle of 4 px; far from them two more end 6 px apart.
    const crowd = Array.from({ length: 12 }, (_, i) => {
      const p = at((i / 12) * Math.PI * 2, 4), q = at((i / 12) * Math.PI * 2, 200);
      return wall(`g${i}`, p.x, p.y, q.x, q.y, { blocks: 'light' });
    });
    const pair = [wall('a', 100, 100, 300, 100, { blocks: 'light' }), wall('b', 306, 100, 306, 300, { blocks: 'light' })];
    const bridges = bridgesOf([...crowd, ...pair]);
    expect(bridges.filter((b) => b.id.includes(':g')).length).toBeGreaterThan(8);
    expect(bridges.filter((b) => b.id.includes(':g')).every((b) => b.blocks === undefined)).toBe(true);
    expect(bridges.find((b) => b.id === 'seal:a:p2:b:p1')!.blocks).toBe('light');
  });
});
