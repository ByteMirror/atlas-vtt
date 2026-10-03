import type { App } from 'obsidian';
import { vanillaSystemSettings } from '../gameSystems/systemRules';
import { AssetService } from './AssetService';
import { syncCollectionSystem } from './collectionSystemSync';
import type { SystemPresetService } from './SystemPresetService';

/**
 * Deletes a user preset. Every collection that used it goes back to having no
 * game system (default measurement, no conditions, no default widgets), and
 * loses the preset's conditions on its tokens, the widgets the preset added
 * and the resource bars it turned on.
 * Returns the ids of those collections.
 */
export async function deleteSystemPreset(app: App, presets: SystemPresetService, presetId: string): Promise<string[]> {
  // Still lists the deleted preset, so its widgets are recognised and removed.
  const known = presets.list();
  presets.delete(presetId);
  const assets = AssetService.getInstance(app);
  const affected = (await assets.getCollections())
    .filter((collection) => collection.settings?.systemPresetId === presetId);

  for (const collection of affected) {
    const vanilla = vanillaSystemSettings();
    await assets.updateCollectionSettings(collection.id, vanilla);
    await syncCollectionSystem(app, collection.id, known);
  }
  return affected.map((collection) => collection.id);
}
