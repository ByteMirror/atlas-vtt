import { describe, expect, it } from 'vitest';
import type { WallChannel, WallSegment } from '../../types/wallTypes';
import { blocksFrom } from '../../vision/visibility';
import { concerns, crosses, segOf } from '../segments';
import { sealWalls } from '../sealWalls';
import { FAMILIES, at, crowds, turn } from './sealFamilies';
import { TOLERANCE, clearOfEnds, random, sealAllPairs, wall, type XY } from './sealFixtures';

const bridgesOf = (walls: WallSegment[]): WallSegment[] => sealWalls(walls, TOLERANCE).slice(walls.length);
const HEDGE = { limited: true } as const;

/** Whether what goes from `a` to `b` is stopped: by a solid wall on its way, or by the second limited one. */
function stopped(a: XY, b: XY, walls: readonly WallSegment[], channel?: WallChannel): boolean {
  let limited = 0;
  for (const w of walls) {
    if (!blocksFrom(w, a, channel) || !crosses(a.x, a.y, b.x, b.y, segOf(w))) continue;
    if (!w.limited || ++limited > 1) return true;
  }
  return false;
}

describe('bridges between limited walls', () => {
  const joint = (a: Partial<WallSegment>, b: Partial<WallSegment>): WallSegment[] => [wall('a', 100, 100, 300, 100, a), wall('b', 306, 100, 306, 300, b)];
  const tee = (stem: Partial<WallSegment>, bar: Partial<WallSegment>): WallSegment[] => [wall('bar', 100, 100, 500, 100, bar), wall('stem', 300, 106, 300, 300, stem)];

  it.each([
    ['two hedges', HEDGE, HEDGE, true, undefined],
    ['a hedge and a wall', HEDGE, {}, undefined, undefined],
    ['a wall and a hedge', {}, HEDGE, undefined, undefined],
    ['a hedge and a hedge for sight only', HEDGE, { ...HEDGE, blocks: 'sight' }, true, undefined],
    ['two hedges for sight only', { ...HEDGE, blocks: 'sight' }, { ...HEDGE, blocks: 'sight' }, true, 'sight'],
    ['a hedge for sight only and a curtain', { ...HEDGE, blocks: 'sight' }, { blocks: 'sight' }, undefined, 'sight'],
  ] as [string, Partial<WallSegment>, Partial<WallSegment>, true | undefined, WallChannel | undefined][])('are limited only between two limited walls, and solid otherwise: %s', (_name, a, b, limited, blocks) => {
    for (const walls of [joint(a, b), tee(a, b)]) {
      const bridges = bridgesOf(walls);
      expect(bridges).toHaveLength(1);
      expect([bridges[0]!.limited, bridges[0]!.blocks]).toEqual([limited, blocks]);
    }
  });

  it('closes the gap in a row of hedges as the hedge itself would: one crossing, and the next hedge stops', () => {
    // Two hedges in a row, 6 px apart, and a third hedge behind them.
    const walls = [wall('a', 100, 100, 300, 100, HEDGE), wall('b', 306, 100, 500, 100, HEDGE), wall('far', 100, 200, 500, 200, HEDGE)];
    const sealed = sealWalls(walls, TOLERANCE);
    const through: [XY, XY] = [{ x: 303, y: 50 }, { x: 303, y: 150 }];
    expect(stopped(...through, sealed)).toBe(false);
    expect(stopped(through[0], { x: 303, y: 250 }, sealed)).toBe(true);
    // Unsealed, the ray through the gap would pass the third hedge as its first.
    expect(stopped(through[0], { x: 303, y: 250 }, walls)).toBe(false);
  });

  it('bridges a crowded place of hedges with solid walls for both', () => {
    const crowd = Array.from({ length: 12 }, (_, i) => {
      const p = at((i / 12) * Math.PI * 2, 4), q = at((i / 12) * Math.PI * 2, 200);
      return wall(`h${i}`, p.x, p.y, q.x, q.y, HEDGE);
    });
    const bridges = bridgesOf(crowd);
    expect(bridges.length).toBeGreaterThan(8);
    expect(bridges.every((b) => b.limited === undefined && b.blocks === undefined)).toBe(true);
  });

  it.each([['a hedge', HEDGE], ['a closed limited door', { ...HEDGE, type: 'door', closed: true }]] as [string, Partial<WallSegment>][])('does not count on a short limited wall to close the gap between two crowded ends: %s', (_name, between) => {
    for (let seed = 1; seed <= 20; seed++) {
      const sealed = sealWalls(crowds(between, seed), TOLERANCE);
      for (let y = 496.5; y <= 503.5; y += 0.5) {
        for (const [a, b] of [[{ x: 440, y }, { x: 560, y: 1000 - y }], [{ x: 560, y }, { x: 440, y: 1000 - y }]] as const) {
          expect([seed, y, a.x, stopped(a, b, sealed)]).toEqual([seed, y, a.x, true]);
        }
      }
    }
  });
});

/** Most walls limited, some for one thing only, some doors or one-way. */
function sorts(walls: WallSegment[], rand: () => number): WallSegment[] {
  return walls.map((w) => {
    const limited = rand() < 0.6 ? HEDGE : {};
    const kind = rand();
    const blocks = kind < 0.12 ? { blocks: 'sight' as const } : kind < 0.24 ? { blocks: 'light' as const } : {};
    const how = rand();
    if (how < 0.08) return { ...w, ...limited, ...blocks, type: 'door' as const, closed: false };
    if (how < 0.14) return { ...w, ...limited, ...blocks, type: 'door' as const, closed: true };
    if (how < 0.2) return { ...w, ...limited, ...blocks, direction: rand() < 0.5 ? 'left' as const : 'right' as const };
    return { ...w, ...limited, ...blocks };
  });
}

/** A bridge for every pair of the walls `channel` reads, limited where both its walls are: what the sealing must stop no less than. */
function everyPair(walls: WallSegment[], channel: WallChannel): WallSegment[] {
  const own = walls.filter((w) => concerns(w, channel));
  const byId = new Map(own.map((w) => [w.id, w]));
  return sealAllPairs(own).map((w) => {
    if (!w.id.startsWith('all:')) return w;
    // all:<wall>:<end>:<wall>:<end> between two ends, all:<wall>:<end>:<wall> across a middle.
    const parts = w.id.split(':');
    const joined = [byId.get(parts[1]!), byId.get(parts[3]!)];
    return joined.every((j) => j?.limited) ? { ...w, limited: true } : w;
  });
}

describe('sealing limited walls among walls of every sort', () => {
  it.each(Object.keys(FAMILIES))('stops for sight and for light what a bridge for every pair of its walls would stop: %s', (name) => {
    for (let seed = 1; seed <= 30; seed++) {
      const rand = random(seed * 32_452_843 + name.length);
      const walls = sorts(FAMILIES[name]!(rand), rand);
      const sealed = sealWalls(walls, TOLERANCE);
      for (const channel of ['sight', 'light'] as WallChannel[]) {
        const all = everyPair(walls, channel);
        const leaks: [XY, XY][] = [];
        for (let i = 0; i < 300; i++) {
          const through = at(turn(rand), Math.sqrt(rand()) * 30);
          const heading = turn(rand);
          const a = at(heading, 14 + rand() * 120, through), b = at(heading + Math.PI, 14 + rand() * 120, through);
          if (!clearOfEnds(a, walls) || !clearOfEnds(b, walls)) continue;
          if (stopped(a, b, all, channel) && !stopped(a, b, sealed, channel)) leaks.push([a, b]);
        }
        expect([name, seed, channel, leaks]).toEqual([name, seed, channel, []]);
      }
    }
  });
});
