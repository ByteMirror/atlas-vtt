import { describe, expect, it } from 'vitest';
import { wallList } from '../wallList';
import type { WallSegment } from '../../types/wallTypes';

const wall: WallSegment = { id: 'w', kind: 'wall', type: 'solid', p1: { x: 0, y: 0 }, p2: { x: 1, y: 0 } };

describe('wallList', () => {
  it('returns the same array while the walls record is unchanged, so caches keyed on it hit', () => {
    const walls = { w: wall };
    expect(wallList(walls)).toBe(wallList(walls));
    expect(wallList(walls)).toEqual([wall]);
  });

  it('returns a new array for a new walls record', () => {
    expect(wallList({ w: wall })).not.toBe(wallList({ w: wall }));
  });
});
