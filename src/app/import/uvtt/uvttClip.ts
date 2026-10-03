import type { UvttPoint } from './uvttTypes';

/** A rectangle in cells, counted from the image's top-left corner. */
export interface CellRect {
  minX: number;
  minY: number;
  maxX: number;
  maxY: number;
}

/**
 * Where a file's walls, doors and lights may lie: on its image and up to one cell around it.
 * Whatever a file places farther out has nothing of the map to stand on, and a wall reaching
 * far beyond the map costs light and sight their time for nothing.
 */
export function placeableRect(size: UvttPoint): CellRect {
  return { minX: -1, minY: -1, maxX: size.x + 1, maxY: size.y + 1 };
}

export function isWithin(point: UvttPoint, rect: CellRect): boolean {
  return point.x >= rect.minX && point.x <= rect.maxX && point.y >= rect.minY && point.y <= rect.maxY;
}

/**
 * The part of the segment from `a` to `b` that lies within `rect`, or null when none of it does
 * (touching the rectangle in one point is none). An end inside the rectangle is returned as the
 * very object given, so ends that segments share stay shared.
 */
export function clipSegment(a: UvttPoint, b: UvttPoint, rect: CellRect): [UvttPoint, UvttPoint] | null {
  if (isWithin(a, rect) && isWithin(b, rect)) return [a, b];
  const dx = b.x - a.x, dy = b.y - a.y;
  let enter = 0, leave = 1;
  // Liang–Barsky: each edge of the rectangle narrows the part of the segment that is inside
  for (const [direction, room] of [[-dx, a.x - rect.minX], [dx, rect.maxX - a.x], [-dy, a.y - rect.minY], [dy, rect.maxY - a.y]] as const) {
    if (direction === 0) {
      if (room < 0) return null;
    } else if (direction < 0) {
      enter = Math.max(enter, room / direction);
    } else {
      leave = Math.min(leave, room / direction);
    }
  }
  if (enter >= leave) return null;
  // Kept inside by clamping: the cut lands on the edge only as exactly as the division allows
  const at = (t: number): UvttPoint => ({
    x: Math.min(rect.maxX, Math.max(rect.minX, a.x + dx * t)),
    y: Math.min(rect.maxY, Math.max(rect.minY, a.y + dy * t)),
  });
  return [enter > 0 ? at(enter) : a, leave < 1 ? at(leave) : b];
}
