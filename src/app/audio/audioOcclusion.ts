import type { Point } from '../types/visionTypes';
import type { WallSegment } from '../types/wallTypes';
import { segmentIntersection, isOnBlockingSide } from '../vision/visionGeometry';

/**
 * Count the number of walls between two points, respecting door state
 * and one-way wall direction. Used for audio occlusion dampening.
 */
export function countWallsBetween(
  from: Point,
  to: Point,
  walls: Record<string, WallSegment>,
): number {
  let count = 0;

  for (const wall of Object.values(walls)) {
    // Open doors don't block sound
    if ((wall.type === 'door' || wall.type === 'secret-door') && wall.closed === false) {
      continue;
    }

    // One-way walls: only block from the blocking side
    if (wall.direction) {
      if (!isOnBlockingSide(from, wall.p1, wall.p2, wall.direction)) {
        continue;
      }
    }

    const hit = segmentIntersection(from, to, wall.p1, wall.p2);
    if (hit) {
      count++;
    }
  }

  return count;
}

/**
 * Compute the audio gain after wall occlusion dampening.
 * Each wall reduces volume by the dampen factor (multiplicative).
 */
export function computeWallDampening(wallCount: number, dampenFactor: number): number {
  if (wallCount <= 0) return 1.0;
  return Math.pow(dampenFactor, wallCount);
}

/**
 * Compute distance-based attenuation.
 * Full volume inside innerRadius, linear falloff to zero at outerRadius.
 */
export function computeDistanceGain(
  distance: number,
  innerRadius: number,
  outerRadius: number,
): number {
  if (distance <= innerRadius) return 1.0;
  if (distance >= outerRadius) return 0.0;
  return 1.0 - (distance - innerRadius) / (outerRadius - innerRadius);
}
