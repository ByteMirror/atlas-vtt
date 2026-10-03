/**
 * Reads the token-relevant values out of a statblock note's frontmatter.
 * Frontmatter is user-authored YAML, so every value is validated here once.
 */

import type { ResourceDefinition, ResourceHolder } from '../../resources/resourceTypes';
import { startingResources } from '../../resources/statblockResourceValues';
import type { FrontMatterCache } from 'obsidian';
import type { Character } from '../../types';

export interface StatblockVitals {
  name?: string;
  difficulty?: string;
}

/**
 * Fields a token takes over when it is first linked to a statblock. Display
 * preferences such as `showNameplate` belong to the user and are not touched.
 */
export type StatblockLinkUpdates =
  Partial<Pick<Character, 'name' | 'difficulty' | 'resources'>>;

/** Clears every statblock-derived field when a token is unlinked; user preferences stay. */
export const STATBLOCK_UNLINK_UPDATES = {
  statblockPath: undefined,
  name: undefined,
  statblockName: undefined,
  resources: undefined,
  overriddenMax: undefined,
  difficulty: undefined,
} as const;

export function readStatblockVitals(frontmatter: FrontMatterCache): StatblockVitals {
  const source: Record<string, unknown> = frontmatter;
  const vitals: StatblockVitals = {};

  if (typeof source.name === 'string' && source.name) {
    vitals.name = source.name;
  }

  if (typeof source.difficulty === 'string') {
    vitals.difficulty = source.difficulty;
  } else if (typeof source.difficulty === 'number') {
    vitals.difficulty = String(source.difficulty);
  }

  return vitals;
}

/**
 * A freshly linked token starts every resource its statblock supplies. What it holds of
 * the others (`held`: hand-set hit points, the DM screen's quantities) stays.
 */
export function buildStatblockLinkUpdates(
  frontmatter: FrontMatterCache,
  currentName: string | undefined,
  definitions: readonly ResourceDefinition[],
  held: ResourceHolder['resources'],
): StatblockLinkUpdates {
  const vitals = readStatblockVitals(frontmatter);
  const updates: StatblockLinkUpdates = { resources: { ...held, ...startingResources(frontmatter, definitions) } };

  const name = vitals.name || currentName;
  if (name !== undefined) {
    updates.name = name;
  }

  if (vitals.difficulty !== undefined) {
    updates.difficulty = vitals.difficulty;
  }

  return updates;
}
