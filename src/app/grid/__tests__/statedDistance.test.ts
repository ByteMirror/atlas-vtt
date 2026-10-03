import { describe, expect, it } from 'vitest';
import { readDistance, toGameUnits, type GameUnit } from '../statedDistance';

const FEET: GameUnit = { unitType: 'feet', unitDistance: 5 };
const METRES: GameUnit = { unitType: 'meters', unitDistance: 1.5 };
const YARDS: GameUnit = { unitType: 'yards', unitDistance: 2 };
const SQUARES: GameUnit = { unitType: 'units', unitDistance: 1 };

function read(text: string): [number, string | null] | null {
  const distance = readDistance(text);
  return distance ? [distance.value, distance.unit] : null;
}

describe('readDistance', () => {
  it('reads a number with the unit statblocks write after it', () => {
    expect(read('60 ft.')).toEqual([60, 'feet']);
    expect(read('60 feet')).toEqual([60, 'feet']);
    expect(read('60-foot')).toEqual([60, 'feet']);
    expect(read('60\'')).toEqual([60, 'feet']);
    expect(read('60′')).toEqual([60, 'feet']);
    expect(read('18 m')).toEqual([18, 'meters']);
    expect(read('18m')).toEqual([18, 'meters']);
    expect(read('4.5 metres')).toEqual([4.5, 'meters']);
    expect(read('1,5 Meter')).toEqual([1.5, 'meters']);
    expect(read('20 yards')).toEqual([20, 'yards']);
    expect(read('12 squares')).toEqual([12, 'squares']);
    expect(read('12 sq.')).toEqual([12, 'squares']);
    expect(read('1 mile')).toEqual([1, 'miles']);
    expect(read('1,000 feet')).toEqual([1000, 'feet']);
  });

  it('reads a number without a unit as one, and says where the distance stands', () => {
    expect(read('60')).toEqual([60, null]);
    expect(readDistance('darkvision 60 ft. (rat form only)')).toEqual({ value: 60, unit: 'feet', start: 11, end: 17 });
  });

  it('takes the first distance of several', () => {
    expect(read('30 ft. or 10 ft. while deafened')).toEqual([30, 'feet']);
  });

  it('finds none in text without a number, in a modifier, or in a number that is part of a word', () => {
    expect(read('low-light vision')).toBeNull();
    expect(read('Perception +7')).toBeNull();
    expect(read('Perception -1')).toBeNull();
    expect(read('4th rank')).toBeNull();
    expect(read('2nd-level spells, 60 ft.')).toEqual([60, 'feet']);
    expect(read('10 minutes')).toEqual([10, null]);
  });

  it('reads a dot before three digits as thousands only where the locale groups with one, and not at all elsewhere', () => {
    expect(readDistance('1.000 ft.', 'de')).toMatchObject({ value: 1000, unit: 'feet' });
    expect(readDistance('12.000 m', 'de')).toMatchObject({ value: 12000, unit: 'meters' });
    expect(readDistance('1.000 ft.', 'en')).toBeNull();
    expect(readDistance('1.5 m', 'en')).toMatchObject({ value: 1.5 });
    expect(readDistance('1.5 m', 'de')).toMatchObject({ value: 1.5 });
    expect(readDistance('1.25 miles', 'en')).toMatchObject({ value: 1.25 });
  });
});

describe('toGameUnits', () => {
  it('keeps a distance stated in the collection\'s own unit, whatever its squares span', () => {
    expect(toGameUnits({ value: 60, unit: 'feet' }, FEET)).toBe(60);
    expect(toGameUnits({ value: 60, unit: 'feet' }, { unitType: 'feet', unitDistance: 10 })).toBe(60);
    expect(toGameUnits({ value: 18, unit: 'meters' }, METRES)).toBe(18);
  });

  it('takes a distance without a unit as game units', () => {
    expect(toGameUnits({ value: 60, unit: null }, FEET)).toBe(60);
    expect(toGameUnits({ value: 18, unit: null }, METRES)).toBe(18);
  });

  it('converts between feet and metres as the rules do: a 5-foot square is 1.5 metres', () => {
    expect(toGameUnits({ value: 60, unit: 'feet' }, METRES)).toBe(18);
    expect(toGameUnits({ value: 120, unit: 'feet' }, METRES)).toBe(36);
    expect(toGameUnits({ value: 10, unit: 'feet' }, METRES)).toBe(3);
    expect(toGameUnits({ value: 18, unit: 'meters' }, FEET)).toBe(60);
    expect(toGameUnits({ value: 9, unit: 'meters' }, FEET)).toBe(30);
  });

  it('converts yards, miles and kilometres', () => {
    expect(toGameUnits({ value: 60, unit: 'feet' }, YARDS)).toBe(20);
    expect(toGameUnits({ value: 20, unit: 'yards' }, FEET)).toBe(60);
    expect(toGameUnits({ value: 1, unit: 'miles' }, FEET)).toBe(5280);
    expect(toGameUnits({ value: 1, unit: 'kilometers' }, METRES)).toBe(1000);
  });

  it('counts squares by what a grid cell spans in the collection', () => {
    expect(toGameUnits({ value: 12, unit: 'squares' }, FEET)).toBe(60);
    expect(toGameUnits({ value: 12, unit: 'squares' }, METRES)).toBe(18);
    expect(toGameUnits({ value: 6, unit: 'squares' }, { unitType: 'feet', unitDistance: 10 })).toBe(60);
    expect(toGameUnits({ value: 12, unit: 'squares' }, SQUARES)).toBe(12);
  });

  it('reads a real distance as 5-foot squares where the collection counts in units of its own', () => {
    expect(toGameUnits({ value: 60, unit: 'feet' }, SQUARES)).toBe(12);
    expect(toGameUnits({ value: 18, unit: 'meters' }, SQUARES)).toBe(12);
    expect(toGameUnits({ value: 60, unit: 'feet' }, { unitType: 'custom', unitDistance: 2 })).toBe(24);
  });

  it('falls back to 5 game units a cell where the collection\'s cell spans nothing', () => {
    expect(toGameUnits({ value: 12, unit: 'squares' }, { unitType: 'feet', unitDistance: 0 })).toBe(60);
  });
});
