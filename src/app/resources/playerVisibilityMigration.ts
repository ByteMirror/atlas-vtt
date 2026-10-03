import type { CollectionSettings } from '../types/collectionSettingsTypes';
import { collectionResources } from './collectionResources';
import type { ResourceDefinition } from './resourceTypes';

/** The player-window switches that showed HP and the secondary bar before resources decided it themselves. */
export interface LegacyPlayerBars {
  hp: boolean;
  stress: boolean;
}

/** `definitions` with HP and Stress shown to players where the old switches showed them. */
export function withPlayerVisibility(definitions: readonly ResourceDefinition[], legacy: LegacyPlayerBars): ResourceDefinition[] {
  return definitions.map((definition) => {
    const shown = (definition.key === 'hp' && legacy.hp) || (definition.key === 'stress' && legacy.stress);
    return shown ? { ...definition, visibleToPlayers: true } : definition;
  });
}

interface LegacySwitches {
  legacyPlayerBars(): LegacyPlayerBars | null;
  clearLegacyPlayerBars(): void;
}

interface Collections {
  getCollections(): Promise<Array<{ id: string; settings?: CollectionSettings }>>;
  updateCollectionSettings(collectionId: string, settings: Partial<CollectionSettings>): Promise<void>;
}

/**
 * Carries the old player-window switches into the collections, once: every
 * collection whose HP or Stress the switches showed to players gets that
 * resource marked visible to players. The switches are removed once every
 * collection is saved.
 */
export async function migratePlayerResourceVisibility(settings: LegacySwitches, assets: Collections): Promise<void> {
  const legacy = settings.legacyPlayerBars();
  if (!legacy) return;
  if (legacy.hp || legacy.stress) await showToPlayers(assets, legacy);
  // Only now: a failed save leaves the switches for the next start.
  settings.clearLegacyPlayerBars();
}

async function showToPlayers(assets: Collections, legacy: LegacyPlayerBars): Promise<void> {
  for (const collection of await assets.getCollections()) {
    const current = collectionResources(collection.settings ?? { conditions: [] });
    const resources = withPlayerVisibility(current, legacy);
    if (resources.some((definition, index) => definition !== current[index])) {
      await assets.updateCollectionSettings(collection.id, { resources });
    }
  }
}
