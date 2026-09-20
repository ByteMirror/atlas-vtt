import { describe, it, expect } from 'vitest';
import type { RangeBand } from '../../src/app/types/collectionSettingsTypes';

/** Pure-function equivalent of MeasureRenderer.getAbstractRange() */
function lookupRangeBand(gridDistance: number, bands: RangeBand[]): string {
  const grids = Math.round(gridDistance);

  if (bands.length === 0) return `${grids} sq`;

  for (const band of bands) {
    if (grids <= band.maxSquares) return band.name;
  }
  return bands[bands.length - 1]!.name;
}

describe('lookupRangeBand', () => {
  const bands: RangeBand[] = [
    { name: 'Melee', maxSquares: 1 },
    { name: 'Close', maxSquares: 3 },
    { name: 'Far', maxSquares: 6 },
    { name: 'Very Far', maxSquares: 12 },
  ];

  it('returns first band for distance within range', () => {
    expect(lookupRangeBand(0, bands)).toBe('Melee');
    expect(lookupRangeBand(1, bands)).toBe('Melee');
  });

  it('returns correct band at boundaries', () => {
    expect(lookupRangeBand(3, bands)).toBe('Close');
    expect(lookupRangeBand(4, bands)).toBe('Far');
    expect(lookupRangeBand(6, bands)).toBe('Far');
  });

  it('returns last band name for distances past all thresholds', () => {
    expect(lookupRangeBand(15, bands)).toBe('Very Far');
    expect(lookupRangeBand(100, bands)).toBe('Very Far');
  });

  it('handles empty bands with grid-square fallback', () => {
    expect(lookupRangeBand(5, [])).toBe('5 sq');
    expect(lookupRangeBand(0, [])).toBe('0 sq');
  });

  it('handles fractional grid distances via rounding', () => {
    expect(lookupRangeBand(1.4, bands)).toBe('Melee');
    expect(lookupRangeBand(1.6, bands)).toBe('Close');
  });
});
