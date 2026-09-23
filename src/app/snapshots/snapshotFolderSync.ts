import type { App } from 'obsidian';
import { snapshotFolderFor } from './snapshotPaths';

/**
 * Moves a scene's snapshot folder after its map file was renamed or moved.
 * Nothing happens when the folder already moved along with a parent folder.
 */
export async function moveSceneSnapshots(app: App, oldMapPath: string, newMapPath: string): Promise<void> {
  const folder = app.vault.getFolderByPath(snapshotFolderFor(oldMapPath));
  const target = snapshotFolderFor(newMapPath);
  if (!folder || app.vault.getAbstractFileByPath(target)) return;
  await app.vault.rename(folder, target);
}

/** Moves a deleted scene's snapshots to the trash, so a new scene of the same name starts without them. */
export async function trashSceneSnapshots(app: App, mapPath: string): Promise<void> {
  const folder = app.vault.getFolderByPath(snapshotFolderFor(mapPath));
  if (folder) await app.fileManager.trashFile(folder);
}
