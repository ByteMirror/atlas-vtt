import type { WallSegment } from '../../../../types/wallTypes';

export type P = [number, number];

export function rng(seed: number): () => number {
  return () => {
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function insidePolygon(p: P, polygon: readonly P[]): boolean {
  let c = false;
  for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i++) {
    const [xi, yi] = polygon[i]!, [xj, yj] = polygon[j]!;
    if ((yi > p[1]) !== (yj > p[1]) && p[0] < ((xj - xi) * (p[1] - yi)) / (yj - yi) + xi) c = !c;
  }
  return c;
}

export interface FuzzRoom {
  /** The room's outline first (`roomWallCount` walls), then T-junction chains crossing it. */
  walls: WallSegment[];
  roomWallCount: number;
  outline: P[];
  light: P;
  handDrawn: boolean;
}

/**
 * Closed star-shaped rooms on a 2048 px map with zig-zag outlines; every third room has
 * hand-drawn joints (ends jittered ±1.4 px, not shared); four chains of three walls start on
 * the outline (T-junctions) and wander in or out. The light is inside: anywhere (50%),
 * 0–2 px from a wall (35%) or 0.5 px from a corner (15%). `gap` opens one wall: `true` the far half, a number that share (0–1) of it.
 */
export function fuzzRooms(seed: number, count: number, gap: boolean | number = false): FuzzRoom[] {
  const rand = rng(seed);
  const rooms: FuzzRoom[] = [];
  let id = 0;
  const wall = (a: P, b: P): WallSegment => ({ id: `w${id++}`, kind: 'wall', type: 'solid', p1: { x: a[0], y: a[1] }, p2: { x: b[0], y: b[1] } });
  for (let n = 0; n < count; n++) {
    const c: P = [600 + rand() * 848, 600 + rand() * 848];
    const k = 3 + Math.floor(rand() * 12);
    const angles = Array.from({ length: k }, () => rand() * Math.PI * 2).sort((x, y) => x - y);
    const outline: P[] = angles.map((a, i) => {
      const r = (i % 2 ? 60 : 200) + rand() * 300;
      return [c[0] + Math.cos(a) * r, c[1] + Math.sin(a) * r];
    });
    const handDrawn = n % 3 === 2;
    const jitter = (p: P): P => (handDrawn ? [p[0] + (rand() - 0.5) * 2.8, p[1] + (rand() - 0.5) * 2.8] : p);
    const walls = outline.map((p, i) => wall(jitter(p), jitter(outline[(i + 1) % k]!)));
    if (gap) {
      const g = walls[0]!;
      const kept = 1 - (gap === true ? 0.5 : gap);
      walls[0] = { ...g, p2: { x: g.p1.x + (g.p2.x - g.p1.x) * kept, y: g.p1.y + (g.p2.y - g.p1.y) * kept } };
    }
    for (let t = 0; t < 4; t++) {
      const i = Math.floor(rand() * k), f = rand();
      const a = outline[i]!, b = outline[(i + 1) % k]!;
      let p: P = [a[0] + (b[0] - a[0]) * f, a[1] + (b[1] - a[1]) * f];
      for (let z = 0; z < 3; z++) {
        const ang = rand() * Math.PI * 2, len = 20 + rand() * 120;
        const q: P = [p[0] + Math.cos(ang) * len, p[1] + Math.sin(ang) * len];
        walls.push(wall(p, q));
        p = q;
      }
    }
    const mode = rand();
    let light: P;
    if (mode < 0.35) {
      const i = Math.floor(rand() * k), f = rand(), a = outline[i]!, b = outline[(i + 1) % k]!;
      const p: P = [a[0] + (b[0] - a[0]) * f, a[1] + (b[1] - a[1]) * f];
      const d = Math.hypot(c[0] - p[0], c[1] - p[1]), off = rand() * 2;
      light = [p[0] + ((c[0] - p[0]) / d) * off, p[1] + ((c[1] - p[1]) / d) * off];
    } else if (mode < 0.5) {
      const p = outline[Math.floor(rand() * k)]!;
      const d = Math.hypot(c[0] - p[0], c[1] - p[1]);
      light = [p[0] + ((c[0] - p[0]) / d) * 0.5, p[1] + ((c[1] - p[1]) / d) * 0.5];
    } else {
      do light = [c[0] + (rand() - 0.5) * 800, c[1] + (rand() - 0.5) * 800];
      while (!insidePolygon(light, outline));
    }
    rooms.push({ walls, roomWallCount: k, outline, light, handDrawn });
  }
  return rooms;
}
