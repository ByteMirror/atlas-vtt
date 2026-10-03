import { IGNORED_FIELDS } from '../creatures/creatureFieldDiscovery';
import { clampValue } from './resourceValues';
import type { ResourceValue } from './resourceTypes';

/** A statblock key without case, spaces, underscores and hyphens: `Max Stress` and `max_stress` are one field. */
export const normalizedKey = (key: string): string => key.toLowerCase().replace(/[\s_-]/g, '');

const HIT_POINT_KEYS = ['hp', 'health', 'hitpoints'];

/** Whether a statblock key or label ("hp", "Hit Points:", "Health") names hit points. */
export function isHitPointsKey(key: string): boolean {
  return HIT_POINT_KEYS.includes(normalizedKey(key.replace(/:\s*$/, '')));
}

/**
 * The value under `key`: the exact key, else one spelled differently
 * (`Max Stress` for `max_stress`), else, for hit points, any of their usual names.
 */
function lookup(record: Record<string, unknown>, key: string): unknown {
  if (key in record) return record[key];
  const wanted = normalizedKey(key);
  const keys = Object.keys(record);
  const match = keys.find((candidate) => normalizedKey(candidate) === wanted)
    ?? (isHitPointsKey(key) ? keys.find(isHitPointsKey) : undefined);
  return match === undefined ? undefined : record[match];
}

/** Reads a dotted path (`stats.0`, `resources.mana`) from a statblock record. */
export function resolveField(record: Readonly<Record<string, unknown>>, path: string): unknown {
  const parts = path.split('.').map((part) => part.trim()).filter(Boolean);
  if (parts.length === 0) return undefined;
  let value: unknown = record;
  for (const part of parts) {
    if (Array.isArray(value)) value = /^\d+$/.test(part) ? value[Number(part)] : undefined;
    else if (value !== null && typeof value === 'object') value = lookup(value as Record<string, unknown>, part);
    else return undefined;
  }
  return value;
}

function numeric(value: unknown): number | null {
  if (typeof value === 'string' && /^\d+(?:\.\d+)?$/.test(value.trim())) value = Number(value);
  return typeof value === 'number' && Number.isFinite(value) && value >= 0 ? value : null;
}

/** Only concrete quantities: never rolls a dice expression or guesses from prose. */
export function parseResourceValue(value: unknown, spent = false): ResourceValue | null {
  if (value && typeof value === 'object' && !Array.isArray(value)) {
    const record = value as Record<string, unknown>;
    const max = numeric(record.max);
    const current = numeric(record.current ?? record.value ?? (spent ? 0 : max));
    return max !== null && current !== null ? clampValue({ current, max }) : null;
  }
  if (typeof value === 'string') {
    const fraction = value.trim().match(/^(\d+(?:\.\d+)?)\s*\/\s*(\d+(?:\.\d+)?)$/);
    if (fraction) return parseResourceValue({ current: fraction[1], max: fraction[2] });
    // Common HP notation: average followed by its hit-dice formula.
    const average = value.trim().match(/^(\d+)\s*\(\s*\d+d\d+(?:\s*[+-]\s*\d+)?\s*\)$/i);
    if (average) value = average[1];
  }
  const max = numeric(value);
  return max === null ? null : { current: spent ? 0 : max, max };
}

/** How deep `discoverResourceFields` looks: a field, a list entry (`stats.0`), a record inside a record. */
const DISCOVERY_DEPTH = 2;

/**
 * The fields of the given statblocks that hold a quantity, as paths a resource definition can
 * name. Fields that identify or render a statblock (`mtime`, `columns`) are left out.
 */
export function discoverResourceFields(records: readonly Readonly<Record<string, unknown>>[]): string[] {
  const found = new Set<string>();
  const visit = (value: unknown, path: string, depth: number): void => {
    if (path && parseResourceValue(value)) found.add(path);
    if (depth >= DISCOVERY_DEPTH) return;
    if (Array.isArray(value)) {
      value.forEach((item, index) => visit(item, path ? `${path}.${index}` : String(index), depth + 1));
    } else if (value !== null && typeof value === 'object') {
      for (const [key, item] of Object.entries(value)) {
        if (path || !IGNORED_FIELDS.has(key)) visit(item, path ? `${path}.${key}` : key, depth + 1);
      }
    }
  };
  for (const record of records) visit(record, '', 0);
  return [...found].sort();
}
