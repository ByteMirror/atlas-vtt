import type { Point } from '../../types/visionTypes';
import type { WallChannel, WallSegment } from '../../types/wallTypes';
import { LIMITED_JOIN } from '../../lighting/lightingConstants';
import { limitedJoins } from '../limitedJoins';
import { blocksFrom } from '../visibility';

/**
 * The rule of limited walls counted by hand, for tests to hold the sweep and the picture
 * against: every wall a straight way crosses, in the order it meets them. A solid wall stops
 * it, and so does the second hedge; limited walls that run together are one hedge.
 */

/** Where the way from `from` to `to` meets `wall`, as a share of the way, or null: the closed segment, as the sweep reads it. */
export function meetsAt(from: Point, to: Point, wall: WallSegment): number | null {
  const rx = to.x - from.x, ry = to.y - from.y, ex = wall.p2.x - wall.p1.x, ey = wall.p2.y - wall.p1.y;
  const den = rx * ey - ry * ex;
  if (Math.abs(den) < 1e-12) return null;
  const t = ((wall.p1.x - from.x) * ey - (wall.p1.y - from.y) * ex) / den, u = ((wall.p1.x - from.x) * ry - (wall.p1.y - from.y) * rx) / den;
  return t > 0 && u >= 0 && u <= 1 ? t : null;
}

interface Met { t: number; wall: WallSegment; at: Point }

/** Every wall the ray from `from` through `to` meets, nearest first. */
function metAlong(from: Point, to: Point, walls: readonly WallSegment[], channel?: WallChannel): Met[] {
  return walls.filter((wall) => blocksFrom(wall, from, channel)).flatMap((wall) => {
    const t = meetsAt(from, to, wall);
    return t === null ? [] : [{ t, wall, at: { x: from.x + (to.x - from.x) * t, y: from.y + (to.y - from.y) * t } }];
  }).sort((a, b) => a.t - b.t);
}

/** Whether two limited walls cross as an X: between their ends, with every end farther from the other wall than hedges are joined at. */
export function crossAsX(a: WallSegment, b: WallSegment): boolean {
  return crossingPoint(a, b) !== null && [a.p1, a.p2].every((end) => distanceToSegment(end, b.p1, b.p2) > LIMITED_JOIN) && [b.p1, b.p2].every((end) => distanceToSegment(end, a.p1, a.p2) > LIMITED_JOIN);
}

/**
 * Whether a way that met limited wall `a` at `pa` and `b` at `pb` met one hedge: each where it
 * runs within `LIMITED_JOIN` of the other, the two not crossing as an X.
 */
export function oneHedge(a: WallSegment, pa: Point, b: WallSegment, pb: Point): boolean {
  return distanceToSegment(pa, b.p1, b.p2) <= LIMITED_JOIN && distanceToSegment(pb, a.p1, a.p2) <= LIMITED_JOIN && !crossAsX(a, b);
}

/**
 * Walks what a way met: `stopped` is where it meets a solid wall or its second hedge (null if
 * neither), `hedges` how many hedges it crossed before that. A hedge is a limited wall, with
 * every further one the way meets that is one hedge with it (`oneHedge`).
 */
function walk(met: readonly Met[]): { stopped: number | null; solid: boolean; hedges: number } {
  let hedges = 0, lead: Met | null = null;
  for (const hit of met) {
    if (!hit.wall.limited) return { stopped: hit.t, solid: true, hedges };
    if (lead && oneHedge(lead.wall, lead.at, hit.wall, hit.at)) continue;
    lead = hit;
    if (++hedges === 2) return { stopped: hit.t, solid: false, hedges };
  }
  return { stopped: null, solid: false, hedges };
}

/** What stands between `from` and `to`: whether a solid wall does, and how many hedges (two: the second stops the way). */
export function crossedByHand(from: Point, to: Point, walls: readonly WallSegment[], channel?: WallChannel): { solid: boolean; limited: number } {
  const { solid, hedges } = walk(metAlong(from, to, walls, channel).filter((hit) => hit.t <= 1));
  return { solid, limited: hedges };
}

/** How far a ray from `from` along `angle` reaches: to the first solid wall or the second hedge, whichever it meets first. */
export function reachByHand(from: Point, angle: number, walls: readonly WallSegment[], channel?: WallChannel): number {
  return walk(metAlong(from, { x: from.x + Math.cos(angle), y: from.y + Math.sin(angle) }, walls, channel)).stopped ?? Infinity;
}

export function distanceToSegment(p: Point, a: Point, b: Point): number {
  const dx = b.x - a.x, dy = b.y - a.y;
  const t = Math.max(0, Math.min(1, ((p.x - a.x) * dx + (p.y - a.y) * dy) / (dx * dx + dy * dy || 1)));
  return Math.hypot(p.x - a.x - dx * t, p.y - a.y - dy * t);
}

/** Where two walls cross between their ends, or null. */
export function crossingPoint(a: WallSegment, b: WallSegment): Point | null {
  const rx = a.p2.x - a.p1.x, ry = a.p2.y - a.p1.y, sx = b.p2.x - b.p1.x, sy = b.p2.y - b.p1.y;
  const den = rx * sy - ry * sx;
  if (Math.abs(den) < 1e-9) return null;
  const t = ((b.p1.x - a.p1.x) * sy - (b.p1.y - a.p1.y) * sx) / den, u = ((b.p1.x - a.p1.x) * ry - (b.p1.y - a.p1.y) * rx) / den;
  return t > 0 && t < 1 && u > 0 && u < 1 ? { x: a.p1.x + rx * t, y: a.p1.y + ry * t } : null;
}

/** The points a shadow's edge can start from: every wall's ends, where two walls cross, and where two limited walls begin to run together. */
export function turningPoints(walls: readonly WallSegment[]): Point[] {
  const points = [...walls.flatMap((wall) => [wall.p1, wall.p2]), ...limitedJoins(walls.filter((wall) => wall.limited)).points];
  for (let i = 0; i < walls.length; i++) {
    for (let j = i + 1; j < walls.length; j++) {
      const at = crossingPoint(walls[i]!, walls[j]!);
      if (at) points.push(at);
    }
  }
  return points;
}

/** Whether the way from `from` to `to` passes one of `points` within `clear`: there a hair decides what it crosses. */
export function grazes(from: Point, to: Point, points: readonly Point[], clear: number): boolean {
  return points.some((point) => distanceToSegment(point, from, to) < clear);
}

/** Whether two walls come within `reach` of each other anywhere. */
export function wallsWithin(a: WallSegment, b: WallSegment, reach: number): boolean {
  return crossingPoint(a, b) !== null || Math.min(distanceToSegment(a.p1, b.p1, b.p2), distanceToSegment(a.p2, b.p1, b.p2), distanceToSegment(b.p1, a.p1, a.p2), distanceToSegment(b.p2, a.p1, a.p2)) <= reach;
}
