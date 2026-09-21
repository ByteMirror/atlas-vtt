/**
 * Reads the token-relevant values out of a statblock note's frontmatter.
 * Frontmatter is user-authored YAML, so every value is validated here once.
 */

import type { FrontMatterCache } from 'obsidian';
import type { Character } from '../../types';

export interface StatblockVitals {
  /** Raw `hp` values; a plain number in the frontmatter fills both. */
  hp?: { current?: number; max?: number };
  name?: string;
  maxStress?: number;
  difficulty?: string;
}

/** Fields a token takes over when it is first linked to a statblock. */
export type StatblockLinkUpdates =
  Partial<Pick<Character, 'name' | 'hp' | 'stress' | 'maxStress' | 'difficulty'>> & { showNameplate: true };

function finiteNumber(value: unknown): number | undefined {
  return typeof value === 'number' && Number.isFinite(value) ? value : undefined;
}

export function readStatblockVitals(frontmatter: FrontMatterCache): StatblockVitals {
  const source: Record<string, unknown> = frontmatter;
  const vitals: StatblockVitals = {};

  const hp = source.hp;
  if (typeof hp === 'number') {
    vitals.hp = { current: hp, max: hp };
  } else if (typeof hp === 'object' && hp !== null) {
    const record: Record<string, unknown> = { ...hp };
    const current = finiteNumber(record.current);
    const max = finiteNumber(record.max);
    vitals.hp = {
      ...(current !== undefined && { current }),
      ...(max !== undefined && { max }),
    };
  }

  if (typeof source.name === 'string' && source.name) {
    vitals.name = source.name;
  }

  const maxStress = finiteNumber(source.stress);
  if (maxStress !== undefined) {
    vitals.maxStress = maxStress;
  }

  if (typeof source.difficulty === 'string') {
    vitals.difficulty = source.difficulty;
  } else if (typeof source.difficulty === 'number') {
    vitals.difficulty = String(source.difficulty);
  }

  return vitals;
}

/** A freshly linked token starts at full health and zero stress. */
export function buildStatblockLinkUpdates(
  frontmatter: FrontMatterCache,
  currentName: string | undefined
): StatblockLinkUpdates {
  const vitals = readStatblockVitals(frontmatter);
  const updates: StatblockLinkUpdates = { showNameplate: true };

  if (vitals.hp) {
    updates.hp = {
      current: vitals.hp.current || vitals.hp.max || 0,
      max: vitals.hp.max || vitals.hp.current || 0,
    };
  }

  const name = vitals.name || currentName;
  if (name !== undefined) {
    updates.name = name;
  }

  if (vitals.maxStress !== undefined) {
    updates.stress = 0;
    updates.maxStress = vitals.maxStress;
  }

  if (vitals.difficulty !== undefined) {
    updates.difficulty = vitals.difficulty;
  }

  return updates;
}
