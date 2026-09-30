import type { TokenVisionDefaults } from '../types/lightingTypes';

const DISTANCE_FIELDS = ['range', 'darkvision', 'tremorsense'] as const;
const FULL_TURN = 360;

function isUsable(value: unknown, min: number, max: number): value is number {
  return typeof value === 'number' && Number.isFinite(value) && value >= min && value <= max;
}

/**
 * The usable part of stored default vision: distances of 0 or more, an angle of 1 to
 * 360 degrees, anything else (unknown fields, `enabled`) dropped. Undefined when
 * nothing is left, since an empty default means new tokens get no vision settings.
 */
export function parseVisionDefaults(raw: unknown): TokenVisionDefaults | undefined {
  if (typeof raw !== 'object' || raw === null || Array.isArray(raw)) return undefined;
  const record = raw as Record<string, unknown>;
  const result: TokenVisionDefaults = {};
  for (const field of DISTANCE_FIELDS) {
    const value = record[field];
    if (isUsable(value, 0, Infinity)) result[field] = value;
  }
  if (isUsable(record.angle, 1, FULL_TURN)) result.angle = record.angle;
  return hasVisionDefaults(result) ? result : undefined;
}

/** Whether `defaults` sets anything new tokens would start with. */
export function hasVisionDefaults(defaults: TokenVisionDefaults | undefined): defaults is TokenVisionDefaults {
  return defaults !== undefined && Object.values(defaults).some((value) => value !== undefined);
}

/** Whether two defaults give tokens the same vision; none and empty are the same. */
export function sameVisionDefaults(a: TokenVisionDefaults | undefined, b: TokenVisionDefaults | undefined): boolean {
  return a?.range === b?.range
    && a?.darkvision === b?.darkvision
    && a?.tremorsense === b?.tremorsense
    && a?.angle === b?.angle;
}
