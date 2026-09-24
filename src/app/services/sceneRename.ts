import { Notice, normalizePath, type App } from 'obsidian';
import type { AssetService } from './AssetService';
import { getLoadedAtlasView } from '../plugin/atlasLeaves';

/** Characters Obsidian rejects in file names or that break links to them. */
const INVALID_NAME = /[\\/:*?"<>|#^[\]]/;

/**
 * Renames a scene and the .atlasmap file behind it, because the tab bar, pins
 * and links all identify a scene by its file. Returns whether it was renamed.
 * The vault rename event carries the new path to tabs, pins and thumbnails.
 */
export async function renameScene(app: App, assetService: AssetService, sceneId: string, requestedName: string): Promise<boolean> {
  const name = requestedName.trim();
  const scene = await assetService.getAssetById(sceneId);
  if (!name || scene?.type !== 'scene') return false;
  if (INVALID_NAME.test(name)) {
    new Notice('Scene names cannot contain \\ / : * ? " < > | # ^ [ or ]');
    return false;
  }

  const mapFile = scene.data?.mapPath ? app.vault.getFileByPath(scene.data.mapPath) : null;
  if (!mapFile) {
    await assetService.updateAsset(sceneId, { name });
    return true;
  }

  const folder = mapFile.path.slice(0, mapFile.path.lastIndexOf('/') + 1);
  const mapPath = normalizePath(`${folder}${name}.${mapFile.extension}`);
  if (mapPath !== mapFile.path) {
    if (app.vault.getAbstractFileByPath(mapPath)) {
      new Notice(`A scene named "${name}" already exists`);
      return false;
    }
    // Write pending changes to the old file first; afterwards they would recreate it.
    const view = getLoadedAtlasView(app);
    if (view?.getTabMetaStore().getState().getTabByFilePath(mapFile.path)) await view.saveMap();
    await app.fileManager.renameFile(mapFile, mapPath);
  }

  await assetService.updateAsset(sceneId, { name, data: { ...scene.data, mapPath } });
  return true;
}
