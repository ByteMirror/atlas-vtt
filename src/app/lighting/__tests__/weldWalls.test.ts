import { describe, expect, it } from 'vitest';
import { weldWalls, weldedWalls } from '../weldWalls';
import { crosses, segOf } from '../segments';
import type { WallSegment } from '../../types/wallTypes';

function wall(id: string, x1: number, y1: number, x2: number, y2: number, extra: Partial<WallSegment> = {}): WallSegment {
  return { id, kind: 'wall', type: 'solid', p1: { x: x1, y: y1 }, p2: { x: x2, y: y2 }, ...extra };
}

describe('weldWalls', () => {
  it('joins a hand-drawn corner with a gap into one shared vertex', () => {
    const [a, b] = weldWalls([wall('a', 0, 0, 100, 0), wall('b', 102, 2, 102, 100)], 6);
    expect(a!.p2).toEqual(b!.p1);
  });

  it('leaves exact joints where they are', () => {
    const walls = [wall('a', 0, 0, 100, 0), wall('b', 100, 0, 100, 100)];
    expect(weldWalls(walls, 6).map((w) => [w.p1, w.p2])).toEqual(walls.map((w) => [w.p1, w.p2]));
  });

  it('carries a wall that stops short of another across it (T-junction)', () => {
    const [, tee] = weldWalls([wall('a', 0, 0, 100, 0), wall('t', 50, 50, 50, 2)], 6);
    expect(tee!.p2.y).toBeLessThan(0);
    expect(tee!.p2.x).toBeCloseTo(50, 9);
    expect(crosses(tee!.p1.x, tee!.p1.y, tee!.p2.x, tee!.p2.y, segOf(wall('a', 0, 0, 100, 0)))).toBe(true);
  });

  it('keeps gaps wider than the tolerance open', () => {
    const [a, b] = weldWalls([wall('a', 0, 0, 100, 0), wall('b', 110, 0, 200, 0)], 6);
    expect(a!.p2).toEqual({ x: 100, y: 0 });
    expect(b!.p1).toEqual({ x: 110, y: 0 });
  });

  it('keeps ids, types and door state', () => {
    const [door] = weldWalls([wall('d', 0, 0, 50, 0, { type: 'door', closed: false, direction: 'left' })], 6);
    expect(door).toMatchObject({ id: 'd', type: 'door', closed: false, direction: 'left' });
  });

  it('returns the same array for the same input', () => {
    const walls = [wall('a', 0, 0, 10, 0)];
    expect(weldedWalls(walls)).toBe(weldedWalls(walls));
  });
});
