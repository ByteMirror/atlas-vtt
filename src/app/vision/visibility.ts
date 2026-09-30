import type { Point } from '../types/visionTypes';
import type { WallSegment } from '../types/wallTypes';
import { angleTo, distSqToSegment, isOnBlockingSide, raySegmentIntersect } from './visionGeometry';

export type Polygon = Point[];

export interface MapBounds {
  width: number;
  height: number;
}

const BOUNDARY_RAYS = 64;
const RAY_OFFSET = 1e-5;

/** Whether `wall` stops sight and light coming from `origin`: open doors never do, one-way walls only from one side. */
export function blocksFrom(wall: WallSegment, origin: Point): boolean {
  if ((wall.type === 'door' || wall.type === 'secret-door') && !(wall.closed ?? true)) return false;
  if (wall.p1.x === wall.p2.x && wall.p1.y === wall.p2.y) return false;
  return !wall.direction || isOnBlockingSide(origin, wall.p1, wall.p2, wall.direction);
}

/** Walls that block from `origin` and come within `radius` of it. */
export function wallsInReach(walls: readonly WallSegment[], origin: Point, radius: number): WallSegment[] {
  const radiusSq = radius * radius;
  return walls.filter((wall) => blocksFrom(wall, origin) && distSqToSegment(origin, wall.p1, wall.p2) <= radiusSq);
}

/**
 * The area visible from `origin` up to `radius`, as a star-shaped polygon around it.
 * Radial sweep: a ray at every wall endpoint (and just beside it) plus evenly spaced
 * boundary rays, each stopped by the nearest wall.
 */
export function computeVisibility(origin: Point, radius: number, walls: readonly WallSegment[]): Polygon {
  const blocking = wallsInReach(walls, origin, radius);
  const angles: number[] = [];
  for (let i = 0; i < BOUNDARY_RAYS; i++) angles.push(-Math.PI + (2 * Math.PI * i) / BOUNDARY_RAYS);
  for (const wall of blocking) {
    for (const end of [wall.p1, wall.p2]) {
      if (end.x === origin.x && end.y === origin.y) continue;
      const angle = angleTo(origin, end);
      angles.push(angle - RAY_OFFSET, angle, angle + RAY_OFFSET);
    }
  }
  angles.sort((a, b) => a - b);
  const spans = angularSpans(origin, blocking);
  const seam = spans.filter((span) => span.wraps);
  const ordered = spans.filter((span) => !span.wraps).sort((a, b) => a.from - b.from);
  let next = 0;
  let active: AngularSpan[] = [];
  return angles.map((angle) => {
    while (next < ordered.length && ordered[next]!.from <= angle + SPAN_SLACK) active.push(ordered[next++]!);
    active = active.filter((span) => span.to >= angle - SPAN_SLACK);
    let reach = radius;
    for (const span of active) reach = Math.min(reach, raySegmentIntersect(origin, angle, span.wall.p1, span.wall.p2));
    for (const span of seam) {
      if (angle >= span.from - SPAN_SLACK || angle <= span.to + SPAN_SLACK) reach = Math.min(reach, raySegmentIntersect(origin, angle, span.wall.p1, span.wall.p2));
    }
    return { x: origin.x + Math.cos(angle) * reach, y: origin.y + Math.sin(angle) * reach };
  });
}

/** Angles slightly beyond a wall's own, so rays at its ends always test it. */
const SPAN_SLACK = 1e-4;

interface AngularSpan {
  wall: WallSegment;
  from: number;
  to: number;
  /** Crosses the ±π seam: covers angles ≥ from and ≤ to. */
  wraps: boolean;
}

/** The angles each wall covers as seen from `origin` (always less than π, since it is a segment). */
function angularSpans(origin: Point, walls: readonly WallSegment[]): AngularSpan[] {
  return walls.map((wall) => {
    const a = angleTo(origin, wall.p1), b = angleTo(origin, wall.p2);
    const [lo, hi] = a < b ? [a, b] : [b, a];
    const wraps = hi - lo > Math.PI;
    return { wall, from: wraps ? hi : lo, to: wraps ? lo : hi, wraps };
  });
}

/** Even-odd point-in-polygon test. */
export function pointInPolygon(point: Point, polygon: Polygon): boolean {
  let inside = false;
  for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i++) {
    const a = polygon[i]!;
    const b = polygon[j]!;
    if ((a.y > point.y) !== (b.y > point.y) && point.x < ((b.x - a.x) * (point.y - a.y)) / (b.y - a.y) + a.x) {
      inside = !inside;
    }
  }
  return inside;
}
