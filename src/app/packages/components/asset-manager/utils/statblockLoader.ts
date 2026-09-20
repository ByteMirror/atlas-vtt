import { App as ObsidianApp, TFile } from 'obsidian';
import { findCreatureForNotePath, layoutForCreature, resolveCreatureFromFence } from '../../../../services/FantasyStatblocksService';

import { resolveStatblockNote } from '../../../../services/statblockNoteSource';
import { getStatblockResources, getResourceUpdate } from '../../../../services/statblockResources';
import type { TokenResourceValue } from '../../../../types';

export interface StatblockOverrides {
  hope?: TokenResourceValue;
  statblockResources?: Record<string, TokenResourceValue>;
  name?: string;
  hp?: { current: number; max: number };
  stress?: number;
  maxStress?: number;
  difficulty?: string;
}

/** A non-empty challenge rating or tier as bestiaries store it, e.g. `5` or `"1/4"`. */
function isLabelValue(value: unknown): value is string | number {
  return typeof value === 'number' || (typeof value === 'string' && value !== '');
}

/**
 * Resolves token-relevant overrides (HP, difficulty, name) from the Fantasy
 * Statblocks creature backing a linked statblock note.
 */
export async function loadStatblockOverrides(
  app: ObsidianApp,
  statblockPath: string
): Promise<StatblockOverrides> {
  const overrides: StatblockOverrides = {};

  try {
    let creature = findCreatureForNotePath(statblockPath);
    if (!creature) {
      const file = app.vault.getAbstractFileByPath(statblockPath);
      const source = file instanceof TFile ? await resolveStatblockNote(app, file) : null;
      if (source?.kind === 'codeblock') creature = await resolveCreatureFromFence(app, source.params, statblockPath);
    }
    if (!creature) return overrides;

    const layout = layoutForCreature(app, creature) ?? { id: '', name: '', blocks: [] };
    for (const resource of getStatblockResources(creature, layout, {})) {
      Object.assign(overrides, getResourceUpdate(overrides, resource, resource.current));
    }

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
