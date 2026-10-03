import type { Point } from '../types/visionTypes';
import type { WallSegment } from '../types/wallTypes';
import type { LimitedJoins } from './limitedJoins';

/** The same tolerances as `raySegmentIntersect`: a ray meets a limited wall where it would meet any wall. */
const EPSILON = 1e-10;

/** Where a ray meets a limited wall: how far along the ray, and at which share of the wall's length from its first end. */
export interface LimitedHit {
  t: number;
  wall: WallSegment;
  u: number;
}

/** Where a ray from `origin` along the unit vector (dx, dy) meets `wall`, or null. */
export function limitedHit(origin: Point, dx: number, dy: number, wall: WallSegment): LimitedHit | null {
  const { p1, p2 } = wall;
  const ex = p2.x - p1.x, ey = p2.y - p1.y;
  const denom = dx * ey - dy * ex;
  if (Math.abs(denom) < EPSILON) return null;
  const t = ((p1.x - origin.x) * ey - (p1.y - origin.y) * ex) / denom;
  const u = ((p1.x - origin.x) * dy - (p1.y - origin.y) * dx) / denom;
  return t < EPSILON || u < -EPSILON || u > 1 + EPSILON ? null : { t, wall, u };
}

/**
 * Where a ray that met limited walls at `hits` stops: at the second hedge it crosses, with the
 * walls it stops at; null if it crosses fewer than two. The walls are counted in the order the
 * ray meets them, and a wall that runs together with the one that began a hedge is that hedge
 * still (`LimitedJoins`): the two walls of a corner for a ray through it or close by it, the
 * strokes of a row that end past each other, the bridges of a sealed joint. So a corner is
 * never a hole and never counted twice. Sorts `hits`.
 */
export function secondCrossing(hits: LimitedHit[], joins: LimitedJoins): { t: number; walls: WallSegment[] } | null {
  if (hits.length < 2) return null;
  hits.sort((a, b) => a.t - b.t);
  const lead = hits[0]!;
  for (let i = 1; i < hits.length; i++) {
    const hit = hits[i]!;
    if (joins.together(lead.wall, lead.u, hit.wall, hit.u)) continue;
    // The second hedge: this wall, and those behind it that are one hedge with it.
    const walls = [hit.wall];
    for (let j = i + 1; j < hits.length && joins.together(hit.wall, hit.u, hits[j]!.wall, hits[j]!.u); j++) walls.push(hits[j]!.wall);
    return { t: hit.t, walls };
  }
  return null;
}

/**
 * The points where a limited wall crosses another wall between the ends of both. Along a ray
 * to either side of such a point the two walls come in the other order, so the wall a ray stops
 * at changes there without any wall ending: the sweep casts rays at these points as it does at
 * wall ends, or the polygon's edge from one side to the other would cut behind both walls.
 * Two solid walls that cross need none: the nearer of two walls is the same wall's line on
 * either side as far as the polygon's edge goes, which then cuts a corner off what is seen and
 * never adds to it.
 */
export function limitedCrossings(walls: readonly WallSegment[]): Point[] {
  const boxes = walls.map((wall) => ({ wall, minX: Math.min(wall.p1.x, wall.p2.x), maxX: Math.max(wall.p1.x, wall.p2.x), minY: Math.min(wall.p1.y, wall.p2.y), maxY: Math.max(wall.p1.y, wall.p2.y) }));
  boxes.sort((a, b) => a.minX - b.minX);
  const points: Point[] = [];
  for (let i = 0; i < boxes.length; i++) {
    const a = boxes[i]!;
    for (let j = i + 1; j < boxes.length && boxes[j]!.minX <= a.maxX; j++) {
      const b = boxes[j]!;
      if (!(a.wall.limited || b.wall.limited) || b.minY > a.maxY || b.maxY < a.minY) continue;
      const point = crossingOf(a.wall, b.wall);
      if (point) points.push(point);
    }
  }
  return points;
}

/** Where two walls cross between their ends, or null: at an end the sweep casts its rays anyway. */
function crossingOf(a: WallSegment, b: WallSegment): Point | null {
  const rx = a.p2.x - a.p1.x, ry = a.p2.y - a.p1.y, sx = b.p2.x - b.p1.x, sy = b.p2.y - b.p1.y;
  const denom = rx * sy - ry * sx;
  if (Math.abs(denom) < EPSILON) return null;
  const t = ((b.p1.x - a.p1.x) * sy - (b.p1.y - a.p1.y) * sx) / denom;
  const u = ((b.p1.x - a.p1.x) * ry - (b.p1.y - a.p1.y) * rx) / denom;
  return t > 0 && t < 1 && u > 0 && u < 1 ? { x: a.p1.x + rx * t, y: a.p1.y + ry * t } : null;
}
