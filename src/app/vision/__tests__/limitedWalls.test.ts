import { describe, expect, it, vi } from 'vitest';
import { readWall } from '../../lighting/lightingObjects';
import type { Point } from '../../types/visionTypes';
import type { WallChannel, WallSegment } from '../../types/wallTypes';
import { lightLevelAt } from '../lightLevels';
import { computeSight, lightReach } from '../sight';
import { blocksFrom, computeVisibility, pointInPolygon } from '../visibility';
import { crossedByHand, distanceToSegment as distance } from './byHand';

// Limited walls are switched off in the release (`LIMITED_WALLS`); their tests run with them on, so the parked code does not rot.
vi.mock('../../featureFlags', async (original) => ({ ...(await original<typeof import('../../featureFlags')>()), LIMITED_WALLS: true }));

let id = 0;
function wall(x1: number, y1: number, x2: number, y2: number, overrides: Partial<WallSegment> = {}): WallSegment {
  return { id: `w${id++}`, kind: 'wall', type: 'solid', p1: { x: x1, y: y1 }, p2: { x: x2, y: y2 }, ...overrides };
}
const hedge = (x1: number, y1: number, x2: number, y2: number, overrides: Partial<WallSegment> = {}): WallSegment => wall(x1, y1, x2, y2, { limited: true, ...overrides });

const origin = { x: 0, y: 0 };
const sees = (walls: WallSegment[], point: Point, from: Point = origin, channel?: WallChannel): boolean => pointInPolygon(point, computeVisibility(from, 1000, walls, undefined, channel));
/** Long lines across the viewer's way south, at y = 100, 200 and 300. */
const row = (y: number, overrides: Partial<WallSegment> = {}): WallSegment => hedge(-400, y, 400, y, overrides);

describe('limited walls', () => {
  it('lets sight past the first and stops it at the second', () => {
    expect(sees([row(100)], { x: 0, y: 150 })).toBe(true);
    expect(sees([row(100)], { x: 0, y: 900 })).toBe(true);
    const two = [row(100), row(200)];
    expect(sees(two, { x: 0, y: 50 })).toBe(true);
    expect(sees(two, { x: 0, y: 150 })).toBe(true);
    expect(sees(two, { x: 0, y: 199 })).toBe(true);
    expect(sees(two, { x: 0, y: 201 })).toBe(false);
    expect(sees(two, { x: 150, y: 260 })).toBe(false);
    // A third changes nothing: sight ends at the second.
    expect(sees([...two, row(300)], { x: 0, y: 250 })).toBe(false);
  });

  it('counts the walls in the order the ray meets them, not the order they were drawn in', () => {
    expect(sees([row(200), row(100)], { x: 0, y: 150 })).toBe(true);
    expect(sees([row(200), row(100)], { x: 0, y: 250 })).toBe(false);
    expect(sees([row(300), row(100), row(200)], { x: 0, y: 250 })).toBe(false);
  });

  it('stops at a solid wall as ever, before a limited wall or behind one', () => {
    const behind = [row(100), wall(-400, 200, 400, 200)];
    expect(sees(behind, { x: 0, y: 150 })).toBe(true);
    expect(sees(behind, { x: 0, y: 250 })).toBe(false);
    const before = [wall(-400, 100, 400, 100), row(200)];
    expect(sees(before, { x: 0, y: 150 })).toBe(false);
    // Past one limited wall a solid one still stops, and past the solid wall's end the second limited one does.
    const mixed = [row(100), wall(-400, 200, 0, 200), row(300)];
    expect(sees(mixed, { x: -100, y: 250 })).toBe(false);
    expect(sees(mixed, { x: 100, y: 250 })).toBe(true);
    expect(sees(mixed, { x: 150, y: 350 })).toBe(false);
  });

  it('counts each ray by itself: beside the first wall the second is the first', () => {
    // A short hedge in front, a long one behind, a wall far behind.
    const walls = [hedge(-50, 100, 50, 100), row(200), wall(-900, 400, 900, 400)];
    expect(sees(walls, { x: 0, y: 250 })).toBe(false);
    expect(sees(walls, { x: 300, y: 250 })).toBe(true);
    expect(sees(walls, { x: 300, y: 390 })).toBe(true);
    expect(sees(walls, { x: 300, y: 410 })).toBe(false);
  });

  it('sees into a ring of limited walls from outside, and not out of its far side', () => {
    // A square hedge from (100, 100) to (300, 300), its walls sharing their corners.
    const ring = [hedge(100, 100, 300, 100), hedge(300, 100, 300, 300), hedge(300, 300, 100, 300), hedge(100, 300, 100, 100)];
    const from = { x: 200, y: 0 };
    expect(sees(ring, { x: 200, y: 200 }, from)).toBe(true);
    expect(sees(ring, { x: 200, y: 290 }, from)).toBe(true);
    expect(sees(ring, { x: 200, y: 310 }, from)).toBe(false);
    expect(sees(ring, { x: 110, y: 290 }, from)).toBe(true);
    // From inside, the ring is the first wall every way: all of the outside is seen.
    expect(sees(ring, { x: 200, y: 800 }, { x: 200, y: 200 })).toBe(true);
    expect(sees(ring, { x: 800, y: 200 }, { x: 200, y: 200 })).toBe(true);
  });

  it('makes no hole of a corner of two limited walls: a ray through the corner point is stopped where its neighbours are', () => {
    const ring = [hedge(100, 100, 300, 100), hedge(300, 100, 300, 300), hedge(300, 300, 100, 300), hedge(100, 300, 100, 100)];
    // From the diagonal, the ray through the near corner (100, 100) leaves through the far corner (300, 300): two walls each time, at one point.
    const from = { x: 0, y: 0 };
    const seen = computeVisibility(from, 2000, ring);
    for (let d = 310; d < 1200; d += 37) {
      for (const off of [-3, -1, 0, 1, 3]) expect([d, off, pointInPolygon({ x: d + off, y: d - off }, seen)]).toEqual([d, off, false]);
    }
    expect(pointInPolygon({ x: 200, y: 200 }, seen)).toBe(true);
    expect(pointInPolygon({ x: 290, y: 290 }, seen)).toBe(true);
    // No vertex of the polygon lies beyond the ring on that diagonal: the corner ray did not pass.
    expect(seen.filter((p) => Math.abs(p.x - p.y) < 1e-6 && p.x > 301)).toEqual([]);
  });

  it('counts a corner once where the ray passes between its walls, so the next limited wall still stops it', () => {
    // A corner pointing at the viewer, both walls leading away on either side: one crossing whichever way the ray passes.
    const corner = [hedge(0, 100, 200, 300), hedge(0, 100, -200, 300)];
    const far = hedge(-600, 500, 600, 500);
    const seen = computeVisibility(origin, 2000, [...corner, far]);
    for (const x of [-40, -1, 0, 1, 40]) {
      expect([x, pointInPolygon({ x: x * 4, y: 400 }, seen)]).toEqual([x, true]);
      expect([x, pointInPolygon({ x: x * 5.2, y: 520 }, seen)]).toEqual([x, false]);
    }
    // The ray through the corner point reaches the far wall as its neighbours do, and stops there.
    const straight = seen.filter((p) => Math.abs(p.x) < 1e-6 && p.y > 0);
    expect(straight.length).toBeGreaterThan(0);
    expect([...new Set(straight.map((p) => Math.round(p.y)))]).toEqual([500]);
  });

  it('does not count a wall twice for a ray along it', () => {
    // The viewer stands on the line of a hedge that ends in a corner with another; beyond the corner is open ground.
    const walls = [hedge(100, 0, 300, 0), hedge(300, 0, 300, 200)];
    const seen = computeVisibility(origin, 2000, walls);
    // Along the hedge and past the corner: one wall (the other one) at most was crossed.
    expect(pointInPolygon({ x: 600, y: 1 }, seen)).toBe(true);
    expect(pointInPolygon({ x: 600, y: -1 }, seen)).toBe(true);
    expect(pointInPolygon({ x: 600, y: 60 }, seen)).toBe(true);
  });

  it('is limited while a door is closed, and nothing once it is open', () => {
    const closed = [row(100, { type: 'door', closed: true }), row(200)];
    expect(sees(closed, { x: 0, y: 150 })).toBe(true);
    expect(sees(closed, { x: 0, y: 250 })).toBe(false);
    const open = [row(100, { type: 'door', closed: false }), row(200)];
    expect(sees(open, { x: 0, y: 250 })).toBe(true);
    expect(sees([...open, row(300)], { x: 0, y: 350 })).toBe(false);
  });

  it('counts for the thing it blocks only: a limited wall for sight is no wall for light', () => {
    const walls = [row(100, { blocks: 'sight' }), row(200)];
    expect(sees(walls, { x: 0, y: 250 }, origin, 'sight')).toBe(false);
    expect(sees(walls, { x: 0, y: 250 }, origin, 'light')).toBe(true);
    expect(sees([...walls, row(300)], { x: 0, y: 350 }, origin, 'light')).toBe(false);
  });

  it('counts a one-way limited wall only from its blocking side', () => {
    // The first hedge lets pass from the north: seen from there it is no wall, and the next two are the first and second.
    const walls = [row(100, { direction: 'right' }), row(200), row(300)];
    const north = sees(walls, { x: 0, y: 250 }, origin);
    const south = sees(walls, { x: 0, y: -50 }, { x: 0, y: 250 });
    expect([north, south].sort()).toEqual([false, true]);
  });

  it('gives a token\'s sight and a light\'s reach the same count, and the light level with it', () => {
    const walls = [row(100), row(200)];
    const sight = computeSight([{ tokenId: 'v', origin, range: 2000, senses: [] }], walls);
    expect(pointInPolygon({ x: 0, y: 150 }, sight.regions[0]!.polygon!)).toBe(true);
    expect(pointInPolygon({ x: 0, y: 250 }, sight.regions[0]!.polygon!)).toBe(false);
    const reach = lightReach(origin, 600, walls, 300);
    expect(lightLevelAt({ x: 0, y: 150 }, { ambient: 0 }, [reach])).toBe('bright');
    expect(lightLevelAt({ x: 0, y: 250 }, { ambient: 0 }, [reach])).toBe('dark');
  });

  it('decides as before where no wall is limited', () => {
    const plain = [wall(-400, 100, 400, 100), wall(100, -300, 100, 50, { type: 'door', closed: true }), wall(-90, -90, -20, -120, { direction: 'left' })];
    const asLimited = plain.map((w) => ({ ...w, limited: false }));
    expect(computeVisibility(origin, 500, asLimited)).toEqual(computeVisibility(origin, 500, plain));
  });

  it('reads `limited` only where it is true, and leaves the file\'s record as it is', () => {
    const strange = { ...wall(0, 0, 10, 0), limited: 'yes' } as unknown as WallSegment;
    expect(readWall(strange)!.limited).toBeUndefined();
    expect((strange as unknown as { limited: string }).limited).toBe('yes');
    const real = hedge(0, 0, 10, 0);
    expect(readWall(real)).toBe(real);
  });
});

describe('limited walls against counting every crossing by hand', () => {
  /** A seeded random number in [0, 1). */
  function random(seed: number): () => number {
    return () => {
      seed = (seed * 1_664_525 + 1_013_904_223) >>> 0;
      return seed / 4_294_967_296;
    };
  }

  /** Walls of every sort around the viewer: rings and chains that share corners, loose walls, some limited, some doors or one-way. */
  function soup(rand: () => number): WallSegment[] {
    const walls: WallSegment[] = [];
    const sort = (): Partial<WallSegment> => {
      const limited = rand() < 0.6 ? { limited: true } : {};
      const how = rand();
      if (how < 0.08) return { ...limited, type: 'door', closed: false };
      if (how < 0.16) return { ...limited, type: 'door', closed: true };
      if (how < 0.24) return { ...limited, direction: rand() < 0.5 ? 'left' : 'right' };
      return limited;
    };
    for (let ring = 0; ring < 3; ring++) {
      const cx = (rand() - 0.5) * 500, cy = (rand() - 0.5) * 500, corners = 3 + Math.floor(rand() * 5), size = 40 + rand() * 160;
      const points = Array.from({ length: corners }, (_, i) => ({ x: cx + Math.cos((i / corners) * Math.PI * 2) * size * (0.6 + rand() * 0.8), y: cy + Math.sin((i / corners) * Math.PI * 2) * size * (0.6 + rand() * 0.8) }));
      const ringSort = rand() < 0.5 ? { limited: true } : null;
      points.forEach((point, i) => {
        const next = points[(i + 1) % corners]!;
        walls.push(wall(point.x, point.y, next.x, next.y, ringSort ?? sort()));
      });
    }
    for (let loose = 0; loose < 8; loose++) {
      const x = (rand() - 0.5) * 800, y = (rand() - 0.5) * 800, angle = rand() * Math.PI * 2, length = 30 + rand() * 300;
      walls.push(wall(x, y, x + Math.cos(angle) * length, y + Math.sin(angle) * length, sort()));
    }
    return walls;
  }

  it.each(['sight', 'light'] as WallChannel[])('agrees for %s at every point that is clear of the walls\' ends and lines', (channel) => {
    let asked = 0, seenBehindOne = 0;
    for (let seed = 1; seed <= 150; seed++) {
      const rand = random(seed * 7919);
      const walls = soup(rand).map((w) => (rand() < 0.15 ? { ...w, blocks: rand() < 0.5 ? 'sight' as const : 'light' as const } : w));
      const from = { x: (rand() - 0.5) * 300, y: (rand() - 0.5) * 300 };
      const counted = walls.filter((w) => blocksFrom(w, from, channel));
      if (counted.some((w) => distance(from, w.p1, w.p2) < 2)) continue;
      const seen = computeVisibility(from, 900, walls, undefined, channel);
      for (let i = 0; i < 150; i++) {
        const angle = rand() * Math.PI * 2, reach = 5 + rand() * 880;
        const point = { x: from.x + Math.cos(angle) * reach, y: from.y + Math.sin(angle) * reach };
        const far = { x: from.x + Math.cos(angle) * 900, y: from.y + Math.sin(angle) * 900 };
        // A ray that grazes a wall's end, or a point on a wall's line, is anyone's to decide.
        if (counted.some((w) => distance(w.p1, from, far) < 0.5 || distance(w.p2, from, far) < 0.5 || distance(point, w.p1, w.p2) < 0.5)) continue;
        // Limited walls that run together are one hedge (`byHand.ts`).
        const crossed = crossedByHand(from, point, walls, channel);
        const visible = !crossed.solid && crossed.limited < 2;
        asked++;
        if (visible && crossed.limited === 1) seenBehindOne++;
        expect([seed, i, channel, pointInPolygon(point, seen)]).toEqual([seed, i, channel, visible]);
      }
    }
    expect(asked).toBeGreaterThan(10_000);
    expect(seenBehindOne).toBeGreaterThan(500);
  });
});

