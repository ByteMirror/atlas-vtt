import { describe, it, expect } from 'vitest';
import {
  segmentIntersection,
  raySegmentIntersect,
  distSq,
  angleTo,
  clipPolygonToCircle,
  wallNormal,
  isOnBlockingSide,
} from '../visionGeometry';

describe('segmentIntersection', () => {
  it('returns intersection point for crossing segments', () => {
    const result = segmentIntersection(
      { x: 0, y: 0 }, { x: 10, y: 10 },
      { x: 10, y: 0 }, { x: 0, y: 10 },
    );
    expect(result).not.toBeNull();
    expect(result!.x).toBeCloseTo(5, 5);
    expect(result!.y).toBeCloseTo(5, 5);
  });

  it('returns null for parallel segments', () => {
    const result = segmentIntersection(
      { x: 0, y: 0 }, { x: 10, y: 0 },
      { x: 0, y: 5 }, { x: 10, y: 5 },
    );
    expect(result).toBeNull();
  });

  it('returns null for non-crossing segments', () => {
    const result = segmentIntersection(
      { x: 0, y: 0 }, { x: 5, y: 0 },
      { x: 6, y: -1 }, { x: 6, y: 1 },
    );
    expect(result).toBeNull();
  });
});

describe('raySegmentIntersect', () => {
  it('returns distance for ray hitting segment', () => {
    // Ray from origin going right (angle 0), segment is a vertical line at x=5
    const t = raySegmentIntersect(
      { x: 0, y: 0 }, 0,
      { x: 5, y: -5 }, { x: 5, y: 5 },
    );
    expect(t).toBeCloseTo(5, 5);
  });

  it('returns Infinity for ray missing segment', () => {
    // Ray going up (angle PI/2), segment is to the right and does not cross the ray
    const t = raySegmentIntersect(
      { x: 0, y: 0 }, Math.PI / 2,
      { x: 5, y: -5 }, { x: 5, y: 5 },
    );
    expect(t).toBe(Infinity);
  });
});

describe('distSq', () => {
  it('returns squared distance', () => {
    expect(distSq({ x: 0, y: 0 }, { x: 3, y: 4 })).toBe(25);
  });

  it('returns 0 for same point', () => {
    expect(distSq({ x: 5, y: 5 }, { x: 5, y: 5 })).toBe(0);
  });
});

describe('angleTo', () => {
  it('returns correct angles', () => {
    expect(angleTo({ x: 0, y: 0 }, { x: 1, y: 0 })).toBeCloseTo(0, 5);
    expect(angleTo({ x: 0, y: 0 }, { x: 0, y: 1 })).toBeCloseTo(Math.PI / 2, 5);
    expect(angleTo({ x: 0, y: 0 }, { x: -1, y: 0 })).toBeCloseTo(Math.PI, 5);
  });
});

describe('wallNormal', () => {
  it('returns left normal', () => {
    // Horizontal wall from (0,0) to (10,0) — left normal points in +y direction
    const normal = wallNormal({ x: 0, y: 0 }, { x: 10, y: 0 }, 'left');
    expect(normal.x).toBeCloseTo(0, 5);
    expect(normal.y).toBeCloseTo(1, 5);
  });

  it('returns right normal', () => {
    const normal = wallNormal({ x: 0, y: 0 }, { x: 10, y: 0 }, 'right');
    expect(normal.x).toBeCloseTo(0, 5);
    expect(normal.y).toBeCloseTo(-1, 5);
  });
});

describe('isOnBlockingSide', () => {
  it('returns true when source is on blocking side', () => {
    // Wall from (0,0) to (10,0), left normal points up (+y)
    // Source at (5, 5) is on the left/positive-y side
    expect(isOnBlockingSide(
      { x: 5, y: 5 },
      { x: 0, y: 0 }, { x: 10, y: 0 },
      'left',
    )).toBe(true);
  });

  it('returns false when source is on non-blocking side', () => {
    expect(isOnBlockingSide(
      { x: 5, y: -5 },
      { x: 0, y: 0 }, { x: 10, y: 0 },
      'left',
    )).toBe(false);
  });
});

describe('clipPolygonToCircle', () => {
  it('returns empty for fewer than 3 vertices', () => {
    expect(clipPolygonToCircle([{ x: 0, y: 0 }], { x: 0, y: 0 }, 10)).toEqual([]);
  });

  it('clips a polygon with vertices inside the circle', () => {
    // Square centered at origin with corners inside the circle (radius 50),
    // but extending past it on one edge
    // Triangle: one vertex inside, two outside — the clipped result should be non-empty
    const triangle = [
      { x: 0, y: 0 },    // inside (at center)
      { x: 100, y: 0 },  // outside
      { x: 0, y: 100 },  // outside
    ];
    const result = clipPolygonToCircle(triangle, { x: 0, y: 0 }, 50);
    expect(result.length).toBeGreaterThan(0);
    // All resulting points should be within or on the circle
    for (const p of result) {
      expect(p.x * p.x + p.y * p.y).toBeLessThanOrEqual(50 * 50 + 1);
    }
  });
});
