import { fieldMargin, wallRadius } from './lightingConstants';
import { crosses, distToSeg, type Seg } from './segments';

/** Where a light shines from, and the radius its flame may have there, in world pixels. */
export interface Placement {
  x: number;
  y: number;
  flame: number;
}

/** Farthest a light standing in a wall is moved to find free space. */
const SEARCH = 64;

/**
 * A light standing in a wall moves to the nearest spot with room for it that a straight
 * path reaches without crossing any wall's centre line, so it always stays on its own side;
 * none within `SEARCH` px means no light. Its flame shrinks until it fits the free space.
 */
export function placeLight(x: number, y: number, flame: number, walls: readonly Seg[], texel: number): Placement | null {
  const blocked = wallRadius(texel) + fieldMargin(texel);
  const need = blocked + 1.5;
  const spot = nearestFreeSpot(x, y, walls, need);
  if (!spot) return null;
  const free = nearest(spot[0], spot[1], walls) - blocked - 1;
  return { x: spot[0], y: spot[1], flame: Math.max(0.5, Math.min(flame, free)) };
}

function nearestFreeSpot(x: number, y: number, walls: readonly Seg[], need: number): [number, number] | null {
  if (nearest(x, y, walls) >= need) return [x, y];
  for (let r = 1; r <= SEARCH; r++) {
    for (let k = 0; k < 48; k++) {
      const a = (k / 48) * Math.PI * 2;
      const cx = x + Math.cos(a) * r, cy = y + Math.sin(a) * r;
      if (nearest(cx, cy, walls) >= need && !walls.some((w) => crosses(x, y, cx, cy, w))) return [cx, cy];
    }
  }
  return null;
}

function nearest(x: number, y: number, walls: readonly Seg[]): number {
  let best = Infinity;
  for (const w of walls) best = Math.min(best, distToSeg(x, y, w));
  return best;
}
