import { sealTolerance, worldTexel } from '../../lighting/lightingConstants';
import type { WallSegment } from '../../types/wallTypes';

/**
 * How much joining a scene's walls may cost. Light and sight close every gap between two wall
 * ends narrower than `sealTolerance` with a bridge (`sealWalls`): one bridge per pair of ends,
 * found by comparing each end with the ends around it. Where ends crowd by the thousand, the
 * pairs go into the millions and opening the scene stalls. A map as a map maker draws it stays
 * far below both numbers; at them, joining takes about a fifth of a second.
 */
const MAX_COMPARISONS = 5_000_000;
const MAX_JOINTS = 100_000;

interface End {
  wall: number;
  x: number;
  y: number;
}

/**
 * Whether the walls of a scene on an image of `image` pixels end too close together in too many
 * places to be joined in good time. Counts what `sealWalls` would compare and bridge, on the
 * same grid, and stops as soon as either count is over.
 */
export function wallsCrowd(walls: readonly WallSegment[], image: { width: number; height: number }): boolean {
  const tolerance = sealTolerance(worldTexel(image));
  const size = Math.max(tolerance, 1) * 4;
  const cells = new Map<string, End[]>();
  const ends: End[] = [];
  walls.forEach((wall, index) => {
    for (const { x, y } of [wall.p1, wall.p2]) {
      const end = { wall: index, x, y };
      ends.push(end);
      const key = `${Math.floor(x / size)}:${Math.floor(y / size)}`;
      const cell = cells.get(key);
      if (cell) cell.push(end);
      else cells.set(key, [end]);
    }
  });

  const around = (end: End): End[][] => {
    const cx = Math.floor(end.x / size), cy = Math.floor(end.y / size);
    const out: End[][] = [];
    for (let dx = -1; dx <= 1; dx++) {
      for (let dy = -1; dy <= 1; dy++) {
        const cell = cells.get(`${cx + dx}:${cy + dy}`);
        if (cell) out.push(cell);
      }
    }
    return out;
  };

  let comparisons = 0;
  for (const end of ends) {
    for (const cell of around(end)) comparisons += cell.length;
    if (comparisons > MAX_COMPARISONS) return true;
  }
  let joints = 0;
  for (const end of ends) {
    for (const cell of around(end)) {
      for (const other of cell) {
        if (other.wall <= end.wall) continue;
        const distance = Math.hypot(end.x - other.x, end.y - other.y);
        if (distance > 0 && distance <= tolerance && ++joints > MAX_JOINTS) return true;
      }
    }
  }
  return false;
}
