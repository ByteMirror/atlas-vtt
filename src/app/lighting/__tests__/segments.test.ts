import { describe, expect, it } from 'vitest';
import { crosses, distToSeg, splitBlocking } from '../segments';
import type { WallSegment } from '../../types/wallTypes';

const base: WallSegment = { id: 'w', kind: 'wall', type: 'solid', p1: { x: 0, y: 0 }, p2: { x: 10, y: 0 } };

describe('segments', () => {
  it('measures distance to the closest point of a segment', () => {
    expect(distToSeg(5, 3, [0, 0, 10, 0])).toBe(3);
    expect(distToSeg(13, 4, [0, 0, 10, 0])).toBe(5);
  });

  it('detects a move that crosses a segment, not one that leaves it', () => {
    expect(crosses(5, -1, 5, 1, [0, 0, 10, 0])).toBe(true);
    expect(crosses(5, 0, 5, 1, [0, 0, 10, 0])).toBe(false);
  });

  it('splits walls into two-way segments and one-way walls, dropping open doors and points', () => {
    const { twoWay, oneWay } = splitBlocking([
      base,
      { ...base, id: 'open', type: 'door', closed: false },
      { ...base, id: 'closed', type: 'door', closed: true },
      { ...base, id: 'oneway', direction: 'left' },
      { ...base, id: 'point', p2: { x: 0, y: 0 } },
    ]);
    expect(twoWay).toHaveLength(2);
    expect(oneWay.map((w) => w.id)).toEqual(['oneway']);
  });
});
