import { describe, expect, it } from 'vitest';
import { gameUnitsToWorld, unitScaleOf } from '../lightingUnits';

describe('lighting units', () => {
  it('converts game units to world pixels by cell size', () => {
    expect(gameUnitsToWorld(30, unitScaleOf({ unitDistance: 5 }, { size: 70 }))).toBe(420);
  });

  it('falls back to 5 units per 70px cell without measurement or grid', () => {
    expect(unitScaleOf(null, null)).toEqual({ unitDistance: 5, cellSize: 70 });
  });

  it('ignores non-positive unit distances instead of dividing by zero', () => {
    expect(unitScaleOf({ unitDistance: 0 }, { size: 50 })).toEqual({ unitDistance: 5, cellSize: 50 });
  });
});
