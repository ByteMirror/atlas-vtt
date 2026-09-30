import { describe, expect, it } from 'vitest';
import { computeVisibility, pointInPolygon, type Polygon } from '../visibility';
import { visionCone } from '../visionCone';
import type { Point } from '../../types/visionTypes';
import type { WallSegment } from '../../types/wallTypes';

const origin = { x: 0, y: 0 };
const RIGHT = 0;
const LEFT = Math.PI;
const QUARTER = Math.PI / 2;

function wall(p1: Point, p2: Point): WallSegment {
  return { id: `w_${p1.x}_${p1.y}_${p2.x}_${p2.y}`, kind: 'wall', type: 'solid', p1, p2 };
}

const room = [
  wall({ x: -120, y: -80 }, { x: 120, y: -80 }),
  wall({ x: 60, y: 30 }, { x: 60, y: 140 }),
  wall({ x: -90, y: 20 }, { x: -40, y: 90 }),
  wall({ x: -150, y: -30 }, { x: -150, y: 30 }),
];

function relativeAngle(point: Point, start: number): number {
  const turn = 2 * Math.PI;
  const rel = (((Math.atan2(point.y - origin.y, point.x - origin.x) - start) % turn) + turn) % turn;
  return rel > turn - 1e-9 ? 0 : rel;
}

describe('computeVisibility with a vision cone', () => {
  it('sees only within the cone', () => {
    const poly = computeVisibility(origin, 200, [], { facing: RIGHT, angle: QUARTER });
    expect(pointInPolygon({ x: 150, y: 0 }, poly)).toBe(true);
    expect(pointInPolygon({ x: 100, y: 90 }, poly)).toBe(true);
    expect(pointInPolygon({ x: 100, y: -90 }, poly)).toBe(true);
    expect(pointInPolygon({ x: 100, y: 110 }, poly)).toBe(false);
    expect(pointInPolygon({ x: 0, y: 150 }, poly)).toBe(false);
    expect(pointInPolygon({ x: -150, y: 0 }, poly)).toBe(false);
    expect(pointInPolygon({ x: 250, y: 0 }, poly)).toBe(false);
  });

  it('handles a cone across the ±π seam', () => {
    const poly = computeVisibility(origin, 200, [], { facing: LEFT, angle: QUARTER });
    expect(pointInPolygon({ x: -150, y: 10 }, poly)).toBe(true);
    expect(pointInPolygon({ x: -150, y: -10 }, poly)).toBe(true);
    expect(pointInPolygon({ x: 150, y: 0 }, poly)).toBe(false);
    expect(pointInPolygon({ x: 0, y: -150 }, poly)).toBe(false);
  });

  it('handles a cone wider than a half turn', () => {
    const poly = computeVisibility(origin, 200, [], { facing: RIGHT, angle: 1.5 * Math.PI });
    expect(pointInPolygon({ x: 0, y: 150 }, poly)).toBe(true);
    expect(pointInPolygon({ x: 0, y: -150 }, poly)).toBe(true);
    expect(pointInPolygon({ x: -100, y: 150 }, poly)).toBe(true);
    expect(pointInPolygon({ x: -150, y: 100 }, poly)).toBe(false);
    expect(pointInPolygon({ x: -150, y: 0 }, poly)).toBe(false);
  });

  it('gives exactly the full polygon for a full turn', () => {
    expect(computeVisibility(origin, 200, room, { facing: 1.3, angle: 2 * Math.PI })).toEqual(computeVisibility(origin, 200, room));
  });

  it('closes through the origin and stays star-shaped around it', () => {
    for (const facing of [RIGHT, QUARTER, LEFT, -QUARTER, 2.5]) {
      for (const angle of [0.2, QUARTER, Math.PI, 1.8 * Math.PI]) {
        const poly = computeVisibility(origin, 200, room, { facing, angle });
        expect(poly[0]).toEqual(origin);
        const start = facing - angle / 2;
        const rel = poly.slice(1).map((p) => relativeAngle(p, start));
        for (let i = 1; i < rel.length; i++) expect(rel[i]!).toBeGreaterThanOrEqual(rel[i - 1]! - 1e-9);
        expect(rel[rel.length - 1]!).toBeLessThanOrEqual(angle + 1e-9);
      }
    }
  });

  it('only ever removes sight: nothing outside the full polygon, everything inside the cone kept', () => {
    const full = computeVisibility(origin, 200, room);
    for (const facing of [RIGHT, 0.7, LEFT, -2]) {
      const cone = { facing, angle: 2 };
      const poly = computeVisibility(origin, 200, room, cone);
      for (let y = -210; y <= 210; y += 7) {
        for (let x = -210; x <= 210; x += 7) {
          const p = { x: x + 0.5, y: y + 0.5 };
          if (pointInPolygon(p, poly)) expect(pointInPolygon(p, full)).toBe(true);
          const rel = relativeAngle(p, facing - cone.angle / 2);
          const wellInside = rel > 0.05 && rel < cone.angle - 0.05;
          if (wellInside && pointInPolygon(p, full) && !nearBoundary(p, full)) expect(pointInPolygon(p, poly)).toBe(true);
        }
      }
    }
  });
});

describe('visionCone', () => {
  it('faces the token art: rotation 0 looks up, rotation grows clockwise on screen', () => {
    expect(visionCone(0, 90)!.facing).toBeCloseTo(-QUARTER);
    expect(visionCone(undefined, 90)!.facing).toBeCloseTo(-QUARTER);
    expect(visionCone(90, 90)!.facing).toBeCloseTo(0);
    expect(visionCone(180, 90)!.facing).toBeCloseTo(QUARTER);
    expect(Math.cos(visionCone(-90, 90)!.facing)).toBeCloseTo(-1);
    expect(Math.cos(visionCone(270, 90)!.facing)).toBeCloseTo(-1);
    expect(visionCone(0, 90)!.angle).toBeCloseTo(QUARTER);
  });

  it('has no cone for a full turn, an unset angle or nonsense', () => {
    expect(visionCone(45, undefined)).toBeUndefined();
    expect(visionCone(45, 360)).toBeUndefined();
    expect(visionCone(45, 400)).toBeUndefined();
    expect(visionCone(45, 0)).toBeUndefined();
    expect(visionCone(45, -30)).toBeUndefined();
    expect(visionCone(45, Number.NaN)).toBeUndefined();
  });

  it('never narrows below one degree', () => {
    expect(visionCone(0, 0.2)!.angle).toBeCloseTo(Math.PI / 180);
  });
});

/** Within a pixel of the polygon's outline, where the sampled chords of the two polygons may differ. */
function nearBoundary(p: Point, poly: Polygon): boolean {
  return poly.some((a, i) => {
    const b = poly[(i + 1) % poly.length]!;
    const dx = b.x - a.x, dy = b.y - a.y;
    const t = Math.max(0, Math.min(1, ((p.x - a.x) * dx + (p.y - a.y) * dy) / (dx * dx + dy * dy || 1)));
    return Math.hypot(p.x - a.x - t * dx, p.y - a.y - t * dy) < 1;
  });
}
