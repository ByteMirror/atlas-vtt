import { describe, expect, it } from 'vitest';
import { computeVisibility, wallsInReach } from '../visibility';
import { angleTo, raySegmentIntersect } from '../visionGeometry';
import type { Point } from '../../types/visionTypes';
import type { WallSegment } from '../../types/wallTypes';

/** The pre-sweep implementation: every ray against every wall. */
function bruteForce(origin: Point, radius: number, walls: readonly WallSegment[]): Point[] {
  const blocking = wallsInReach(walls, origin, radius);
  const angles: number[] = [];
  for (let i = 0; i < 64; i++) angles.push(-Math.PI + (2 * Math.PI * i) / 64);
  for (const wall of blocking) {
    for (const end of [wall.p1, wall.p2]) {
      if (end.x === origin.x && end.y === origin.y) continue;
      const angle = angleTo(origin, end);
      angles.push(angle - 1e-5, angle, angle + 1e-5);
    }
  }
  angles.sort((a, b) => a - b);
  return angles.map((angle) => {
    let reach = radius;
    for (const wall of blocking) reach = Math.min(reach, raySegmentIntersect(origin, angle, wall.p1, wall.p2));
    return { x: origin.x + Math.cos(angle) * reach, y: origin.y + Math.sin(angle) * reach };
  });
}

function rng(seed: number): () => number {
  return () => {
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

describe('computeVisibility sweep', () => {
  it('matches the brute-force sweep on random wall chains', () => {
    const rand = rng(5);
    for (let trial = 0; trial < 60; trial++) {
      const walls: WallSegment[] = [];
      for (let c = 0; c < 20; c++) {
        let x = rand() * 1000, y = rand() * 1000;
        for (let z = 0; z < 5; z++) {
          const a = rand() * Math.PI * 2, l = 20 + rand() * 150;
          walls.push({ id: `${trial}-${c}-${z}`, kind: 'wall', type: 'solid', p1: { x, y }, p2: { x: x + Math.cos(a) * l, y: y + Math.sin(a) * l } });
          x += Math.cos(a) * l;
          y += Math.sin(a) * l;
        }
      }
      const origin = { x: 200 + rand() * 600, y: 200 + rand() * 600 };
      const fast = computeVisibility(origin, 900, walls);
      const slow = bruteForce(origin, 900, walls);
      expect(fast).toHaveLength(slow.length);
      fast.forEach((p, i) => {
        expect(p.x).toBeCloseTo(slow[i]!.x, 6);
        expect(p.y).toBeCloseTo(slow[i]!.y, 6);
      });
    }
  });
});
