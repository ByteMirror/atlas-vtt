import { TFile, type App } from 'obsidian';
import { GLOBAL_ASSETS_DIR } from './assetPaths';

/** Writes a token or map image into Atlas' shared assets folder under a unique name and returns its path. */
export async function writeAssetImage(app: App, name: string, data: ArrayBuffer): Promise<string> {
  if (!app.vault.getAbstractFileByPath(GLOBAL_ASSETS_DIR)) {
    await app.vault.createFolder(GLOBAL_ASSETS_DIR);
  }
  const safeName = name.replace(/[^a-zA-Z0-9]/g, '_');
  const suffix = `${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
  const path = `${GLOBAL_ASSETS_DIR}/${safeName}_${suffix}.webp`;
  await app.vault.createBinary(path, data);
  return path;
}

/** Trashes image files written for an asset that could not be saved; a file the trash refuses stays, unlinked. */
export async function discardAssetFiles(app: App, paths: readonly (string | undefined)[]): Promise<void> {
  for (const path of paths) {
    const file = path ? app.vault.getAbstractFileByPath(path) : null;
    if (!(file instanceof TFile)) continue;
    try { await app.fileManager.trashFile(file); } catch { /* Leave the unlinked copy. */ }
  }
}
