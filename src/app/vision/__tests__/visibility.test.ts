import { describe, expect, it } from 'vitest';
import { blocksFrom, computeVisibility, pointInPolygon } from '../visibility';
import type { Point } from '../../types/visionTypes';
import type { WallSegment } from '../../types/wallTypes';

function wall(p1: Point, p2: Point, overrides: Partial<WallSegment> = {}): WallSegment {
  return { id: `w_${p1.x}_${p1.y}_${p2.x}_${p2.y}`, kind: 'wall', type: 'solid', p1, p2, ...overrides };
}

const origin = { x: 0, y: 0 };
const southWall = wall({ x: -50, y: 50 }, { x: 50, y: 50 });

describe('computeVisibility', () => {
  it('sees a full circle without walls', () => {
    const poly = computeVisibility(origin, 200, []);
    expect(pointInPolygon({ x: 0, y: 150 }, poly)).toBe(true);
    expect(pointInPolygon({ x: 0, y: 250 }, poly)).toBe(false);
  });

  it('hides what lies behind a wall', () => {
    const poly = computeVisibility(origin, 200, [southWall]);
    expect(pointInPolygon({ x: 0, y: 30 }, poly)).toBe(true);
    expect(pointInPolygon({ x: 0, y: 100 }, poly)).toBe(false);
    expect(pointInPolygon({ x: 0, y: -100 }, poly)).toBe(true);
  });

  it('lets sight through open doors and blocks closed ones', () => {
    const open = computeVisibility(origin, 200, [{ ...southWall, type: 'door', closed: false }]);
    const closed = computeVisibility(origin, 200, [{ ...southWall, type: 'door', closed: true }]);
    expect(pointInPolygon({ x: 0, y: 100 }, open)).toBe(true);
    expect(pointInPolygon({ x: 0, y: 100 }, closed)).toBe(false);
  });

  it('blocks a one-way wall only from its blocking side', () => {
    const oneWay = { ...southWall, direction: 'right' as const };
    const above = { x: 0, y: -10 };
    const below = { x: 0, y: 110 };
    expect(blocksFrom(oneWay, above)).not.toBe(blocksFrom(oneWay, below));
  });

  it('ignores walls beyond the radius', () => {
    const poly = computeVisibility(origin, 50, [wall({ x: 500, y: 500 }, { x: 600, y: 500 })]);
    expect(pointInPolygon({ x: 40, y: 0 }, poly)).toBe(true);
  });

  it('ignores zero-length walls', () => {
    const poly = computeVisibility(origin, 100, [wall({ x: 50, y: 0 }, { x: 50, y: 0 })]);
    expect(poly.every((p) => Number.isFinite(p.x) && Number.isFinite(p.y))).toBe(true);
    expect(pointInPolygon({ x: 80, y: 0 }, poly)).toBe(true);
  });

  it('handles an origin exactly on a wall endpoint', () => {
    const poly = computeVisibility({ x: 50, y: 50 }, 100, [southWall]);
    expect(poly.length).toBeGreaterThan(2);
    expect(poly.every((p) => Number.isFinite(p.x) && Number.isFinite(p.y))).toBe(true);
  });
});
