import type { WallSegment } from '../types/wallTypes';
import { BASE_TEXEL, weldTolerance } from './lightingConstants';

/** A hair past the wall a T-junction lands on, so the two cross instead of merely touching. */
const OVERSHOOT = 0.01;

type Point = { x: number; y: number };

/**
 * Closes the gaps of hand-drawn joints before walls reach light or sight: wall ends within
 * `tolerance` of each other become one shared vertex (their average), and a wall end within
 * `tolerance` of another wall's middle lands just across it. Wider gaps stay open for both.
 */
export function weldWalls(walls: readonly WallSegment[], tolerance: number): WallSegment[] {
  const ends: Point[] = walls.flatMap((wall) => [wall.p1, wall.p2]);
  const root = joinNearbyEnds(ends, tolerance);
  const centres = averageByRoot(ends, root);
  const members = new Map<number, number>();
  for (const r of root) members.set(r, (members.get(r) ?? 0) + 1);
  const out = walls.map((wall, i) => ({ ...wall, p1: centres.get(root[2 * i]!)!, p2: centres.get(root[2 * i + 1]!)! }));
  for (let i = 0; i < out.length; i++) {
    for (const end of ['p1', 'p2'] as const) {
      const index = 2 * i + (end === 'p1' ? 0 : 1);
      if (members.get(root[index]!)! > 1) continue;
      const landed = landOnNearbyWall(out, i, end, tolerance);
      if (landed) out[i] = { ...out[i]!, [end]: landed };
    }
  }
  return out;
}

const welded = new WeakMap<readonly WallSegment[], readonly WallSegment[]>();

/** `weldWalls` at the engine's tolerance, the same array for as long as the input is unchanged. */
export function weldedWalls(walls: readonly WallSegment[]): readonly WallSegment[] {
  let result = welded.get(walls);
  if (!result) {
    result = weldWalls(walls, weldTolerance(BASE_TEXEL));
    welded.set(walls, result);
  }
  return result;
}

function joinNearbyEnds(ends: readonly Point[], tolerance: number): number[] {
  const parent = ends.map((_, i) => i);
  const find = (i: number): number => {
    while (parent[i] !== i) {
      parent[i] = parent[parent[i]!]!;
      i = parent[i]!;
    }
    return i;
  };
  const grid = new Map<string, number[]>();
  ends.forEach((p, i) => {
    const cx = Math.floor(p.x / tolerance), cy = Math.floor(p.y / tolerance);
    for (let dx = -1; dx <= 1; dx++) {
      for (let dy = -1; dy <= 1; dy++) {
        for (const j of grid.get(`${cx + dx},${cy + dy}`) ?? []) {
          if (Math.hypot(p.x - ends[j]!.x, p.y - ends[j]!.y) <= tolerance) parent[find(i)] = find(j);
        }
      }
    }
    const key = `${cx},${cy}`;
    grid.set(key, [...(grid.get(key) ?? []), i]);
  });
  return ends.map((_, i) => find(i));
}

function averageByRoot(ends: readonly Point[], root: readonly number[]): Map<number, Point> {
  const sums = new Map<number, [number, number, number]>();
  ends.forEach((p, i) => {
    const s = sums.get(root[i]!) ?? [0, 0, 0];
    sums.set(root[i]!, [s[0] + p.x, s[1] + p.y, s[2] + 1]);
  });
  const centres = new Map<number, Point>();
  for (const [r, [x, y, n]] of sums) centres.set(r, n === 1 ? ends.find((_, i) => root[i] === r)! : { x: x / n, y: y / n });
  return centres;
}

/** Where wall `i`'s free end lands on the nearest other wall's middle within tolerance, if any. */
// ponytail: scans every wall per free end; bin walls in a grid if maps reach thousands of free ends.
function landOnNearbyWall(walls: readonly WallSegment[], i: number, end: 'p1' | 'p2', tolerance: number): Point | null {
  const p = walls[i]![end];
  const other = walls[i]![end === 'p1' ? 'p2' : 'p1'];
  let best: { point: Point; distance: number } | null = null;
  walls.forEach((wall, j) => {
    if (j === i) return;
    const dx = wall.p2.x - wall.p1.x, dy = wall.p2.y - wall.p1.y;
    const len2 = dx * dx + dy * dy;
    if (len2 < 1e-9) return;
    const u = ((p.x - wall.p1.x) * dx + (p.y - wall.p1.y) * dy) / len2;
    if (u <= 0 || u >= 1) return;
    const cx = wall.p1.x + dx * u, cy = wall.p1.y + dy * u;
    const distance = Math.hypot(p.x - cx, p.y - cy);
    if (distance <= tolerance && (!best || distance < best.distance)) best = { point: { x: cx, y: cy }, distance };
  });
  if (!best) return null;
  const { point } = best as { point: Point };
  const wx = point.x - other.x, wy = point.y - other.y;
  const length = Math.hypot(wx, wy) || 1;
  return { x: point.x + (wx / length) * OVERSHOOT, y: point.y + (wy / length) * OVERSHOOT };
}
