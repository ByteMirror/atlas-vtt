import type { Point } from '../types/visionTypes';

const EPSILON = 1e-10;

/** Line-segment intersection. Returns intersection point or null. */
export function segmentIntersection(
  a1: Point, a2: Point,
  b1: Point, b2: Point,
): Point | null {
  const dx1 = a2.x - a1.x;
  const dy1 = a2.y - a1.y;
  const dx2 = b2.x - b1.x;
  const dy2 = b2.y - b1.y;

  const denom = dx1 * dy2 - dy1 * dx2;
  if (Math.abs(denom) < EPSILON) return null;

  const t = ((b1.x - a1.x) * dy2 - (b1.y - a1.y) * dx2) / denom;
  const u = ((b1.x - a1.x) * dy1 - (b1.y - a1.y) * dx1) / denom;

  if (t < -EPSILON || t > 1 + EPSILON || u < -EPSILON || u > 1 + EPSILON) return null;

  return { x: a1.x + t * dx1, y: a1.y + t * dy1 };
}

/** Ray-segment intersection. Returns parameter t along ray or Infinity. */
export function raySegmentIntersect(
  origin: Point, angle: number,
  p1: Point, p2: Point,
): number {
  const dx = Math.cos(angle);
  const dy = Math.sin(angle);

  const ex = p2.x - p1.x;
  const ey = p2.y - p1.y;

  const denom = dx * ey - dy * ex;
  if (Math.abs(denom) < EPSILON) return Infinity;

  const t = ((p1.x - origin.x) * ey - (p1.y - origin.y) * ex) / denom;
  const u = ((p1.x - origin.x) * dy - (p1.y - origin.y) * dx) / denom;

  if (t < EPSILON || u < -EPSILON || u > 1 + EPSILON) return Infinity;
  return t;
}

/** Distance squared between two points. */
export function distSq(a: Point, b: Point): number {
  const dx = a.x - b.x;
  const dy = a.y - b.y;
  return dx * dx + dy * dy;
}

/** Angle from origin to point in radians [-PI, PI]. */
export function angleTo(origin: Point, target: Point): number {
  return Math.atan2(target.y - origin.y, target.x - origin.x);
}

/** Clip polygon to circle centered at origin with given radius. */
export function clipPolygonToCircle(
  polygon: Point[],
  center: Point,
  radius: number,
): Point[] {
  if (polygon.length < 3) return [];
  const rSq = radius * radius;
  const result: Point[] = [];

  for (let i = 0; i < polygon.length; i++) {
    const curr = polygon[i]!;
    const next = polygon[(i + 1) % polygon.length]!;
    const currInside = distSq(curr, center) <= rSq + EPSILON;
    const nextInside = distSq(next, center) <= rSq + EPSILON;

    if (currInside) {
      result.push(curr);
      if (!nextInside) {
        const inter = lineCircleIntersection(curr, next, center, radius);
        if (inter) result.push(inter);
      }
    } else {
      if (nextInside) {
        const inter = lineCircleIntersection(curr, next, center, radius);
        if (inter) result.push(inter);
      } else {
        // Both outside — check if segment crosses circle
        const inters = lineCircleIntersections(curr, next, center, radius);
        for (const inter of inters) result.push(inter);
      }
    }
  }

  return result.length >= 3 ? result : [];
}

/** First intersection of line segment with circle. */
function lineCircleIntersection(
  p1: Point, p2: Point,
  center: Point, radius: number,
): Point | null {
  const inters = lineCircleIntersections(p1, p2, center, radius);
  return inters.length > 0 ? inters[0]! : null;
}

/** All intersections of a line segment with a circle (0, 1, or 2). */
function lineCircleIntersections(
  p1: Point, p2: Point,
  center: Point, radius: number,
): Point[] {
  const dx = p2.x - p1.x;
  const dy = p2.y - p1.y;
  const fx = p1.x - center.x;
  const fy = p1.y - center.y;

  const a = dx * dx + dy * dy;
  const b = 2 * (fx * dx + fy * dy);
  const c = fx * fx + fy * fy - radius * radius;

  let disc = b * b - 4 * a * c;
  if (disc < 0) return [];

  disc = Math.sqrt(disc);
  const results: Point[] = [];

  const t1 = (-b - disc) / (2 * a);
  if (t1 >= -EPSILON && t1 <= 1 + EPSILON) {
    results.push({ x: p1.x + t1 * dx, y: p1.y + t1 * dy });
  }

  const t2 = (-b + disc) / (2 * a);
  if (t2 >= -EPSILON && t2 <= 1 + EPSILON && Math.abs(t2 - t1) > EPSILON) {
    results.push({ x: p1.x + t2 * dx, y: p1.y + t2 * dy });
  }

  return results;
}

/** Compute the outward normal of a wall segment (for one-way walls). */
export function wallNormal(
  p1: Point, p2: Point,
  direction: 'left' | 'right',
): Point {
  const dx = p2.x - p1.x;
  const dy = p2.y - p1.y;
  const len = Math.sqrt(dx * dx + dy * dy);
  if (len < EPSILON) return { x: 0, y: 0 };
  if (direction === 'left') {
    return { x: -dy / len, y: dx / len };
  }
  return { x: dy / len, y: -dx / len };
}

/** Check if source is on the blocking side of a one-way wall. */
export function isOnBlockingSide(
  source: Point,
  wallP1: Point, wallP2: Point,
  direction: 'left' | 'right',
): boolean {
  const normal = wallNormal(wallP1, wallP2, direction);
  const toSource = {
    x: source.x - (wallP1.x + wallP2.x) / 2,
    y: source.y - (wallP1.y + wallP2.y) / 2,
  };
  return (normal.x * toSource.x + normal.y * toSource.y) > 0;
}
