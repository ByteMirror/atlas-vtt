import type { Point } from '../types/visionTypes';
import type { Polygon } from './visibility';
import { angleTo, raySegmentIntersect } from './visionGeometry';

const TURN = 2 * Math.PI;
const DEGREE = Math.PI / 180;
/** Relative angles this close to a cone edge count as on it. */
const EDGE_SLACK = 1e-9;

/** Where a token looks, in world radians (`atan2` on the y-down map), and how wide it sees. */
export interface VisionCone {
  facing: number;
  /** Full width in radians, below a full turn. */
  angle: number;
}

/**
 * The cone of a token with `rotation` (degrees) seeing `angle` degrees wide, or none when it
 * sees all around. Rotation follows the token renderer (`SpriteFactory` sets the art sprite's
 * `rotation` to these degrees in radians): 0 faces the art's up, which is up on the map, and
 * positive turns clockwise on screen, so 90 faces right. On the y-down map that is the world
 * angle `rotation - 90°`.
 */
export function visionCone(rotation: number | undefined, angle: number | undefined): VisionCone | undefined {
  if (angle === undefined || !(angle > 0) || angle >= 360) return undefined;
  return { facing: ((rotation ?? 0) - 90) * DEGREE, angle: Math.max(1, angle) * DEGREE };
}

/**
 * The part of `polygon` (star-shaped around `origin`) inside the cone: its vertices within the
 * cone, closed through the origin by the cone's two edges. The edges end where they cross the
 * polygon's outline, so the result never reaches beyond it and stays star-shaped around the origin.
 */
export function clipToCone(origin: Point, polygon: Polygon, cone: VisionCone): Polygon {
  const start = cone.facing - cone.angle / 2;
  const inside = polygon
    .map((point) => ({ point, rel: relativeAngle(angleTo(origin, point) - start) }))
    .filter(({ rel }) => rel > EDGE_SLACK && rel < cone.angle - EDGE_SLACK)
    .sort((a, b) => a.rel - b.rel)
    .map(({ point }) => point);
  return [{ ...origin }, outlineAt(origin, polygon, start), ...inside, outlineAt(origin, polygon, start + cone.angle)];
}

/** `angle` in [0, 2π). */
function relativeAngle(angle: number): number {
  const rel = ((angle % TURN) + TURN) % TURN;
  return rel > TURN - EDGE_SLACK ? 0 : rel;
}

/** Where the ray from `origin` at `angle` leaves the polygon; the origin itself if it misses (never, for a star-shaped polygon). */
function outlineAt(origin: Point, polygon: Polygon, angle: number): Point {
  let reach = Infinity;
  for (let i = 0; i < polygon.length; i++) {
    reach = Math.min(reach, raySegmentIntersect(origin, angle, polygon[i]!, polygon[(i + 1) % polygon.length]!));
  }
  if (!Number.isFinite(reach)) return { ...origin };
  return { x: origin.x + Math.cos(angle) * reach, y: origin.y + Math.sin(angle) * reach };
}
