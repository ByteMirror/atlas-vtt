import { describe, it, expect } from 'vitest';
import type { RangeBand } from '../../src/app/types/collectionSettingsTypes';
import {
  areRangeBandsValid,
  formatDistance,
  formatReach,
  isValidRangeBandThreshold,
  rangeBandName,
  resolveMeasurementSettings,
  unitLabelFor,
  type MeasurementSettings,
} from '../../src/app/grid/measurementFormat';

describe('rangeBandName', () => {
  const bands: RangeBand[] = [
    { name: 'Melee', maxSquares: 1 },
    { name: 'Close', maxSquares: 3 },
    { name: 'Far', maxSquares: 6 },
    { name: 'Very Far', maxSquares: 12 },
  ];

  it('returns first band for distance within range', () => {
    expect(rangeBandName(0, bands)).toBe('Melee');
    expect(rangeBandName(1, bands)).toBe('Melee');
  });

  it('returns correct band at boundaries', () => {
    expect(rangeBandName(3, bands)).toBe('Close');
    expect(rangeBandName(4, bands)).toBe('Far');
    expect(rangeBandName(6, bands)).toBe('Far');
  });

  it('returns last band name for distances past all thresholds', () => {
    expect(rangeBandName(15, bands)).toBe('Very Far');
    expect(rangeBandName(100, bands)).toBe('Very Far');
  });

  it('handles empty bands with grid-square fallback', () => {
    expect(rangeBandName(5, [])).toBe('5 sq');
    expect(rangeBandName(0, [])).toBe('0 sq');
  });

  it('handles fractional grid distances via rounding', () => {
    expect(rangeBandName(1.4, bands)).toBe('Melee');
    expect(rangeBandName(1.6, bands)).toBe('Close');
  });
});

describe('formatDistance', () => {
  const metric: MeasurementSettings = { mode: 'metric', unitType: 'feet', unitDistance: 5, diagonalRule: 'equidistant', rangeBands: [], coneAngle: 90 };

  it('multiplies cells by the unit distance and rounds', () => {
    expect(formatDistance(6, metric)).toBe('30ft');
    expect(formatDistance(Math.SQRT2, metric)).toBe('7ft');
  });

  it('labels each unit type', () => {
    expect(formatDistance(2, { ...metric, unitType: 'meters', unitDistance: 1.5 })).toBe('3m');
    expect(formatDistance(2, { ...metric, unitType: 'units', unitDistance: 1 })).toBe('2u');
    expect(formatDistance(2, { ...metric, unitType: 'custom', unitDistance: 10 })).toBe('20');
  });

  it('uses range bands in abstract mode', () => {
    expect(formatDistance(2, { ...metric, mode: 'abstract', rangeBands: [{ name: 'Close', maxSquares: 3 }] })).toBe('Close');
  });
});

describe('resolveMeasurementSettings', () => {
  const grid = { enabled: true, size: 70, offsetX: 0, offsetY: 0, opacity: 1 };

  it('prefers the collection defaults', () => {
    const settings = resolveMeasurementSettings(
      { unitType: 'meters', unitDistance: 2, measurementMode: 'metric', diagonalRule: 'alternating' },
      { ...grid, unitType: 'feet', unitDistance: 5, measurementType: 'abstract' },
    );
    expect(settings).toEqual({ mode: 'metric', unitType: 'meters', unitDistance: 2, diagonalRule: 'alternating', rangeBands: [], coneAngle: 90 });
  });

  it('defaults collections without a diagonal rule to every diagonal counting 1', () => {
    expect(resolveMeasurementSettings({ unitType: 'feet', unitDistance: 5, measurementMode: 'metric' }, null).diagonalRule).toBe('equidistant');
  });

  it('falls back to the map grid, measuring in range bands unless it asks for units', () => {
    expect(resolveMeasurementSettings(undefined, { ...grid, measurementType: 'units', unitType: 'meters', unitDistance: 3 }))
      .toEqual({ mode: 'metric', unitType: 'meters', unitDistance: 3, diagonalRule: 'equidistant', rangeBands: [], coneAngle: 90 });
    expect(resolveMeasurementSettings(undefined, grid).mode).toBe('abstract');
    expect(resolveMeasurementSettings(undefined, null)).toMatchObject({ unitType: 'feet', unitDistance: 5 });
  });
});

describe('range band validation', () => {
  it('accepts whole thresholds of at least one square', () => {
    expect(isValidRangeBandThreshold(1)).toBe(true);
    expect(isValidRangeBandThreshold(12)).toBe(true);
  });

  it('rejects empty, zero, negative and fractional thresholds', () => {
    for (const value of [NaN, 0, -3, 1.5, Infinity]) {
      expect(isValidRangeBandThreshold(value)).toBe(false);
    }
  });

  it('requires every band to be valid', () => {
    expect(areRangeBandsValid(undefined)).toBe(true);
    expect(areRangeBandsValid([{ name: 'Close', maxSquares: 3 }])).toBe(true);
    expect(areRangeBandsValid([{ name: 'Close', maxSquares: 3 }, { name: 'Far', maxSquares: NaN }])).toBe(false);
  });
});

describe('unitLabelFor', () => {
  it('labels feet, yards and metres, nothing for generic units, and feet for maps without a unit', () => {
    expect(['feet', 'yards', 'meters', 'units', 'custom', undefined].map((unit) => unitLabelFor(unit as never)))
      .toEqual(['ft', 'yd', 'm', '', '', 'ft']);
  });
});

describe('formatReach', () => {
  const metric = (unitDistance: number, unitType: 'feet' | 'meters'): MeasurementSettings => ({ mode: 'metric', unitType, unitDistance, diagonalRule: 'equidistant', rangeBands: [], coneAngle: 90 });

  it('words a set distance with one decimal where it has one', () => {
    expect(formatReach(12, metric(5, 'feet'))).toBe('60ft');
    expect(formatReach(5, metric(1.5, 'meters'))).toBe('7.5m');
    expect(formatReach(3, metric(1.5, 'meters'))).toBe('4.5m');
    expect(formatReach(12.04, metric(5, 'feet'))).toBe('60.2ft');
  });

  it('names the range band, or counts squares where the collection has none', () => {
    const bands = { mode: 'abstract', unitType: 'feet', unitDistance: 5, diagonalRule: 'equidistant', rangeBands: [{ name: 'Close', maxSquares: 2 }, { name: 'Far', maxSquares: 10 }] } as MeasurementSettings;
    expect(formatReach(6, bands)).toBe('Far');
    expect(formatReach(1.5, { ...bands, rangeBands: [] })).toBe('1.5 sq');
  });
});
