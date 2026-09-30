import { describe, expect, it } from 'vitest';
import { SightCache, computeSight, isSeen, lightReach, sightSources, type SightSource } from '../sight';
import type { TokenEntity } from '../../types';
import type { WallSegment } from '../../types/wallTypes';

const scale = { unitDistance: 5, cellSize: 70 };
const bounds = { width: 1000, height: 1000 };
const wall: WallSegment = { id: 'w', kind: 'wall', type: 'solid', p1: { x: 200, y: 0 }, p2: { x: 200, y: 400 } };

function token(id: string, x: number, y: number, vision?: TokenEntity['vision']): TokenEntity {
  return { id, kind: 'token', imagePath: 'a.png', x, y, ...(vision && { vision }) };
}

function source(overrides: Partial<SightSource> = {}): SightSource {
  return { tokenId: 't', origin: { x: 100, y: 100 }, range: 1414, darkvision: 0, ...overrides };
}

describe('sightSources', () => {
  it('takes only tokens with vision on, converting game units to pixels', () => {
    const sources = sightSources({
      a: token('a', 10, 20, { enabled: true, range: 30, darkvision: 60 }),
      b: token('b', 0, 0, { enabled: false }),
      c: token('c', 0, 0),
    }, scale, bounds);
    expect(sources).toEqual([{ tokenId: 'a', origin: { x: 10, y: 20 }, range: 420, darkvision: 840 }]);
  });

  it('gives tokens without a range sight across the whole map', () => {
    const [only] = sightSources({ a: token('a', 0, 0, { enabled: true }) }, scale, bounds);
    expect(only!.range).toBeCloseTo(Math.hypot(1000, 1000));
  });
});

describe('computeSight', () => {
  it('sees everything when no token has vision', () => {
    expect(computeSight([], [wall]).all).toBe(true);
  });

  it('keeps what lies behind a wall out of sight', () => {
    const sight = computeSight([source()], [wall]);
    expect(isSeen({ x: 150, y: 100 }, sight, 1, [])).toBe(true);
    expect(isSeen({ x: 300, y: 100 }, sight, 1, [])).toBe(false);
  });

  it('limits darkvision by walls', () => {
    const sight = computeSight([source({ darkvision: 400 })], [wall]);
    expect(isSeen({ x: 150, y: 100 }, sight, 0, [])).toBe(true);
    expect(isSeen({ x: 300, y: 100 }, sight, 0, [])).toBe(false);
  });
});

describe('isSeen', () => {
  const sight = computeSight([source()], []);

  it('does not see into darkness', () => {
    expect(isSeen({ x: 150, y: 150 }, sight, 0, [])).toBe(false);
  });

  it('sees what a light reaches', () => {
    const torch = lightReach({ x: 160, y: 160 }, 100, []);
    expect(isSeen({ x: 150, y: 150 }, sight, 0, [torch])).toBe(true);
    expect(isSeen({ x: 400, y: 400 }, sight, 0, [torch])).toBe(false);
  });

  it('sees everything in sight once the ambient light is bright enough', () => {
    expect(isSeen({ x: 400, y: 400 }, sight, 0.5, [])).toBe(true);
  });
});

describe('SightCache', () => {
  it('reuses a polygon while token and walls stay the same', () => {
    const cache = new SightCache();
    const walls = [wall];
    const first = computeSight([source()], walls, cache).polygons[0];
    expect(computeSight([source()], walls, cache).polygons[0]).toBe(first);
    expect(computeSight([source()], [wall], cache).polygons[0]).not.toBe(first);
    expect(computeSight([source({ origin: { x: 110, y: 100 } })], walls, cache).polygons[0]).not.toBe(first);
  });
});
