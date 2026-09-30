import { describe, expect, it } from 'vitest';
import { SEES_ALL, SightCache, computeSight, isFelt, isSeen, lightReach, sceneSight, sightSources, type SightSource } from '../sight';
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
    expect(isSeen({ x: 150, y: 100 }, sight, { ambient: 1 }, [])).toBe(true);
    expect(isSeen({ x: 300, y: 100 }, sight, { ambient: 1 }, [])).toBe(false);
  });

  it('limits darkvision by walls', () => {
    const sight = computeSight([source({ darkvision: 400 })], [wall]);
    expect(isSeen({ x: 150, y: 100 }, sight, { ambient: 0 }, [])).toBe(true);
    expect(isSeen({ x: 300, y: 100 }, sight, { ambient: 0 }, [])).toBe(false);
  });
});

describe('computeSight origins', () => {
  it('records where each polygon is seen from, darkvision only for tokens that have it', () => {
    const a = source({ tokenId: 'a', origin: { x: 100, y: 100 } });
    const b = source({ tokenId: 'b', origin: { x: 500, y: 500 }, darkvision: 400 });
    const sight = computeSight([a, b], [wall]);
    expect(sight.origins).toEqual([a.origin, b.origin]);
    expect(sight.polygons).toHaveLength(2);
    expect(sight.darkvisionOrigins).toEqual([b.origin]);
    expect(sight.darkvision).toHaveLength(1);
  });
});

describe('isSeen', () => {
  const sight = computeSight([source()], []);

  it('does not see into darkness', () => {
    expect(isSeen({ x: 150, y: 150 }, sight, { ambient: 0 }, [])).toBe(false);
  });

  it('sees what a light reaches', () => {
    const torch = lightReach({ x: 160, y: 160 }, 100, []);
    expect(isSeen({ x: 150, y: 150 }, sight, { ambient: 0 }, [torch])).toBe(true);
    expect(isSeen({ x: 400, y: 400 }, sight, { ambient: 0 }, [torch])).toBe(false);
  });

  it('sees everything in sight once the ambient light is bright enough', () => {
    expect(isSeen({ x: 400, y: 400 }, sight, { ambient: 0.5 }, [])).toBe(true);
  });

  it('counts the scene as lit from 25 % ambient light unless the scene sets its own threshold', () => {
    expect(isSeen({ x: 400, y: 400 }, sight, { ambient: 0.25 }, [])).toBe(true);
    expect(isSeen({ x: 400, y: 400 }, sight, { ambient: 0.24 }, [])).toBe(false);
    expect(isSeen({ x: 400, y: 400 }, sight, { ambient: 0.3, litThreshold: 0.5 }, [])).toBe(false);
    expect(isSeen({ x: 400, y: 400 }, sight, { ambient: 0.5, litThreshold: 0.5 }, [])).toBe(true);
    expect(isSeen({ x: 400, y: 400 }, sight, { ambient: 0, litThreshold: 0 }, [])).toBe(true);
  });

  it('still needs light or darkvision where the threshold is out of reach', () => {
    const torch = lightReach({ x: 160, y: 160 }, 100, []);
    expect(isSeen({ x: 150, y: 150 }, sight, { ambient: 0.9, litThreshold: 1 }, [torch])).toBe(true);
    expect(isSeen({ x: 400, y: 400 }, sight, { ambient: 0.9, litThreshold: 1 }, [torch])).toBe(false);
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

describe('vision cones', () => {
  const at = { x: 500, y: 500 };
  const seenFrom = (vision: TokenEntity['vision'], rotation?: number): ((x: number, y: number, ambient?: number) => boolean) => {
    const viewer = { ...token('v', at.x, at.y, vision), ...(rotation !== undefined && { rotation }) };
    const sight = computeSight(sightSources({ v: viewer }, scale, bounds), []);
    return (x: number, y: number, ambient = 1): boolean => isSeen({ x, y }, sight, { ambient: ambient }, []);
  };

  it('looks up at rotation 0, as the token art does', () => {
    const sees = seenFrom({ enabled: true, angle: 90 });
    expect(sees(500, 300)).toBe(true);
    expect(sees(500, 700)).toBe(false);
    expect(sees(700, 500)).toBe(false);
  });

  it('turns clockwise with the token rotation', () => {
    const right = seenFrom({ enabled: true, angle: 90 }, 90);
    expect(right(700, 500)).toBe(true);
    expect(right(300, 500)).toBe(false);
    expect(right(500, 300)).toBe(false);
    for (const rotation of [-90, 270]) {
      const left = seenFrom({ enabled: true, angle: 90 }, rotation);
      expect(left(300, 500)).toBe(true);
      expect(left(700, 500)).toBe(false);
    }
  });

  it('sees all around without an angle or with 360', () => {
    for (const vision of [{ enabled: true }, { enabled: true, angle: 360 }]) {
      const sees = seenFrom(vision, 90);
      expect(sees(300, 500)).toBe(true);
      expect(sees(500, 700)).toBe(true);
    }
  });

  it('limits darkvision to the cone', () => {
    const sees = seenFrom({ enabled: true, angle: 90, darkvision: 30 }, 0);
    expect(sees(500, 400, 0)).toBe(true);
    expect(sees(500, 600, 0)).toBe(false);
  });

  it('recomputes the polygon when the token turns', () => {
    const cache = new SightCache();
    const walls = [wall];
    const facingUp = source({ cone: { facing: -Math.PI / 2, angle: 1 } });
    const first = computeSight([facingUp], walls, cache).polygons[0];
    expect(computeSight([{ ...facingUp, cone: { facing: -Math.PI / 2, angle: 1 } }], walls, cache).polygons[0]).toBe(first);
    expect(computeSight([{ ...facingUp, cone: { facing: 0, angle: 1 } }], walls, cache).polygons[0]).not.toBe(first);
    expect(computeSight([{ ...facingUp, cone: { facing: -Math.PI / 2, angle: 2 } }], walls, cache).polygons[0]).not.toBe(first);
  });
});

describe('tremorsense', () => {
  it('converts the range to world pixels and adds no sight of its own', () => {
    const viewer = token('v', 100, 100, { enabled: true, range: 5, tremorsense: 30 });
    const [only] = sightSources({ v: viewer }, scale, bounds);
    expect(only!.tremorsense).toBe(420);
    const sight = computeSight([only!], [wall]);
    const { tremorsense: _felt, ...unfelt } = only!;
    const without = computeSight([unfelt], [wall]);
    expect(sight.polygons).toEqual(without.polygons);
    expect(sight.tremors).toEqual([{ origin: { x: 100, y: 100 }, radius: 420 }]);
    expect(without.tremors).toEqual([]);
  });

  it('feels points within range through walls and darkness', () => {
    const sight = computeSight([source({ tremorsense: 300 })], [wall]);
    expect(isSeen({ x: 300, y: 100 }, sight, { ambient: 0 }, [])).toBe(false);
    expect(isFelt({ x: 300, y: 100 }, sight)).toBe(true);
    expect(isFelt({ x: 450, y: 100 }, sight)).toBe(false);
  });

  it('feels nothing without tremorsense', () => {
    expect(isFelt({ x: 110, y: 100 }, computeSight([source()], []))).toBe(false);
  });
});

describe('sceneSight', () => {
  it('computes the tokens\' sight while the scene uses token vision', () => {
    expect(sceneSight({}, [source()], [wall]).polygons).toEqual(computeSight([source()], [wall]).polygons);
    expect(sceneSight({ tokenVision: true }, [source()], [wall]).all).toBe(false);
  });

  it('sees everything when the scene switches token vision off', () => {
    const sight = sceneSight({ tokenVision: false }, [source()], [wall]);
    expect(sight).toBe(SEES_ALL);
    expect(isSeen({ x: 300, y: 100 }, sight, { ambient: 1 }, [])).toBe(true);
  });
});
