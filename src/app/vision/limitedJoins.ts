import { LIMITED_JOIN } from '../lighting/lightingConstants';
import type { Point } from '../types/visionTypes';
import type { WallSegment } from '../types/wallTypes';

/** A stretch of a wall, as shares of its length from its first end. */
type Stretch = readonly [from: number, to: number];

/**
 * Which limited walls are one hedge, and where. A row of hedges is drawn in strokes that end
 * short of each other, past each other or over each other, and the sealing joins their ends
 * with limited bridges: a ray through such a joint meets two or three limited walls within a
 * few pixels, and would stop behind what is one hedge to the eye.
 *
 * Two limited walls run together along the stretch of each that lies within `LIMITED_JOIN` of
 * the other. A ray that meets both within those stretches has met one hedge. Two walls that
 * cross as an X are never one: they cross between their ends and every end is farther than
 * `LIMITED_JOIN` from the other wall, so what lies behind both stays behind two. (Strokes drawn
 * over each other that happen to cross have an end beside the other stroke, and are one.)
 *
 * The stretches are fixed by the walls, not by the ray, so the count changes only at their
 * ends: `points` are those that lie within a wall, where the sweep casts rays as at wall ends.
 */
export interface LimitedJoins {
  /** Whether a ray that met `a` at share `ua` of its length and `b` at `ub` met one hedge. */
  together(a: WallSegment, ua: number, b: WallSegment, ub: number): boolean;
  points: Point[];
}

const NONE: LimitedJoins = { together: () => false, points: [] };

export function limitedJoins(limited: readonly WallSegment[]): LimitedJoins {
  if (limited.length < 2) return NONE;
  const stretches = new Map<WallSegment, Map<WallSegment, Stretch>>();
  const points: Point[] = [];
  const note = (wall: WallSegment, other: WallSegment, stretch: Stretch): void => {
    let of = stretches.get(wall);
    if (!of) stretches.set(wall, (of = new Map<WallSegment, Stretch>()));
    of.set(other, stretch);
    for (const share of stretch) {
      if (share > 1e-9 && share < 1 - 1e-9) points.push({ x: wall.p1.x + (wall.p2.x - wall.p1.x) * share, y: wall.p1.y + (wall.p2.y - wall.p1.y) * share });
    }
  };
  const boxes = limited.map((wall) => ({ wall, minX: Math.min(wall.p1.x, wall.p2.x), maxX: Math.max(wall.p1.x, wall.p2.x), minY: Math.min(wall.p1.y, wall.p2.y), maxY: Math.max(wall.p1.y, wall.p2.y) }));
  boxes.sort((a, b) => a.minX - b.minX);
  for (let i = 0; i < boxes.length; i++) {
    const a = boxes[i]!;
    for (let j = i + 1; j < boxes.length && boxes[j]!.minX <= a.maxX + LIMITED_JOIN; j++) {
      const b = boxes[j]!;
      if (b.minY > a.maxY + LIMITED_JOIN || b.maxY < a.minY - LIMITED_JOIN) continue;
      const ofA = within(a.wall, b.wall), ofB = ofA && within(b.wall, a.wall);
      if (!ofA || !ofB || crossAsX(a.wall, b.wall)) continue;
      note(a.wall, b.wall, ofA);
      note(b.wall, a.wall, ofB);
    }
  }
  const inside = (stretch: Stretch | undefined, share: number): boolean => !!stretch && share >= stretch[0] - 1e-9 && share <= stretch[1] + 1e-9;
  return {
    together: (a, ua, b, ub) => inside(stretches.get(a)?.get(b), ua) && inside(stretches.get(b)?.get(a), ub),
    points,
  };
}

/** The stretch of `wall` within `LIMITED_JOIN` of `other`, or null: one stretch, since the distance to a segment is convex along a line. */
function within(wall: WallSegment, other: WallSegment): Stretch | null {
  const dx = wall.p2.x - wall.p1.x, dy = wall.p2.y - wall.p1.y;
  const ex = other.p2.x - other.p1.x, ey = other.p2.y - other.p1.y;
  const length = Math.hypot(ex, ey);
  let from = Infinity, to = -Infinity;
  const add = (lo: number, hi: number): void => {
    if (lo > hi || hi < 0 || lo > 1) return;
    from = Math.min(from, Math.max(0, lo));
    to = Math.max(to, Math.min(1, hi));
  };
  // Within reach of either end of the other wall.
  for (const end of [other.p1, other.p2]) {
    const a = dx * dx + dy * dy, b = 2 * ((wall.p1.x - end.x) * dx + (wall.p1.y - end.y) * dy), c = (wall.p1.x - end.x) ** 2 + (wall.p1.y - end.y) ** 2 - LIMITED_JOIN ** 2;
    const disc = b * b - 4 * a * c;
    if (a > 0 && disc >= 0) add((-b - Math.sqrt(disc)) / (2 * a), (-b + Math.sqrt(disc)) / (2 * a));
  }
  // Beside the other wall: within reach of its line, between its ends.
  if (length > 0) {
    const side = between(((wall.p1.x - other.p1.x) * -ey + (wall.p1.y - other.p1.y) * ex) / length, (dx * -ey + dy * ex) / length, -LIMITED_JOIN, LIMITED_JOIN);
    const along = between(((wall.p1.x - other.p1.x) * ex + (wall.p1.y - other.p1.y) * ey) / length, (dx * ex + dy * ey) / length, 0, length);
    if (side && along) add(Math.max(side[0], along[0]), Math.min(side[1], along[1]));
  }
  return from <= to ? [from, to] : null;
}

/** The shares s for which lo <= at + s * step <= hi, or null. */
function between(at: number, step: number, lo: number, hi: number): [number, number] | null {
  if (Math.abs(step) < 1e-12) return at >= lo && at <= hi ? [-Infinity, Infinity] : null;
  const a = (lo - at) / step, b = (hi - at) / step;
  return [Math.min(a, b), Math.max(a, b)];
}

/** Whether two walls cross between their ends with every end farther than `LIMITED_JOIN` from the other wall. */
function crossAsX(a: WallSegment, b: WallSegment): boolean {
  const rx = a.p2.x - a.p1.x, ry = a.p2.y - a.p1.y, sx = b.p2.x - b.p1.x, sy = b.p2.y - b.p1.y;
  const denom = rx * sy - ry * sx;
  if (Math.abs(denom) < 1e-10) return false;
  const t = ((b.p1.x - a.p1.x) * sy - (b.p1.y - a.p1.y) * sx) / denom;
  const u = ((b.p1.x - a.p1.x) * ry - (b.p1.y - a.p1.y) * rx) / denom;
  if (!(t > 0 && t < 1 && u > 0 && u < 1)) return false;
  return [a.p1, a.p2].every((end) => apart(end, b)) && [b.p1, b.p2].every((end) => apart(end, a));
}

function apart(p: Point, wall: WallSegment): boolean {
  const dx = wall.p2.x - wall.p1.x, dy = wall.p2.y - wall.p1.y;
  const t = Math.max(0, Math.min(1, ((p.x - wall.p1.x) * dx + (p.y - wall.p1.y) * dy) / (dx * dx + dy * dy || 1)));
  return Math.hypot(p.x - wall.p1.x - dx * t, p.y - wall.p1.y - dy * t) > LIMITED_JOIN;
}
