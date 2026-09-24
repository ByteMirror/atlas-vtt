import type { App, TFile } from 'obsidian';
import { AtlasView, ATLAS_VIEW_TYPE } from '../atlas-view';
import { AssetService } from './AssetService';

/** The game master's open map views; the player view only mirrors them. */
export function openMapViews(app: App): AtlasView[] {
  return app.workspace.getLeavesOfType(ATLAS_VIEW_TYPE)
    .map((leaf) => leaf.view)
    .filter((view): view is AtlasView => view instanceof AtlasView && !view.getStore().getState().isPlayerView);
}

/** The map files of the collection's scenes. */
export function collectionMapFiles(app: App, collectionId: string): TFile[] {
  const assets = AssetService.getInstance(app);
  return app.vault.getFiles()
    .filter((file) => file.extension === 'atlasmap' && assets.getCollectionForMap(file.path) === collectionId);
}

interface SceneUpdate {
  /** Changes an open map in its store; the view then saves it. */
  updateOpen: (view: AtlasView) => void;
  /** New content for a closed map file, or null when it does not change. */
  rewrite: (content: string) => string | null;
}

/**
 * Applies `update` to every scene of the collection: in the store of an open
 * map, which then saves itself, or in the map file. Returns the map files, so
 * callers can also update what lives beside them (e.g. scene snapshots).
 */
export async function updateCollectionScenes(app: App, collectionId: string, update: SceneUpdate): Promise<TFile[]> {
  const views = openMapViews(app);
  const files = collectionMapFiles(app, collectionId);
  for (const file of files) {
    try {
      const view = views.find((v) => v.file?.path === file.path);
      if (view) {
        update.updateOpen(view);
        await view.saveMap();
      } else if (update.rewrite(await app.vault.read(file)) !== null) {
        await app.vault.process(file, (latest) => update.rewrite(latest) ?? latest);
      }
    } catch (error) {
      console.error(`[Atlas] Could not update scene ${file.path}:`, error);
    }
  }
  return files;
}
