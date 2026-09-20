export interface Point {
  x: number;
  y: number;
}

/**
 * Erase the part of a stroke that falls inside a circular brush.
 *
 * Returns the surviving fragments, or `null` when the brush missed the stroke
 * entirely — callers use `null` to skip a pointless store write. An empty array
 * means the whole stroke was erased.
 *
 * ponytail: filters at point granularity rather than clipping each segment
 * against the circle. Strokes are recorded with ~2px world-space spacing, so
 * the edge lands within a couple of pixels of the brush — invisible in practice.
 */
export function splitStrokeByBrush(
  points: Point[],
  center: Point,
  radius: number
): Point[][] | null {
  const radiusSq = radius * radius;
  const isInside = (p: Point): boolean =>
    (p.x - center.x) ** 2 + (p.y - center.y) ** 2 <= radiusSq;

  let erasedAny = false;
  const fragments: Point[][] = [];
  let current: Point[] = [];

  for (const point of points) {
    if (isInside(point)) {
      erasedAny = true;
      if (current.length > 1) fragments.push(current);
      current = [];
    } else {
      current.push(point);
    }
  }
  if (current.length > 1) fragments.push(current);

  if (!erasedAny) return null;
  return fragments;
}
