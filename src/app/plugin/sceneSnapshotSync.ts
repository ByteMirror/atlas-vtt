import { TFile, type Plugin } from 'obsidian';
import { EXTENSION_ATLASMAP } from './atlasLeaves';
import { moveSceneSnapshots, trashSceneSnapshots } from '../snapshots/snapshotFolderSync';
import { runInBackground } from '../utils/backgroundTask';

/** Keeps each scene's snapshot folder next to its map file when the map is renamed, moved or deleted. */
export function registerSceneSnapshotSync(plugin: Plugin): void {
  const { app } = plugin;

  plugin.registerEvent(
    app.vault.on('rename', (file, oldPath) => {
      if (!(file instanceof TFile) || file.extension !== EXTENSION_ATLASMAP) return;
      runInBackground(moveSceneSnapshots(app, oldPath, file.path), 'Moving scene snapshots');
    })
  );

  plugin.registerEvent(
    app.vault.on('delete', (file) => {
      if (!(file instanceof TFile) || file.extension !== EXTENSION_ATLASMAP) return;
      runInBackground(trashSceneSnapshots(app, file.path), 'Trashing scene snapshots');
    })
  );
}
