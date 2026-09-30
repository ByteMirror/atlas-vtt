import type { Point } from '../../types/visionTypes';
import type { WallInput, WallSegment } from '../../types/wallTypes';
import { distSqToSegment } from '../../vision/visionGeometry';

/** Splits never leave a piece shorter than this share of the wall. */
const MIN_SPLIT_SHARE = 0.05;

/** The two walls replacing `wall` when it is split at the point nearest `at`; null for a zero-length wall. */
export function splitWall(wall: WallSegment, at: Point): [WallInput, WallInput] | null {
  const dx = wall.p2.x - wall.p1.x;
  const dy = wall.p2.y - wall.p1.y;
  const lengthSq = dx * dx + dy * dy;
  if (lengthSq === 0) return null;
  const projected = ((at.x - wall.p1.x) * dx + (at.y - wall.p1.y) * dy) / lengthSq;
  const t = Math.max(MIN_SPLIT_SHARE, Math.min(1 - MIN_SPLIT_SHARE, projected));
  const split = { x: wall.p1.x + t * dx, y: wall.p1.y + t * dy };
  const { id: _id, kind: _kind, p1, p2, ...shared } = wall;
  return [{ ...shared, p1, p2: split }, { ...shared, p1: split, p2 }];
}

/** Ramer–Douglas–Peucker: the fewest points that stay within `tolerance` of a freehand stroke. */
export function simplifyStroke(points: readonly Point[], tolerance: number): Point[] {
  if (points.length <= 2) return [...points];
  const first = points[0]!;
  const last = points[points.length - 1]!;
  let farthest = 0;
  let farthestIndex = 0;
  for (let i = 1; i < points.length - 1; i++) {
    const distance = Math.sqrt(distSqToSegment(points[i]!, first, last));
    if (distance > farthest) {
      farthest = distance;
      farthestIndex = i;
    }
  }
  if (farthest <= tolerance) return [first, last];
  const left = simplifyStroke(points.slice(0, farthestIndex + 1), tolerance);
  const right = simplifyStroke(points.slice(farthestIndex), tolerance);
  return [...left.slice(0, -1), ...right];
}
