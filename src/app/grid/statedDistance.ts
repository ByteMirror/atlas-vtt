/**
 * Distances as rulebooks and statblocks write them ("60 ft.", "18 m", "12 squares", "60'"),
 * read into a collection's game units.
 */

import { unitScaleOf } from '../lighting/lightingUnits';
import type { GridUnitType } from '../types/collectionSettingsTypes';
import type { MeasurementSettings } from './measurementFormat';

/** What a collection measures in: its unit, and how many of it one grid cell spans. */
export type GameUnit = Pick<MeasurementSettings, 'unitType' | 'unitDistance'>;

/** The units a written distance may name. */
export type StatedUnit = 'feet' | 'yards' | 'meters' | 'miles' | 'kilometers' | 'squares';

export interface StatedDistance {
  value: number;
  /** Null for a bare number. */
  unit: StatedUnit | null;
  /** Where the distance stands in the text it was read from. */
  start: number;
  end: number;
}

/** Each unit as text names it; a unit must end its word, so "10 minutes" names none. */
const UNIT_WORDS: ReadonlyArray<[StatedUnit, string]> = [
  ['feet', String.raw`feet|foot|ft\.?|['′’]`],
  ['kilometers', String.raw`kilometers?|kilometres?|km\.?`],
  ['meters', String.raw`meters?|metres?|m\.?`],
  ['miles', String.raw`miles?|mi\.?`],
  ['yards', String.raw`yards?|yds?\.?`],
  ['squares', String.raw`squares?|sq\.?|cells?|hex(?:es)?`],
];

/** "1,000", then "1.000" (a thousand only where the locale groups with a dot), then any other number. */
const NUMBER = String.raw`\d{1,3}(?:,\d{3})+(?!\d)|(?<dotted>[1-9]\d{0,2}(?:\.\d{3})+(?!\d))|\d+(?:[.,]\d+)?`;
const UNIT = UNIT_WORDS.map(([unit, words]) => `(?<${unit}>${words})`).join('|');
/**
 * A number that is no modifier ("+7") and no part of a word ("4th"), with the unit after it or,
 * as a bare number, nothing of a word after it.
 */
const DISTANCE = new RegExp(
  String.raw`(?<![\p{L}\p{N}+\-−.,])(?<number>${NUMBER})(?:[\s-]*(?:${UNIT})(?![\p{L}\p{N}])|(?![\p{L}\p{N}]))`,
  'iu',
);

/** Whether `locale` (the user's, by default) writes a thousand as "1.000". */
function groupsWithDot(locale?: string): boolean {
  return (100000).toLocaleString(locale).includes('.');
}

/** "1,000" is a thousand, "1,5" one and a half. */
function numberOf(text: string): number {
  return Number(/,\d{3}(?!\d)/.test(text) ? text.replace(/,/g, '') : text.replace(',', '.'));
}

/**
 * The first distance `text` states, or null when it holds no number. A number written like
 * "1.000" is a thousand where `locale` (the user's, by default) groups digits with a dot; in any
 * other locale it could as well be 1, so no distance is read at all.
 */
export function readDistance(text: string, locale?: string): StatedDistance | null {
  const match = DISTANCE.exec(text);
  const groups = match?.groups;
  if (!match || !groups) return null;
  const dotted = groups.dotted !== undefined;
  if (dotted && !groupsWithDot(locale)) return null;
  const value = dotted ? Number(groups.dotted!.replace(/\./g, '')) : numberOf(groups.number!);
  if (!Number.isFinite(value)) return null;
  const unit = UNIT_WORDS.find(([name]) => groups[name] !== undefined)?.[0] ?? null;
  return { value, unit, start: match.index, end: match.index + match[0].length };
}

/**
 * Feet in one of each unit, as tabletop rules convert them: a 5-foot square is 1.5 metres, so
 * 60 feet are 18 metres (not the surveyor's 18.29).
 */
const FEET_IN: Readonly<Record<Exclude<StatedUnit, 'squares'>, number>> = {
  feet: 1,
  yards: 3,
  meters: 5 / 1.5,
  miles: 5280,
  kilometers: 5000 / 1.5,
};

/** The square the rules count in, where a collection's unit says nothing about real distances. */
const RULES_SQUARE_FEET = 5;

/** The real unit a collection measures in; none for collections counting in units of their own. */
const REAL_UNIT: Readonly<Partial<Record<GridUnitType, keyof typeof FEET_IN>>> = { feet: 'feet', yards: 'yards', meters: 'meters' };

function rounded(value: number): number {
  return Math.round(value * 100) / 100;
}

/**
 * A written distance in the collection's game units. A bare number and a distance in the
 * collection's own unit are taken as they are; squares count what a grid cell spans; other real
 * units are converted, and where the collection has no real unit, a rules square (5 feet) is one
 * of its grid cells.
 */
export function toGameUnits(distance: Pick<StatedDistance, 'value' | 'unit'>, unit: GameUnit): number {
  const { value } = distance;
  if (distance.unit === null) return value;
  const perCell = unitScaleOf(unit, null).unitDistance;
  if (distance.unit === 'squares') return rounded(value * perCell);
  const own = REAL_UNIT[unit.unitType];
  if (own === distance.unit) return value;
  const feet = value * FEET_IN[distance.unit];
  return rounded(own ? feet / FEET_IN[own] : (feet / RULES_SQUARE_FEET) * perCell);
}
