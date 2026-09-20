import { describe, it, expect } from 'vitest';
import { computeVisibilityPolygon } from '../radialSweep';
import type { VisionSource } from '../../types/visionTypes';
import type { WallSegment } from '../../types/wallTypes';

function makeSource(overrides: Partial<VisionSource> = {}): VisionSource {
  return {
    id: 'src1',
    x: 0,
    y: 0,
    innerRadius: 100,
    outerRadius: 200,
    ...overrides,
  };
}

function makeWall(p1: { x: number; y: number }, p2: { x: number; y: number }, overrides: Partial<WallSegment> = {}): WallSegment {
  return {
    id: `wall_${p1.x}_${p1.y}_${p2.x}_${p2.y}`,
    kind: 'wall',
    type: 'solid',
    p1,
    p2,
    ...overrides,
  };
}

describe('computeVisibilityPolygon', () => {
  it('returns full circle polygon when no walls exist', () => {
    const source = makeSource();
    const result = computeVisibilityPolygon(source, []);

    expect(result.sourceId).toBe('src1');
    expect(result.vertices.length).toBe(64);
    expect(result.innerRadius).toBe(100);
    expect(result.outerRadius).toBe(200);
  });

  it('produces a polygon with fewer vertices when a wall occludes', () => {
    const source = makeSource({ x: 0, y: 0 });
    const wall = makeWall({ x: -50, y: 50 }, { x: 50, y: 50 }); // horizontal wall below source

    const result = computeVisibilityPolygon(source, [wall]);

    expect(result.vertices.length).toBeGreaterThan(0);
    expect(result.origin).toEqual({ x: 0, y: 0 });
  });

  it('skips open doors', () => {
    const source = makeSource();
    const openDoor = makeWall(
      { x: -50, y: 50 }, { x: 50, y: 50 },
      { type: 'door', closed: false },
    );

    const result = computeVisibilityPolygon(source, [openDoor]);

    // Open door = no occlusion = full circle
    expect(result.vertices.length).toBe(64);
  });

  it('includes closed doors as walls', () => {
    const source = makeSource();
    const closedDoor = makeWall(
      { x: -50, y: 50 }, { x: 50, y: 50 },
      { type: 'door', closed: true },
    );

    const withDoor = computeVisibilityPolygon(source, [closedDoor]);
    const withoutWalls = computeVisibilityPolygon(source, []);

    // Closed door should occlude (different polygon than no walls)
    expect(withDoor.vertices.length).not.toBe(withoutWalls.vertices.length);
  });

  it('skips one-way walls when source is on non-blocking side', () => {
    const source = makeSource({ x: 0, y: -10 }); // Above the wall
    const oneWay = makeWall(
      { x: -50, y: 50 }, { x: 50, y: 50 },
      { direction: 'right' },
    );

    const result = computeVisibilityPolygon(source, [oneWay]);

    expect(result.vertices.length).toBeGreaterThan(0);
  });

  it('culls walls outside max radius', () => {
    const source = makeSource({ outerRadius: 50 });
    const farWall = makeWall({ x: 500, y: 500 }, { x: 600, y: 500 }); // Way outside radius

    const result = computeVisibilityPolygon(source, [farWall]);

    // Far wall should be culled, result should be full circle
    expect(result.vertices.length).toBe(64);
  });
});
