import type { App } from 'obsidian';
import { ensureHiddenFolder, removeEmptyHiddenFolders, trashHiddenPath } from '../utils/hiddenVaultFiles';
import { parentFolderOf, snapshotFolderFor } from './snapshotPaths';

/**
 * Moves a scene's snapshot folder after its map file was renamed or moved.
 * Nothing happens when the folder already moved along with a parent folder.
 */
export async function moveSceneSnapshots(app: App, oldMapPath: string, newMapPath: string): Promise<void> {
  const { adapter } = app.vault;
  const from = snapshotFolderFor(oldMapPath);
  const to = snapshotFolderFor(newMapPath);
  if (!(await adapter.exists(from)) || await adapter.exists(to)) return;

  await ensureHiddenFolder(app, parentFolderOf(to));
  await adapter.rename(from, to);
  await removeEmptyHiddenFolders(app, parentFolderOf(from), parentFolderOf(oldMapPath));
}

/** Moves a deleted scene's snapshots to the trash, so a new scene of the same name starts without them. */
export async function trashSceneSnapshots(app: App, mapPath: string): Promise<void> {
  const folder = snapshotFolderFor(mapPath);
  await trashHiddenPath(app, folder);
  await removeEmptyHiddenFolders(app, parentFolderOf(folder), parentFolderOf(mapPath));
}
