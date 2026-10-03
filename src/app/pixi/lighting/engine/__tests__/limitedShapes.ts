import type { WallSegment } from '../../../../types/wallTypes';
import type { P } from './fuzzRooms';

/** Walls around the middle of a 2048 px map, and where lights and tokens may stand. */
export interface Shape {
  walls: WallSegment[];
  /** Places for a light with a token: clear of every wall. */
  places: P[];
}

export const MIDDLE = 1024;
let id = 0;
const wall = (x1: number, y1: number, x2: number, y2: number, extra: Partial<WallSegment> = {}): WallSegment => ({ id: `s${id++}`, kind: 'wall', type: 'solid', p1: { x: x1, y: y1 }, p2: { x: x2, y: y2 }, ...extra });
const hedge = (x1: number, y1: number, x2: number, y2: number): WallSegment => wall(x1, y1, x2, y2, { limited: true });

function distance(p: P, w: WallSegment): number {
  const dx = w.p2.x - w.p1.x, dy = w.p2.y - w.p1.y;
  const t = Math.max(0, Math.min(1, ((p[0] - w.p1.x) * dx + (p[1] - w.p1.y) * dy) / (dx * dx + dy * dy || 1)));
  return Math.hypot(p[0] - w.p1.x - dx * t, p[1] - w.p1.y - dy * t);
}

/** Up to `count` places around the middle, at least 40 px from every wall. */
function placesAround(walls: readonly WallSegment[], rand: () => number, count: number, near = 200, far = 480): P[] {
  const places: P[] = [];
  for (let attempt = 0; attempt < 60 && places.length < count; attempt++) {
    const angle = rand() * Math.PI * 2, reach = near + rand() * (far - near);
    const p: P = [MIDDLE + Math.cos(angle) * reach, MIDDLE + Math.sin(angle) * reach];
    if (walls.every((w) => distance(p, w) > 40)) places.push(p);
  }
  return places;
}

/** A wall through a point near the middle, at any angle. */
function through(rand: () => number, limited: boolean): WallSegment {
  const x = MIDDLE + (rand() - 0.5) * 120, y = MIDDLE + (rand() - 0.5) * 120, angle = rand() * Math.PI, half = 150 + rand() * 200;
  return wall(x - Math.cos(angle) * half, y - Math.sin(angle) * half, x + Math.cos(angle) * half, y + Math.sin(angle) * half, limited ? { limited: true } : {});
}

/** Two to four hedges that cross each other between their ends, and now and then a solid wall across them. */
export function crossingHedges(rand: () => number): Shape {
  const walls = Array.from({ length: 2 + Math.floor(rand() * 3) }, () => through(rand, true));
  if (rand() < 0.3) walls.push(through(rand, false));
  return { walls, places: placesAround(walls, rand, 2) };
}

/**
 * A solid wall with a hedge that joins its end, straight on or at a bend, and a long second
 * hedge behind both. The light stands before the joint: the rays from the edge of its flame
 * pass the solid wall's end through the first hedge, where the ray from its middle is stopped.
 */
export function hedgeOnWall(rand: () => number): Shape {
  const jx = MIDDLE + (rand() - 0.5) * 80, jy = MIDDLE + (rand() - 0.5) * 80;
  const along = rand() * Math.PI * 2, bend = (rand() - 0.5) * 1.2;
  const reach = (angle: number, length: number): [number, number] => [jx + Math.cos(angle) * length, jy + Math.sin(angle) * length];
  const walls = [wall(jx, jy, ...reach(along, 250 + rand() * 200)), hedge(jx, jy, ...reach(along + Math.PI + bend, 250 + rand() * 200))];
  // Behind: to the left of the solid wall's direction.
  const back = along - Math.PI / 2, turn = (rand() - 0.5) * 0.3, off = 70 + rand() * 120;
  const [bx, by] = reach(back, off);
  walls.push(hedge(bx - Math.cos(along + turn) * 520, by - Math.sin(along + turn) * 520, bx + Math.cos(along + turn) * 520, by + Math.sin(along + turn) * 520));
  if (rand() < 0.4) walls.push(hedge(...reach(back, off + 60 + rand() * 80), ...reach(back + 0.8, off + 300)));
  const places: P[] = [];
  for (let attempt = 0; attempt < 30 && places.length < 2; attempt++) {
    const front = along + Math.PI / 2 + (rand() - 0.5) * 1.2;
    const p: P = [jx + Math.cos(front) * (70 + rand() * 220), jy + Math.sin(front) * (70 + rand() * 220)];
    if (walls.every((w) => distance(p, w) > 45)) places.push(p);
  }
  return { walls, places };
}

/**
 * Two or three rows of hedges, each drawn in strokes that start a little before or after the
 * last one ended and beside it (short of it, past it, over it), with a branch that ends at a
 * row. A row is one hedge, whatever its strokes do at their ends; the next row is the second.
 */
export function hedgeRows(rand: () => number): Shape {
  const walls: WallSegment[] = [];
  const rows = 2 + Math.floor(rand() * 2);
  for (let row = 0; row < rows; row++) {
    let x = MIDDLE - 520 + rand() * 60, y = MIDDLE - 260 + row * (150 + rand() * 60);
    const slope = (rand() - 0.5) * 0.3;
    while (x < MIDDLE + 480) {
      const length = 120 + rand() * 250;
      walls.push(hedge(x, y, x + length, y + slope * length + (rand() - 0.5) * 16));
      y += slope * length + (rand() - 0.5) * 8;
      x += length + (rand() - 0.5) * 60;
    }
  }
  const stem = walls[Math.floor(rand() * walls.length)]!;
  const at = { x: (stem.p1.x + stem.p2.x) / 2, y: (stem.p1.y + stem.p2.y) / 2 };
  walls.push(hedge(at.x + (rand() - 0.5) * 6, at.y + (rand() - 0.5) * 16, at.x + (rand() - 0.5) * 160, at.y + 80 + rand() * 60));
  return { walls, places: placesAround(walls, rand, 2, 60, 520) };
}

export const SHAPES = { crossingHedges, hedgeOnWall, hedgeRows } as const;
export type ShapeName = keyof typeof SHAPES;
export { hedge, wall, placesAround };
