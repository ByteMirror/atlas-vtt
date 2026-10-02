/**
 * Ability scores as a 2024 ("5.5e") statblock presents them: each ability with
 * its score, its modifier and its saving throw.
 *
 * Fantasy Statblocks' 5.5e layout declares the scores as a bare `table` block
 * with neither headers nor a modifier formula, leaving the presentation to the
 * renderer — so Atlas builds the grid itself. Layouts that do name their headers
 * (the Basic 5e layout's single Str…Cha row) keep the plain table.
 */

import type { StatblockMonster } from './statblockTypes';

export const ABILITY_KEYS = ['str', 'dex', 'con', 'int', 'wis', 'cha'] as const;
export type AbilityKey = (typeof ABILITY_KEYS)[number];

/** Spelled-out names, used for the dice toast and for screen readers. */
export const ABILITY_NAMES: Record<AbilityKey, string> = {
  str: 'Strength',
  dex: 'Dexterity',
  con: 'Constitution',
  int: 'Intelligence',
  wis: 'Wisdom',
  cha: 'Charisma',
};

/** The grid reads scores from `stats`, or from the spelled-out properties. */
const ABILITY_PROPERTIES: Record<AbilityKey, string> = ABILITY_NAMES;

export interface AbilityScore {
  key: AbilityKey;
  /** `STR` */
  label: string;
  /** `Strength` */
  name: string;
  score: number;
  /** The creature's declared saving throw bonus, or null when it is not proficient. */
  save: number | null;
}

/** The 2024 block sets the three physical abilities beside the three mental ones. */
export const PHYSICAL_ABILITIES: readonly AbilityKey[] = ['str', 'dex', 'con'];
export const MENTAL_ABILITIES: readonly AbilityKey[] = ['int', 'wis', 'cha'];

function toScore(value: unknown): number | null {
  const score = typeof value === 'string' ? Number(value.trim()) : value;
  return typeof score === 'number' && Number.isFinite(score) ? score : null;
}

function toBonus(value: unknown): number | null {
  if (typeof value === 'number') return Number.isFinite(value) ? value : null;
  if (typeof value !== 'string') return null;
  const match = value.match(/[+-]?\d+/);
  return match ? Number(match[0]) : null;
}

/**
 * Saving throws as creatures record them, which is every shape frontmatter
 * allows: `"Dex +6, Wis +6"`, `[{ dexterity: 6 }, { wisdom: 6 }]`, or a single
 * object. Keys are matched on their first three letters, so both `dex` and
 * `dexterity` land on the same ability.
 */
export function parseSaves(raw: unknown): Partial<Record<AbilityKey, number>> {
  const saves: Partial<Record<AbilityKey, number>> = {};

  const isAbility = (key: string): key is AbilityKey =>
    (ABILITY_KEYS as readonly string[]).includes(key);

  const record = (key: string, value: unknown): void => {
    const ability = key.trim().slice(0, 3).toLowerCase();
    const bonus = toBonus(value);
    if (bonus !== null && isAbility(ability)) saves[ability] = bonus;
  };

  const readEntry = (entry: unknown): void => {
    if (entry == null) return;

    if (typeof entry === 'string') {
      // "Dex +6, Wis +6" — one ability and its bonus per comma-separated part.
      for (const part of entry.split(',')) {
        const match = part.trim().match(/([a-z]{3,})\s*([+-]?\d+)/i);
        if (match) record(match[1] as string, match[2]);
      }
      return;
    }

    if (Array.isArray(entry)) {
      entry.forEach(readEntry);
      return;
    }

    if (typeof entry === 'object') {
      for (const [key, value] of Object.entries(entry)) record(key, value);
    }
  };

  readEntry(raw);
  return saves;
}

/**
 * The creature's six ability scores, or null when it has none — a creature from
 * another game system, or one whose `stats` are not numbers.
 */
export function abilityScores(monster: StatblockMonster): AbilityScore[] | null {
  const stats = Array.isArray(monster.stats) ? monster.stats : null;
  const saves = { ...parseSaves(monster.saves), ...parseSaves(monster.save) };

  const scores = ABILITY_KEYS.map((key, index): AbilityScore | null => {
    const raw: unknown = stats && stats.length >= ABILITY_KEYS.length
      ? stats[index]
      : monster[key] ?? monster[ABILITY_PROPERTIES[key].toLowerCase()];
    const score = toScore(raw);
    if (score === null) return null;

    return {
      key,
      label: key.toUpperCase(),
      name: ABILITY_NAMES[key],
      score,
      save: saves[key] ?? null,
    };
  });

  return scores.every((score): score is AbilityScore => score !== null) ? scores : null;
}
