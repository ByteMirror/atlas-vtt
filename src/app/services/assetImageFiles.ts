import type { App } from 'obsidian';
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
