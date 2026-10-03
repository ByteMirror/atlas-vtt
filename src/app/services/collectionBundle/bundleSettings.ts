import { BUILT_IN_SYSTEM_PRESETS } from '../../gameSystems/builtInPresets';
import { legacyCollectionResources } from '../../resources/collectionResources';
import { sameResourceDefinitions } from '../../resources/resourceDefinitions';
import type { CollectionSettings } from '../../types/collectionSettingsTypes';

/**
 * A collection's settings as bundles compare them. Resources that only restate what the
 * settings read as before resources were stored are left out: Atlas stores them by itself
 * (`storeLegacyResources`), which is no edit of the GM's. Nor is what players see.
 */
export function comparableSettings(settings: CollectionSettings | undefined): CollectionSettings | Omit<CollectionSettings, 'resources'> | undefined {
  if (!settings?.resources) return settings;
  const { resources, ...rest } = settings;
  return sameResourceDefinitions(resources, legacyCollectionResources(rest, BUILT_IN_SYSTEM_PRESETS)) ? rest : settings;
}

/** `settings` with each loot base at the path `pathOf` gives it; a base without one is left out. */
export function withLootBases(settings: CollectionSettings, pathOf: (path: string) => string | undefined): CollectionSettings {
  const { lootBases } = settings;
  return lootBases ? { ...settings, lootBases: lootBases.flatMap((path) => pathOf(path) ?? []) } : settings;
}

/** The settings an import takes from a bundle. One written by an older Atlas names no resources: the vault keeps its own. */
export function settingsFromBundle(theirs: CollectionSettings, mine: CollectionSettings | undefined): CollectionSettings {
  return theirs.resources || !mine?.resources ? theirs : { ...theirs, resources: mine.resources };
}
