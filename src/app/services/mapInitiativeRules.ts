import type { App } from 'obsidian';
import { DEFAULT_INITIATIVE_RULES, collectionInitiativeRules } from '../gameSystems/initiativeRules';
import type { InitiativeRules } from '../types/initiativeRulesTypes';
import { mapCollectionSettings, systemPresetsOf } from './mapCollectionRules';

/** Initiative rules of the collection that holds the map; the default rules without one. */
export function mapInitiativeRules(app: App, mapPath: string | null | undefined): InitiativeRules {
  const settings = mapCollectionSettings(app, mapPath);
  return settings ? collectionInitiativeRules(settings, systemPresetsOf(app)) : { ...DEFAULT_INITIATIVE_RULES };
}
