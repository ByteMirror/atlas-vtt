import { describe, expect, it } from 'vitest';
import { LightReaches } from '../lightReaches';
import type { EngineLight } from '../engine/types';
import type { WallSegment } from '../../../types/wallTypes';

function light(key: string, x: number, dim = 100): EngineLight {
  return { key, x, y: 0, bright: dim / 2, dim, flame: 10, color: [1, 1, 1], intensity: 1, animation: 'none' };
}

const walls: WallSegment[] = [{ id: 'w', kind: 'wall', type: 'solid', p1: { x: 50, y: -100 }, p2: { x: 50, y: 100 } }];

describe('LightReaches', () => {
  it('traces a light again only when it moved, its reach changed or the walls changed', () => {
    const cache = new LightReaches();
    const [a, b] = cache.sync([light('a', 0), light('b', 200)], walls);
    const same = cache.sync([light('a', 0), light('b', 200)], walls);
    expect(same[0]).toBe(a);
    expect(same[1]).toBe(b);

    const moved = cache.sync([light('a', 10), light('b', 200, 150)], walls);
    expect(moved[0]).not.toBe(a);
    expect(moved[0]!.origin).toEqual({ x: 10, y: 0 });
    expect(moved[1]!.dim).toBe(150);

    const rewalled = cache.sync([light('a', 10), light('b', 200, 150)], [...walls]);
    expect(rewalled[0]).not.toBe(moved[0]);
  });

  it('drops lights that are gone', () => {
    const cache = new LightReaches();
    cache.sync([light('a', 0), light('b', 200)], walls);
    expect(cache.sync([light('b', 200)], walls).map((reach) => reach.origin.x)).toEqual([200]);
  });
});
