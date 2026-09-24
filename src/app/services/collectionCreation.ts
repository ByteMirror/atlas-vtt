import type { App } from 'obsidian';
import { rulesOfPreset } from '../gameSystems/systemRules';
import type { SystemPreset } from '../types/systemPresetTypes';
import { AssetService, type CollectionMetadata } from './AssetService';
import { syncCollectionSystem } from './collectionSystemSync';

/**
 * Creates a collection that plays `preset`'s game system: its measurement,
 * conditions and resource bars, and the widgets it adds (e.g. Shadowdark's
 * torch timer). Without a preset the collection starts with no game system.
 */
export async function createCollectionWithSystem(
  app: App,
  name: string,
  preset: SystemPreset | undefined,
  presets: readonly SystemPreset[],
): Promise<CollectionMetadata> {
  const assets = AssetService.getInstance(app);
  const collection = await assets.createCollection(name);
  if (!preset) return collection;
  await assets.updateCollectionSettings(collection.id, { ...rulesOfPreset(preset), systemPresetId: preset.id });
  await syncCollectionSystem(app, collection.id, presets);
  return collection;
}
