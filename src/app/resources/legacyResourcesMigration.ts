import { BUILT_IN_SYSTEM_PRESETS } from '../gameSystems/builtInPresets';
import type { CollectionSettings } from '../types/collectionSettingsTypes';
import { legacyCollectionResources } from './collectionResources';
import { STRESS_RESOURCE } from './resourceDefinitions';
import { sceneFromFile } from './resourceFileFormat';
import type { ResourceHolder } from './resourceTypes';

interface Collections {
  getCollections(): Promise<Array<{ id: string; settings?: CollectionSettings }>>;
  updateCollectionSettings(collectionId: string, settings: Partial<CollectionSettings>): Promise<void>;
}

/**
 * Whether a scene file shows the old secondary bar: the scene does not hide it and a token
 * has a value for it. Any collection could use the bar that way, without its default widget.
 */
export function sceneShowsSecondaryBar(content: string): boolean {
  try {
    const { state } = JSON.parse(content) as { state?: Parameters<typeof sceneFromFile>[0] };
    if (!state) return false;
    const scene = sceneFromFile(state);
    const hidden: { hiddenResources?: unknown } | undefined = scene.tokenSettings;
    if (Array.isArray(hidden?.hiddenResources) && hidden.hiddenResources.includes(STRESS_RESOURCE.key)) return false;
    const tokens: Record<string, ResourceHolder | null> = scene.objects?.tokens ?? {};
    return Object.values(tokens).some((token) => token?.resources?.[STRESS_RESOURCE.key] !== undefined);
  } catch {
    return false;
  }
}

/**
 * Stores the resources of every collection saved before resources existed, so they are
 * decided once, with the scenes as they were, and never derived again. Collections that
 * have their list (an empty one too) are left alone. A collection that cannot be read
 * keeps reading as its preset's; the others are stored, and the call fails, so whatever
 * builds on the stored lists waits for the next start.
 *
 * @param readScenes The content of the collection's scene files.
 */
export async function storeLegacyResources(assets: Collections, readScenes: (collectionId: string) => Promise<string[]>): Promise<void> {
  const failed: string[] = [];
  for (const { id, settings } of await assets.getCollections()) {
    if (settings?.resources) continue;
    try {
      // Its default widget already decides for the secondary bar: no scene needs reading
      const usedInScenes = settings?.defaultWidgets?.stressBar === true || (await readScenes(id)).some(sceneShowsSecondaryBar);
      await assets.updateCollectionSettings(id, { resources: legacyCollectionResources(settings ?? {}, BUILT_IN_SYSTEM_PRESETS, usedInScenes) });
    } catch (error) {
      console.error(`[Atlas] Could not store the resources of collection ${id}:`, error);
      failed.push(id);
    }
  }
  if (failed.length > 0) throw new Error(`The resources of ${failed.join(', ')} could not be stored`);
}
