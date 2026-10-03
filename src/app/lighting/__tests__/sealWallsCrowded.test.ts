import { describe, expect, it } from 'vitest';
import type { WallSegment } from '../../types/wallTypes';
import { computeVisibility, pointInPolygon } from '../../vision/visibility';
import { sealWalls } from '../sealWalls';
import { TOLERANCE, key, random, wall } from './sealFixtures';

// Wall-clock bound of the timed tests here. They seal in 0.1 to 1 s run alone (6 s were seen
// with the machine at a load average of 30); a bridge for every pair of crowded ends, which
// they guard against, took a minute and more. The count of bridges is asserted beside it.
const SLOW = 15_000;

describe('sealWalls with crowded wall ends', () => {
  const bridgesOf = (walls: WallSegment[]): WallSegment[] => sealWalls(walls, TOLERANCE).slice(walls.length);
  /** Sealing `walls`, the time it took and the bridges it made. */
  function timed(walls: WallSegment[]): { ms: number; bridges: WallSegment[] } {
    const started = performance.now();
    const bridges = bridgesOf(walls);
    return { ms: performance.now() - started, bridges };
  }
  const distinctEnds = (walls: WallSegment[]): number => new Set(walls.flatMap((w) => [key(w.p1), key(w.p2)])).size;

  /** A thousand walls that start within a few pixels of each other and run apart. */
  function pile(): WallSegment[] {
    const rand = random(7);
    return Array.from({ length: 1000 }, (_, i) => {
      const angle = rand() * Math.PI * 2;
      const x = 500 + rand() * 6, y = 500 + rand() * 6;
      return wall(`pile${i}`, x, y, x + Math.cos(angle) * 200, y + Math.sin(angle) * 200);
    });
  }
  /** Twenty thousand walls from one point, their far ends a tenth of a pixel apart on a circle. */
  function star(): WallSegment[] {
    return Array.from({ length: 20_000 }, (_, i) => {
      const angle = (i / 20_000) * Math.PI * 2;
      return wall(`ray${i}`, 1000, 1000, 1000 + Math.cos(angle) * 318, 1000 + Math.sin(angle) * 318);
    });
  }
  /** A cave drawn as 19,800 segments of three pixels, in rows three pixels apart. */
  function cave(): WallSegment[] {
    return Array.from({ length: 60 }, (_, row) => Array.from({ length: 330 }, (_, i) => wall(`cave${row}-${i}`, 100 + i * 3, 100 + row * 3 + (i % 2), 103 + i * 3, 100 + row * 3 + ((i + 1) % 2)))).flat();
  }

  /** `count` walls that start within six pixels of each other and run apart. */
  const bigPile = (count: number) => (): WallSegment[] => {
    const rand = random(11);
    return Array.from({ length: count }, (_, i) => {
      const angle = rand() * Math.PI * 2;
      const x = 500 + rand() * 6, y = 500 + rand() * 6;
      return wall(`pile${i}`, x, y, x + Math.cos(angle) * 200, y + Math.sin(angle) * 200);
    });
  };
  /** Twenty thousand short walls with both ends in twelve pixels. */
  function shortPile(): WallSegment[] {
    const rand = random(13);
    return Array.from({ length: 20_000 }, (_, i) => wall(`short${i}`, 500 + rand() * 12, 500 + rand() * 12, 500 + rand() * 12, 500 + rand() * 12));
  }
  /** Eight thousand long walls a hair apart, and eight thousand walls that end beside all of them; the nearest long wall first or last. */
  const beside = (nearestLast: boolean) => (): WallSegment[] => {
    const long = Array.from({ length: 8000 }, (_, i) => wall(`long${i}`, 0, 500 + i * 0.0015, 1000, 500 + i * 0.0015));
    const stems = Array.from({ length: 8000 }, (_, i) => wall(`stem${i}`, 100 + i * 0.1, 300, 100 + i * 0.1, 499.5));
    return [...(nearestLast ? long.reverse() : long), ...stems];
  };
  /** A cave drawn as 60,000 segments of one pixel, in rows a pixel apart. */
  function fineCave(): WallSegment[] {
    return Array.from({ length: 100 }, (_, row) => Array.from({ length: 600 }, (_, i) => wall(`fine${row}-${i}`, 100 + i, 100 + row + (i % 2) * 0.5, 101 + i, 100 + row + ((i + 1) % 2) * 0.5))).flat();
  }

  it.each([
    ['twenty thousand walls from six pixels', bigPile(20_000)], ['twenty thousand short walls in twelve pixels', shortPile],
    ['eight thousand long walls beside eight thousand ends', beside(false)], ['the same with the nearest wall last', beside(true)],
    ['a cave of 60,000 segments of one pixel', fineCave],
  ] as const)('seals %s within the bound', { timeout: 120_000 }, (_name, make) => {
    const walls = make();
    const { ms, bridges } = timed(walls);
    console.info(`sealWalls, ${_name}: ${walls.length} walls, ${distinctEnds(walls)} ends, ${bridges.length} bridges, ${ms.toFixed(0)} ms`);
    // Under a second on the machine it was written on; the bound is generous for slower ones.
    expect(ms).toBeLessThan(SLOW);
    expect(bridges.length).toBeLessThanOrEqual(distinctEnds(walls) * 16);
  });

  it.each([['a pile of a thousand walls', pile], ['twenty thousand walls from one point', star], ['a cave of 19,800 short segments', cave]] as const)('seals %s quickly, with a number of bridges that grows with the ends, not with their pairs', (_name, make) => {
    const walls = make();
    const { ms, bridges } = timed(walls);
    console.info(`sealWalls, ${_name}: ${walls.length} walls, ${distinctEnds(walls)} ends, ${bridges.length} bridges, ${ms.toFixed(0)} ms`);
    // About 100 ms alone; the bound leaves room for a loaded machine. Pairs took a minute here.
    expect(ms).toBeLessThan(SLOW);
    expect(bridges.length).toBeLessThanOrEqual(distinctEnds(walls) * 16);
  });

  /** Every pair of distinct wall ends within the tolerance, of different walls: what sealing bridged before it was capped. */
  function pairs(walls: WallSegment[]): [{ x: number; y: number }, { x: number; y: number }][] {
    const ends = walls.flatMap((w, i) => [{ wall: i, point: w.p1 }, { wall: i, point: w.p2 }]);
    const found = new Map<string, [{ x: number; y: number }, { x: number; y: number }]>();
    for (const a of ends) {
      for (const b of ends) {
        const distance = Math.hypot(a.point.x - b.point.x, a.point.y - b.point.y);
        if (b.wall <= a.wall || distance === 0 || distance > TOLERANCE) continue;
        found.set([key(a.point), key(b.point)].sort().join('|'), [a.point, b.point]);
      }
    }
    return [...found.values()];
  }
  const endBridges = (walls: WallSegment[]): WallSegment[] => bridgesOf(walls).filter((b) => b.id.split(':').length === 5);
  const pairKeys = (list: { p1: { x: number; y: number }; p2: { x: number; y: number } }[]): string[] => list.map((b) => [key(b.p1), key(b.p2)].sort().join('|')).sort();

  it('bridges every pair of ends where no end has more than eight others near it, as before', () => {
    const rand = random(3);
    for (let trial = 0; trial < 40; trial++) {
      // Rooms' worth of junctions: up to five walls end within a few pixels of each of 30 places.
      const walls = Array.from({ length: 30 }, (_, place) => Array.from({ length: 2 + Math.floor(rand() * 4) }, (_, i) => {
        const x = (place % 6) * 150 + 100 + rand() * 8, y = Math.floor(place / 6) * 150 + 100 + rand() * 8;
        const angle = rand() * Math.PI * 2;
        return wall(`t${trial}p${place}w${i}`, x, y, x + Math.cos(angle) * 60, y + Math.sin(angle) * 60);
      })).flat();
      expect(pairKeys(endBridges(walls))).toEqual(pairKeys(pairs(walls).map(([p1, p2]) => ({ p1, p2 }))));
    }
  });

  it('joins every pair of crowded ends by a chain of bridges that stays as near to them as they are to each other', () => {
    const rand = random(11);
    let spared = 0;
    for (let trial = 0; trial < 12; trial++) {
      // Junctions of 9 to 40 walls: more ends than each is bridged to.
      const walls = Array.from({ length: 9 + Math.floor(rand() * 32) }, (_, i) => {
        const x = 400 + rand() * 20, y = 400 + rand() * 20;
        const angle = rand() * Math.PI * 2;
        return wall(`j${trial}w${i}`, x, y, x + Math.cos(angle) * 150, y + Math.sin(angle) * 150);
      });
      const bridges = endBridges(walls);
      const wanted = pairs(walls);
      expect(bridges.length).toBeLessThanOrEqual(wanted.length);
      spared += wanted.length - bridges.length;
      // Only pairs within the tolerance are ever bridged.
      for (const b of bridges) expect(Math.hypot(b.p1.x - b.p2.x, b.p1.y - b.p2.y)).toBeLessThanOrEqual(TOLERANCE);
      const next = new Map<string, { x: number; y: number }[]>();
      for (const b of bridges) {
        next.set(key(b.p1), [...(next.get(key(b.p1)) ?? []), b.p2]);
        next.set(key(b.p2), [...(next.get(key(b.p2)) ?? []), b.p1]);
      }
      for (const [a, b] of wanted) {
        const reach = Math.hypot(a.x - b.x, a.y - b.y) + 1e-9;
        const seen = new Set([key(a)]);
        const queue = [a];
        while (queue.length > 0 && !seen.has(key(b))) {
          for (const p of next.get(key(queue.pop()!)) ?? []) {
            if (seen.has(key(p)) || Math.hypot(p.x - b.x, p.y - b.y) > reach) continue;
            seen.add(key(p));
            queue.push(p);
          }
        }
        expect([trial, key(a), key(b), seen.has(key(b))]).toEqual([trial, key(a), key(b), true]);
      }
    }
    expect(spared).toBeGreaterThan(1000);
  });

  /** A wheel: a closed rim, and spokes from it that stop two to six pixels short of the hub, so short of each other. */
  function wheel(spokes: number, seed: number): WallSegment[] {
    const rand = random(seed);
    const on = (i: number, radius: number): { x: number; y: number } => ({ x: 500 + Math.cos((i / spokes) * Math.PI * 2) * radius, y: 500 + Math.sin((i / spokes) * Math.PI * 2) * radius });
    return Array.from({ length: spokes }, (_, i) => {
      const stop = on(i, 2 + rand() * 4);
      return [wall(`rim${i}`, on(i, 300).x, on(i, 300).y, on(i + 1, 300).x, on(i + 1, 300).y), wall(`spoke${i}`, on(i, 300).x, on(i, 300).y, stop.x, stop.y)];
    }).flat();
  }

  it.each([8, 12, 24, 60])('lets no sight through a junction of %i walls that end within the tolerance of each other', (spokes) => {
    const at = (slice: number, radius: number): { x: number; y: number } => ({ x: 500 + Math.cos(((slice + 0.5) / spokes) * Math.PI * 2) * radius, y: 500 + Math.sin(((slice + 0.5) / spokes) * Math.PI * 2) * radius });
    let seenUnsealed = 0;
    // The largest wheel is looked through from every seventh slice, with fewer hubs: sight through sixty spokes is slow.
    const [seeds, step] = spokes > 24 ? [3, 7] : [12, 1];
    for (let seed = 1; seed <= seeds; seed++) {
      const walls = wheel(spokes, seed);
      const sealed = sealWalls(walls, TOLERANCE);
      // From the middle of a slice, no other slice is seen, near the hub or far from it.
      for (let i = 0; i < spokes; i += step) {
        const viewer = at(i, 150);
        const seen = computeVisibility(viewer, 1000, sealed);
        const open = computeVisibility(viewer, 1000, walls);
        expect(pointInPolygon(at(i, 250), seen)).toBe(true);
        for (let j = 0; j < spokes; j++) {
          if (j === i) continue;
          for (const radius of [60, 150, 250]) {
            if (pointInPolygon(at(j, radius), open)) seenUnsealed++;
            expect([spokes, seed, i, j, radius, pointInPolygon(at(j, radius), seen)]).toEqual([spokes, seed, i, j, radius, false]);
          }
        }
      }
    }
    // Without the bridges the hub is open: the check can fail.
    expect(seenUnsealed).toBeGreaterThan(0);
  });

  it('bridges an end that many walls pass across the one that reaches farthest, which crosses the others', () => {
    // Twenty walls pass within the tolerance of one wall's end, each half a pixel farther.
    const lines = Array.from({ length: 20 }, (_, i) => wall(`line${i}`, 0, 2 + i * 0.5, 400, 2 + i * 0.5));
    const bridges = bridgesOf([wall('post', 200, -100, 200, 0), ...lines]).filter((b) => b.id.startsWith('seal:post:p2:'));
    expect(bridges.map((b) => b.id)).toEqual(['seal:post:p2:line19']);
    expect(bridges[0]!.p2.y).toBeCloseTo(11.51, 9);
  });

  /** A post whose end `count` walls pass on every side, three to eleven pixels from it. */
  function ringed(count: number): WallSegment[] {
    const passing = Array.from({ length: count }, (_, i) => {
      const towards = (i / count) * Math.PI * 2, foot = { x: 500 + Math.cos(towards) * (3 + (i % 9)), y: 500 + Math.sin(towards) * (3 + (i % 9)) };
      return wall(`pass${i}`, foot.x - Math.sin(towards) * 60, foot.y + Math.cos(towards) * 60, foot.x + Math.sin(towards) * 60, foot.y - Math.cos(towards) * 60);
    });
    return [wall('post', 500, 300, 500, 500), ...passing];
  }

  it('keeps at most twelve bridges from an end across the walls that pass it, and closes it off whole where there would be more', () => {
    for (const count of [9, 12, 13, 30, 64, 65, 100]) {
      const bridges = bridgesOf(ringed(count)).filter((b) => b.id.startsWith('seal:post:p2:') || b.id.startsWith('seal:plug:'));
      const plug = bridges.filter((b) => b.id.startsWith('seal:plug:'));
      // Bridges of its own, twelve at most, or a plug of sixteen: never both, never more.
      expect([count, plug.length === 0 || plug.length === bridges.length, bridges.length <= (plug.length ? 16 : 12)]).toEqual([count, true, true]);
      if (count <= 12) expect(plug).toEqual([]);
      if (count > 64) expect(plug).toHaveLength(16);
    }
    // Sixteen walls that all reach as far, from sixteen sides: sixteen corners, more than are kept.
    const around = Array.from({ length: 16 }, (_, i) => {
      const towards = (i / 16) * Math.PI * 2, foot = { x: 500 + Math.cos(towards) * 9, y: 500 + Math.sin(towards) * 9 };
      return wall(`around${i}`, foot.x - Math.sin(towards) * 60, foot.y + Math.cos(towards) * 60, foot.x + Math.sin(towards) * 60, foot.y - Math.cos(towards) * 60);
    });
    expect(bridgesOf([wall('post', 500, 300, 500, 500), ...around]).filter((b) => b.id.startsWith('seal:plug:'))).toHaveLength(16);
  });

  it('closes an end off whole with sixteen bridges around it that hold the tolerance and reach little past it', () => {
    const bridges = bridgesOf(ringed(100)).filter((b) => b.id.startsWith('seal:plug:'));
    expect(bridges.map((b) => b.id)).toEqual(Array.from({ length: 16 }, (_, k) => `seal:plug:4000:4000:${k}`));
    for (const b of bridges) {
      expect(Math.hypot(b.p1.x - b.p2.x, b.p1.y - b.p2.y)).toBeLessThanOrEqual(TOLERANCE);
      // Each side lies outside the circle of the tolerance around the end, and no corner farther than 0.45 px past it.
      expect(Math.hypot((b.p1.x + b.p2.x) / 2 - 500, (b.p1.y + b.p2.y) / 2 - 500)).toBeGreaterThan(TOLERANCE);
      expect(Math.hypot(b.p1.x - 500, b.p1.y - 500)).toBeLessThan(TOLERANCE + 0.45);
    }
  });

  it('leaves what passes a plugged end half a pixel beyond the tolerance alone, from every side', () => {
    const plug = bridgesOf(ringed(100)).filter((b) => b.id.startsWith('seal:plug:'));
    const crossing = (a: { x: number; y: number }, b: { x: number; y: number }, w: WallSegment): boolean => {
      const side = (p: { x: number; y: number }, q: { x: number; y: number }, r: { x: number; y: number }): number => Math.sign((q.x - p.x) * (r.y - p.y) - (q.y - p.y) * (r.x - p.x));
      return side(a, b, w.p1) !== side(a, b, w.p2) && side(w.p1, w.p2, a) !== side(w.p1, w.p2, b);
    };
    for (let k = 0; k < 360; k++) {
      const towards = (k / 360) * Math.PI * 2;
      // A line that passes the end at 13.5 px (the octagon reached 14.07), and one at 12.9 px, which the plug must stop.
      const line = (off: number): [{ x: number; y: number }, { x: number; y: number }] => {
        const foot = { x: 500 + Math.cos(towards) * off, y: 500 + Math.sin(towards) * off };
        return [{ x: foot.x - Math.sin(towards) * 40, y: foot.y + Math.cos(towards) * 40 }, { x: foot.x + Math.sin(towards) * 40, y: foot.y - Math.cos(towards) * 40 }];
      };
      expect([k, plug.some((b) => crossing(...line(13.5), b))]).toEqual([k, false]);
      expect([k, plug.some((b) => crossing(...line(12.9), b))]).toEqual([k, true]);
    }
  });

  it('gives ends that lie in one eighth of a pixel one plug between them', () => {
    const heap = Array.from({ length: 300 }, (_, i) => wall(`short${i}`, 500.01 + (i % 20) * 0.004, 500.01 + Math.floor(i / 20) * 0.004, 500.012 + (i % 20) * 0.004, 500.014 + Math.floor(i / 20) * 0.004));
    const bridges = bridgesOf([...ringed(100).slice(1), ...heap]).filter((b) => b.id.startsWith('seal:plug:'));
    expect(bridges).toHaveLength(16);
  });
});
