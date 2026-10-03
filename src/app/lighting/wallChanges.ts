import type { WallSegment } from '../types/wallTypes';
import type { Rect } from './segments';

function sameWall(a: WallSegment, b: WallSegment): boolean {
  return a.p1.x === b.p1.x && a.p1.y === b.p1.y && a.p2.x === b.p2.x && a.p2.y === b.p2.y
    && a.type === b.type && (a.closed ?? true) === (b.closed ?? true) && a.direction === b.direction && a.blocks === b.blocks && !!a.limited === !!b.limited;
}

function boxOf(wall: WallSegment, pad: number): Rect {
  const x = Math.min(wall.p1.x, wall.p2.x) - pad, y = Math.min(wall.p1.y, wall.p2.y) - pad;
  return [x, y, Math.abs(wall.p2.x - wall.p1.x) + 2 * pad, Math.abs(wall.p2.y - wall.p1.y) + 2 * pad];
}

/** World boxes of every wall added, removed or changed between two lists (old and new place). */
export function changedWallRects(prev: readonly WallSegment[], next: readonly WallSegment[], pad: number): Rect[] {
  const before = new Map(prev.map((wall) => [wall.id, wall]));
  const rects: Rect[] = [];
  for (const wall of next) {
    const old = before.get(wall.id);
    before.delete(wall.id);
    if (old && sameWall(old, wall)) continue;
    const box = boxOf(wall, pad);
    rects.push(box);
    if (!old) continue;
    const was = boxOf(old, pad);
    if (was.some((v, i) => v !== box[i])) rects.push(was);
  }
  for (const removed of before.values()) rects.push(boxOf(removed, pad));
  return rects;
}
