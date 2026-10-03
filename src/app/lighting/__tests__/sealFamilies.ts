import type { WallSegment } from '../../types/wallTypes';
import { random, wall, type XY } from './sealFixtures';

/** Junctions the sealing tests crowd with walls. */

export const C = { x: 500, y: 500 };
export const at = (angle: number, radius: number, from: XY = C): XY => ({ x: from.x + Math.cos(angle) * radius, y: from.y + Math.sin(angle) * radius });
export const turn = (rand: () => number): number => rand() * Math.PI * 2;
export type Family = (rand: () => number) => WallSegment[];

/** A wall from `p` running `length` away from the junction, or in a direction of its own. */
function from(id: string, p: XY, rand: () => number, length = 60 + rand() * 140, angle = Math.atan2(p.y - C.y, p.x - C.x) + (rand() - 0.5)): WallSegment {
  const q = at(angle, length, p);
  return wall(id, p.x, p.y, q.x, q.y);
}

/** Junctions of many walls, each kind crowded in its own way; every family has more ends or walls in one place than an end is bridged to. */
export const FAMILIES: Record<string, Family> = {
  // Ends on a small circle, their walls running outward.
  ring: (rand) => {
    const n = 9 + Math.floor(rand() * 40), radius = 2 + rand() * 9;
    return Array.from({ length: n }, (_, i) => from(`r${i}`, at((i / n) * Math.PI * 2 + rand() * 0.1, radius), rand));
  },
  // Two crowds of ends, 8 to 22 px apart.
  twoClusters: (rand) => {
    const other = at(turn(rand), 8 + rand() * 14);
    return Array.from({ length: 12 + Math.floor(rand() * 40) }, (_, i) => from(`c${i}`, at(turn(rand), rand() * 5, i % 2 ? other : C), rand, undefined, turn(rand)));
  },
  // Ends in a row, one to three pixels apart.
  line: (rand) => {
    const along = turn(rand);
    return Array.from({ length: 10 + Math.floor(rand() * 40) }, (_, i) => from(`l${i}`, at(along, i * (1 + rand() * 2) - 20), rand, undefined, along + Math.PI / 2 + (rand() - 0.5) * 0.6 + (i % 2 ? Math.PI : 0)));
  },
  // One end, and every other end in one eighth of the directions around it.
  octant: (rand) => {
    const towards = turn(rand);
    return [from('o', C, rand, undefined, towards + Math.PI), ...Array.from({ length: 9 + Math.floor(rand() * 40) }, (_, i) => from(`o${i}`, at(towards + (rand() - 0.5) * 0.7, 1 + rand() * 12), rand, undefined, towards + (rand() - 0.5) * 2))];
  },
  // Ends anywhere in a disc of the tolerance, walls running any way.
  blob: (rand) => Array.from({ length: 9 + Math.floor(rand() * 52) }, (_, i) => from(`b${i}`, at(turn(rand), Math.sqrt(rand()) * 12), rand, undefined, turn(rand))),
  // A blob with a long wall through it.
  through: (rand) => {
    const along = turn(rand), off = at(along + Math.PI / 2, (rand() - 0.5) * 10);
    const a = at(along, 300, off), b = at(along + Math.PI, 300, off);
    return [wall('long', a.x, a.y, b.x, b.y), ...Array.from({ length: 9 + Math.floor(rand() * 40) }, (_, i) => from(`t${i}`, at(turn(rand), Math.sqrt(rand()) * 12), rand, undefined, turn(rand)))];
  },
  // Walls of 3 to 25 px with both ends in the crowd.
  shortWalls: (rand) => Array.from({ length: 9 + Math.floor(rand() * 40) }, (_, i) => from(`s${i}`, at(turn(rand), Math.sqrt(rand()) * 14), rand, 3 + rand() * 22, turn(rand))),
  // Freehand strokes: chains of short segments that share their corners, crossing near each other.
  stroke: (rand) => Array.from({ length: 3 }, (_, s) => {
    let p = at(turn(rand), 30 + rand() * 20);
    let heading = Math.atan2(C.y - p.y, C.x - p.x) + (rand() - 0.5) * 0.5;
    return Array.from({ length: 20 + Math.floor(rand() * 20) }, (_, i) => {
      heading += (rand() - 0.5) * 0.8;
      const q = at(heading, 2 + rand() * 5, p);
      const segment = wall(`k${s}-${i}`, p.x, p.y, q.x, q.y);
      p = q;
      return segment;
    });
  }).flat(),
  // One wall's end with many long walls passing it within the tolerance, and a few more ends beside it.
  passing: (rand) => {
    const stem = from('stem', C, rand, 150, turn(rand));
    const passing = Array.from({ length: 9 + Math.floor(rand() * 52) }, (_, i) => {
      const towards = turn(rand), foot = at(towards, 0.5 + rand() * 12.4);
      const a = at(towards + Math.PI / 2, 40 + rand() * 200, foot), b = at(towards - Math.PI / 2, 40 + rand() * 200, foot);
      return wall(`m${i}`, a.x, a.y, b.x, b.y);
    });
    return [stem, ...passing, ...Array.from({ length: Math.floor(rand() * 4) }, (_, i) => from(`e${i}`, at(turn(rand), rand() * 12), rand, undefined, turn(rand)))];
  },
  // A wall that ends short of another, with many short walls crossing it nearer to its end than that one is.
  ladder: (rand) => {
    const along = turn(rand), gap = 4 + rand() * 8.9;
    const far = at(along, gap), a = at(along + Math.PI / 2, 250, far), b = at(along - Math.PI / 2, 250, far);
    const back = at(along + Math.PI, 180);
    return [wall('stem', back.x, back.y, C.x, C.y), wall('far', a.x, a.y, b.x, b.y), ...Array.from({ length: 8 + Math.floor(rand() * 40) }, (_, i) => {
      const foot = at(along + Math.PI, 0.5 + rand() * (gap - 1));
      const c = at(along + Math.PI / 2, 15 + rand() * 40, foot), d = at(along - Math.PI / 2, 15 + rand() * 40, foot);
      return wall(`d${i}`, c.x, c.y, d.x, d.y);
    })];
  },
  // The same with the nearer walls at any angle on one side of the end, and the far one on the other.
  oneSide: (rand) => {
    const along = turn(rand), gap = 6 + rand() * 6.9;
    const far = at(along, gap), a = at(along + Math.PI / 2, 250, far), b = at(along - Math.PI / 2, 250, far);
    const back = at(along + Math.PI, 180);
    return [wall('stem', back.x, back.y, C.x, C.y), wall('far', a.x, a.y, b.x, b.y), ...Array.from({ length: 8 + Math.floor(rand() * 40) }, (_, i) => {
      const towards = along + Math.PI + (rand() - 0.5) * 2.2, foot = at(towards, 0.5 + rand() * (gap - 1));
      const c = at(towards + Math.PI / 2, 14 + rand() * 30, foot), d = at(towards - Math.PI / 2, 14 + rand() * 30, foot);
      return wall(`n${i}`, c.x, c.y, d.x, d.y);
    })];
  },
  // Two crowds of ends, and between them two short walls on their own that stop nothing or stop one way only, each
  // nearer to the other's far end than to its own crowd: the nearest end in a direction is then the mate of the end wanted.
  airlock: (rand) => {
    const spin = turn(rand);
    const place = (x: number, y: number): XY => {
      const [dx, dy] = [x - 504 + (rand() - 0.5) * 0.4, y - 504 + (rand() - 0.5) * 0.4];
      return { x: C.x + dx * Math.cos(spin) - dy * Math.sin(spin), y: C.y + dx * Math.sin(spin) + dy * Math.cos(spin) };
    };
    const lone = (id: string, a: XY, b: XY): WallSegment => {
      const open = rand() < 0.5;
      return wall(id, a.x, a.y, b.x, b.y, open ? { type: 'door', closed: false } : { direction: rand() < 0.5 ? 'left' : 'right' });
    };
    const crowd = (name: string, x: number, y: number, away: number): WallSegment[] => Array.from({ length: 6 + Math.floor(rand() * 3) }, (_, i) => {
      const p = place(x + (i % 3), y + Math.floor(i / 3)), q = place(x - 70 + i * 30, y + away * 145);
      return wall(`${name}${i}`, p.x, p.y, q.x, q.y);
    });
    return [lone('lone1', place(500, 500), place(498.5, 503.5)), lone('lone2', place(510, 504), place(508.5, 507.5)), ...crowd('n', 508, 492, -1), ...crowd('s', 498.5, 514.5, 1)];
  },
};

/**
 * Nine walls end in a row above (500, 496) and nine in a row below (500, 504), about a pixel
 * apart; between the rows, on their line, stands a wall of 5 px on its own. Every end's nearest
 * neighbour towards the other row is the next in its own, and then that wall's end.
 */
export function crowds(between: Partial<WallSegment>, seed: number): WallSegment[] {
  const rand = random(seed);
  const row = (name: string, y: number, away: number): WallSegment[] => Array.from({ length: 9 }, (_, i) => {
    const p = { x: 500, y: y + away * (i + (i ? rand() * 0.3 : 0)) };
    return wall(`${name}${i}`, p.x, p.y, p.x + (i % 2 ? 150 : -150), p.y + away * (20 + i * 15));
  });
  return [...row('n', 496, -1), ...row('s', 504, 1), wall('between', 500, 497.5, 500, 502.5, between)];
}
