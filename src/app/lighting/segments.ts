import type { WallSegment } from '../types/wallTypes';

/** A wall's centre line: x1, y1, x2, y2 in world pixels. */
export type Seg = readonly [number, number, number, number];

/** A world rectangle: x, y, width, height in world pixels. */
export type Rect = readonly [x: number, y: number, width: number, height: number];

export function segOf(wall: WallSegment): Seg {
  return [wall.p1.x, wall.p1.y, wall.p2.x, wall.p2.y];
}

export function distToSeg(x: number, y: number, [ax, ay, bx, by]: Seg): number {
  const dx = bx - ax, dy = by - ay;
  const t = Math.max(0, Math.min(1, ((x - ax) * dx + (y - ay) * dy) / Math.max(dx * dx + dy * dy, 1e-9)));
  return Math.hypot(x - ax - dx * t, y - ay - dy * t);
}

/** Whether moving from p to q crosses segment s; leaving a segment one stands on does not count. */
export function crosses(px: number, py: number, qx: number, qy: number, [ax, ay, bx, by]: Seg): boolean {
  const rx = qx - px, ry = qy - py, sx = bx - ax, sy = by - ay;
  const den = rx * sy - ry * sx;
  if (Math.abs(den) < 1e-12) return false;
  const t = ((ax - px) * sy - (ay - py) * sx) / den;
  const u = ((ax - px) * ry - (ay - py) * rx) / den;
  return t > 1e-6 && t <= 1 && u >= 0 && u <= 1;
}

function isOpenDoor(wall: WallSegment): boolean {
  return (wall.type === 'door' || wall.type === 'secret-door') && !(wall.closed ?? true);
}

/**
 * Walls that block light: two-way ones as segments for the shared field, one-way ones kept
 * whole because whether they block depends on where the light is. Open doors and walls
 * shrunk to a point block nothing.
 */
export function splitBlocking(walls: readonly WallSegment[]): { twoWay: Seg[]; oneWay: WallSegment[] } {
  const twoWay: Seg[] = [];
  const oneWay: WallSegment[] = [];
  for (const wall of walls) {
    if (isOpenDoor(wall) || (wall.p1.x === wall.p2.x && wall.p1.y === wall.p2.y)) continue;
    if (wall.direction) oneWay.push(wall);
    else twoWay.push(segOf(wall));
  }
  return { twoWay, oneWay };
}
