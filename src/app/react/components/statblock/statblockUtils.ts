/**
 * Value handling shared by the statblock blocks, matching Fantasy Statblocks'
 * own semantics so that layouts authored for it render identically.
 */

import type { StatblockItem, StatblockMonster } from './statblockTypes';

/** Flattens arbitrary frontmatter values to display text, as Fantasy Statblocks does. */
export function stringify(
  property: unknown,
  depth = 0,
  joiner = ' ',
  parens = true,
): string {
  if (depth === 5) return '';
  if (property == null) return '';
  if (typeof property === 'string') return property;
  if (typeof property === 'number') return `${property}`;

  if (Array.isArray(property)) {
    const inner = property.map((p) => stringify(p, depth + 1)).join(joiner);
    return parens ? `(${inner})` : inner;
  }

  if (typeof property === 'object') {
    return Object.values(property as Record<string, unknown>)
      .map((value) => stringify(value, depth + 1))
      .join(' ');
  }

  return '';
}

export function slugify(str: string): string {
  if (!str) return '';
  return str
    .toLowerCase()
    .replace(/[^A-Za-z0-9\s_-]/g, '')
    .replace(/\s+/g, '-');
}

export function toTitleCase(str: string): string {
  return str.replace(/\b\w/g, (char) => char.toUpperCase());
}

/** Signed modifier, e.g. `+3` / `-1`. */
export function signed(value: number): string {
  return `${value >= 0 ? '+' : '-'}${Math.abs(value)}`;
}

/**
 * Runs a layout-supplied callback.
 *
 * Trust boundary: `code` comes from a Fantasy Statblocks layout definition,
 * which lives in the user's own vault and is authored by them — the same trust
 * level other plugin config, and the same thing Fantasy Statblocks does
 * with these callbacks. No remote or document content reaches this function.
 * Failures fall back to the untransformed value rather than breaking the render.
 */
export function runCallback<T>(
  code: string | undefined,
  args: Record<string, unknown>,
  fallback: T,
): T {
  if (!code) return fallback;
  try {
    const names = Object.keys(args);
    const fn = new Function(...names, code) as (...values: unknown[]) => T;
    return fn(...names.map((name) => args[name])) ?? fallback;
  } catch (error) {
    console.error('[Statblock] Layout callback failed:', error);
    return fallback;
  }
}

/** Mirrors Fantasy Statblocks' `checkConditioned`. */
export function isVisible(item: StatblockItem, monster: StatblockMonster): boolean {
  if (!item.conditioned) return true;

  if (item.nested) {
    return item.nested.some((nested) => isVisible(nested, monster));
  }

  if (item.type === 'ifelse' || item.type === 'javascript' || item.type === 'layout') {
    return true;
  }

  if (!item.properties?.length) return true;

  return item.properties.some((prop) => {
    if (!(prop in monster)) return false;
    const value = monster[prop];
    if (Array.isArray(value)) return value.length > 0;
    if (typeof value === 'string') return value.length > 0;
    return typeof value === 'number';
  });
}

/** The first bound property's display value, with fallback handling. */
export function propertyText(item: StatblockItem, monster: StatblockMonster): string {
  const key = item.properties?.[0];
  let text = key ? stringify(monster[key], 0, ', ', false) : '';

  if (item.callback) {
    text = tidyCallbackText(stringify(runCallback(item.callback, { monster }, text)));
  }

  if (!item.conditioned && !text.length) {
    return item.fallback ?? '-';
  }
  return text;
}

/** Ability-score modifier for table blocks; layouts may supply their own formula. */
export function abilityModifier(
  stat: number,
  item: StatblockItem,
  monster: StatblockMonster,
): string {
  if (typeof stat !== 'number') return '';

  if (!item.modifier?.length) {
    return signed(Math.floor((stat - 10) / 2));
  }

  const body = item.modifier.includes('return') ? item.modifier : `return ${item.modifier}`;
  return signed(runCallback<number>(body, { stat, monster }, 0));
}

/** Section heading text, which may itself be read from a monster property. */
export function headingText(item: StatblockItem, monster: StatblockMonster): string | null {
  if (item.headingProp && item.heading && item.heading in monster) {
    const text = stringify(monster[item.heading]);
    return text.length ? text : null;
  }
  return item.heading?.length ? item.heading : null;
}

const MISSING_VALUE = /\b(?:undefined|null|NaN)\b/g;
const SEPARATOR = '[-–—|,/;:]';
const REPEATED_SEPARATORS = new RegExp(`(\\s*${SEPARATOR}\\s*)(?:${SEPARATOR}\\s*)+`, 'g');
const DANGLING_SEPARATORS = new RegExp(`^\\s*${SEPARATOR}\\s*|\\s*${SEPARATOR}\\s*$`, 'g');

/**
 * Layout callbacks concatenate raw properties (`monster.attack + " - " +
 * monster.range`), so a creature lacking one of them would print "undefined".
 * Drops such values together with the separators left dangling around them;
 * text without any is returned untouched.
 */
export function tidyCallbackText(text: string): string {
  const cleaned = text.replace(MISSING_VALUE, '');
  if (cleaned === text) return text;
  return cleaned.replace(REPEATED_SEPARATORS, '$1').replace(DANGLING_SEPARATORS, '').trim();
}

/**
 * Display label for a property line. Layouts are inconsistent about trailing
 * colons ("Difficulty:" next to "Thresholds"); the renderer owns the separator.
 */
export function trimLabel(label: string): string {
  return label.replace(/:\s*$/, '');
}
