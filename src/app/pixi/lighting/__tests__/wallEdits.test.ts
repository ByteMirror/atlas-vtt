import { describe, expect, it } from 'vitest';
import { simplifyStroke, splitWall } from '../wallEdits';
import type { WallSegment } from '../../../types/wallTypes';

const wall: WallSegment = {
  id: 'w', kind: 'wall', type: 'door', p1: { x: 0, y: 0 }, p2: { x: 100, y: 0 }, closed: false, direction: 'left', chainId: 'c',
};

describe('splitWall', () => {
  it('splits at the point projected onto the wall and keeps its properties', () => {
    const [first, second] = splitWall(wall, { x: 30, y: 12 })!;
    expect(first).toEqual({ type: 'door', p1: { x: 0, y: 0 }, p2: { x: 30, y: 0 }, closed: false, direction: 'left', chainId: 'c' });
    expect(second).toEqual({ type: 'door', p1: { x: 30, y: 0 }, p2: { x: 100, y: 0 }, closed: false, direction: 'left', chainId: 'c' });
  });

  it('keeps both halves from collapsing near an end', () => {
    const [first] = splitWall(wall, { x: -50, y: 0 })!;
    expect(first.p2.x).toBeCloseTo(5);
  });

  it('refuses zero-length walls', () => {
    expect(splitWall({ ...wall, p2: { x: 0, y: 0 } }, { x: 0, y: 0 })).toBeNull();
  });
});

describe('simplifyStroke', () => {
  it('keeps the ends and drops points on a straight line', () => {
    expect(simplifyStroke([{ x: 0, y: 0 }, { x: 5, y: 0.5 }, { x: 10, y: 0 }], 2)).toEqual([{ x: 0, y: 0 }, { x: 10, y: 0 }]);
  });

  it('keeps corners', () => {
    const corner = [{ x: 0, y: 0 }, { x: 10, y: 0 }, { x: 10, y: 10 }];
    expect(simplifyStroke(corner, 2)).toEqual(corner);
  });
});
