import type { App as ObsidianApp } from 'obsidian';
import { resolveLinkedCreature } from '../../../../creatures/linkedCreature';
import type { ResourceDefinition, ResourceValue } from '../../../../resources/resourceTypes';
import { startingResources } from '../../../../resources/statblockResourceValues';

export interface StatblockOverrides {
  name?: string;
  difficulty?: string;
  /** Starting values of the collection's resources the statblock has a field for. */
  resources?: Record<string, ResourceValue>;
}

/** A non-empty challenge rating or tier as bestiaries store it, e.g. `5` or `"1/4"`. */
function isLabelValue(value: unknown): value is string | number {
  return typeof value === 'number' || (typeof value === 'string' && value !== '');
}

/**
 * Resolves what a token takes from the Fantasy Statblocks creature backing a
 * linked statblock note: its name, difficulty and the starting values of the
 * collection's resources.
 */
export async function loadStatblockOverrides(
  app: ObsidianApp,
  statblockPath: string,
  definitions: readonly ResourceDefinition[],
): Promise<StatblockOverrides> {
  const overrides: StatblockOverrides = {};

  try {
    const creature = await resolveLinkedCreature(app, statblockPath);
    if (!creature) return overrides;

    const resources = startingResources(creature, definitions);
    if (Object.keys(resources).length > 0) overrides.resources = resources;

    if (isLabelValue(creature.cr)) {
      overrides.difficulty = `CR ${creature.cr}`;
    } else if (isLabelValue(creature.tier)) {
      overrides.difficulty = `T${creature.tier}`;
    }

    if (creature.name) {
      overrides.name = creature.name;
    }
  } catch (error) {
    console.error('[statblockLoader] Failed to load statblock data:', error);
  }

  return overrides;
}
