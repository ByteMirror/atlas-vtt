import { describe, expect, it } from 'vitest';
import { changedWallRects } from '../wallChanges';
import type { WallSegment } from '../../types/wallTypes';

const a: WallSegment = { id: 'a', kind: 'wall', type: 'door', closed: true, p1: { x: 0, y: 0 }, p2: { x: 10, y: 0 } };
const b: WallSegment = { id: 'b', kind: 'wall', type: 'solid', p1: { x: 100, y: 100 }, p2: { x: 110, y: 100 } };

describe('changedWallRects', () => {
  it('is empty when nothing changed', () => {
    expect(changedWallRects([a, b], [a, { ...b }], 3)).toEqual([]);
  });

  it('covers a toggled door, padded', () => {
    expect(changedWallRects([a, b], [{ ...a, closed: false }, b], 3)).toEqual([[-3, -3, 16, 6]]);
  });

  it('covers both the old and new place of a moved wall, and added and removed walls', () => {
    const moved = { ...b, p1: { x: 200, y: 200 }, p2: { x: 210, y: 200 } };
    expect(changedWallRects([a, b], [moved], 0)).toEqual(expect.arrayContaining([[100, 100, 10, 0], [200, 200, 10, 0], [0, 0, 10, 0]]));
  });
});
