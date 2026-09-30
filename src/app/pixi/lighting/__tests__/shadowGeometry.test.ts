import { describe, expect, it } from 'vitest';
import { buildShadowQuads, shadowCasters } from '../shadowGeometry';
import type { WallSegment } from '../../../types/wallTypes';

function wall(id: string, x1: number, y1: number, x2: number, y2: number, overrides: Partial<WallSegment> = {}): WallSegment {
  return { id, kind: 'wall', type: 'solid', p1: { x: x1, y: y1 }, p2: { x: x2, y: y2 }, ...overrides };
}

const origin = { x: 0, y: 0 };

describe('shadowCasters', () => {
  it('keeps closed walls in reach and drops the rest', () => {
    const casters = shadowCasters([
      wall('near', -10, 50, 10, 50),
      wall('far', 500, 500, 600, 500),
      wall('open', -10, -50, 10, -50, { type: 'door', closed: false }),
      wall('dot', 20, 20, 20, 20),
      wall('oneway', -10, 60, 10, 60, { direction: 'left' }),
    ], origin, 100);
    expect(casters.map((w) => w.id)).toEqual(['near']);
  });
});

describe('buildShadowQuads', () => {
  it('emits a fan per caster: both endpoints, their far corners and a far point behind the middle', () => {
    const quads = buildShadowQuads([wall('a', 1, 2, 3, 4), wall('b', 5, 6, 7, 8)]);
    expect(quads.count).toBe(2);
    expect(quads.positions).toHaveLength(2 * 5 * 2);
    expect(quads.segments).toHaveLength(2 * 5 * 4);
    expect(Array.from(quads.corners.slice(0, 10))).toEqual([0, 0, 1, 0, 0, 1, 1, 1, 0.5, 1]);
    expect(Array.from(quads.positions.slice(8, 10))).toEqual([2, 3]);
    expect(Array.from(quads.segments.slice(20, 24))).toEqual([5, 6, 7, 8]);
    expect(Array.from(quads.indices)).toEqual([0, 1, 4, 0, 4, 2, 1, 3, 4, 5, 6, 9, 5, 9, 7, 6, 8, 9]);
  });

  it('is empty without casters', () => {
    expect(buildShadowQuads([]).count).toBe(0);
  });
});
