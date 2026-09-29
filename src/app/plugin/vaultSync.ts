import { debounce, TFile, TFolder, type App, type Plugin } from 'obsidian';
import { ATLAS_VTT_DIR, AssetService, type VaultReconciliation } from '../services/AssetService';
import { FileReferenceService } from '../services/FileReferenceService';
import { MapThumbnailService } from '../services/MapThumbnailService';
import type { PathMove } from '../services/renamedPaths';
import { stemOf } from '../services/vault-sync/recoveredIds';
import { moveSceneSnapshots, trashSceneSnapshots } from '../snapshots/snapshotFolderSync';
import { runInBackground } from '../utils/backgroundTask';
import { EXTENSION_ATLASMAP, isScenePath } from '../utils/sceneFiles';
import { closeMapTab, getLoadedAtlasView } from './atlasLeaves';

/**
 * How long the vault has to stay quiet before Atlas checks its index against
 * it. A rename outside Obsidian arrives as a deletion and a creation, often
 * of many files; the check has to see both halves to recognise the move.
 */
const SETTLE_MS = 1000;

/** The files of moved folders, each with the path it had before. */
function filesOfMovedFolders(app: App, folderMoves: readonly PathMove[]): PathMove[] {
  return folderMoves.flatMap(({ from, to }) => app.vault.getFiles()
    .filter((file) => file.path.startsWith(`${to}/`))
    .map((file) => ({ from: from + file.path.slice(to.length), to: file.path })));
}

/**
 * Keeps Atlas in line with the vault, whether a change came from Atlas, from
 * Obsidian's file explorer or from outside Obsidian (file manager, sync, git).
 * Renames Obsidian reports are followed at once. Everything else, and every
 * rename as a safety net, leads to a check of the index against the vault once
 * the vault is quiet, which also recognises moves made outside Obsidian.
 */
export function registerVaultSync(plugin: Plugin): void {
  const { app } = plugin;
  const assets = AssetService.getInstance(app);
  const fileReferences = new FileReferenceService(app);
  const sceneThumbnails = new MapThumbnailService(app);

  /** Moves that reach the rest of the vault's references; one pass for every file of a renamed folder. */
  let pendingMoves: PathMove[] = [];
  const propagateMoves = async (moves: readonly PathMove[]): Promise<void> => {
    await fileReferences.handleFilesMoved(moves);
    for (const { from, to } of moves) {
      if (isScenePath(from) && isScenePath(to)) await moveSceneSnapshots(app, from, to);
    }
  };
  const flushMoves = (): void => {
    const moves = pendingMoves;
    pendingMoves = [];
    runInBackground(propagateMoves(moves), 'Updating references to moved files');
  };

  // Files deleted since the last check; a deleted map's snapshots and thumbnail wait for it, since the map may have only moved.
  const deleted = new Set<string>();
  const deletedMaps = new Set<string>();
  const check = async (): Promise<void> => {
    const seen = new Set(deleted);
    const maps = [...deletedMaps];
    deleted.clear();
    deletedMaps.clear();
    await assets.initialize();
    const result = await assets.reconcileWithVault(seen);
    const moved = new Set([...result.fileMoves, ...filesOfMovedFolders(app, result.folderMoves)].map(({ from }) => from));
    for (const map of maps) {
      if (moved.has(map) || app.vault.getFileByPath(map)) continue;
      await trashSceneSnapshots(app, map);
      await sceneThumbnails.trashThumbnail(map);
    }
  };
  const scheduleCheck = debounce(() => runInBackground(check(), 'Checking Atlas files against the vault'), SETTLE_MS, true);
  plugin.register(() => scheduleCheck.cancel());

  /** Moves the check found reach the open map and every stored reference, like renames Obsidian reports. */
  const followReconciliation = async (result: VaultReconciliation): Promise<void> => {
    const moves = [...result.fileMoves, ...filesOfMovedFolders(app, result.folderMoves)];
    const view = getLoadedAtlasView(app);
    for (const { from, to } of moves) view?.handleFileRenamed(from, to, stemOf(to));
    if (moves.length > 0) await propagateMoves(moves);
    app.workspace.trigger('atlas-vtt:refresh-assets');
  };
  plugin.register(assets.onReconciled((result) => runInBackground(followReconciliation(result), 'Following files moved outside Atlas')));

  plugin.registerEvent(
    app.vault.on('rename', (file, oldPath) => {
      if (file instanceof TFolder) {
        runInBackground(fileReferences.handleFolderRenamed(oldPath, file.path), 'Following a renamed folder');
      } else if (file instanceof TFile) {
        // The open map first, so its next autosave cannot write the old paths back.
        getLoadedAtlasView(app)?.handleFileRenamed(oldPath, file.path, file.basename);
        // Obsidian reports every file of a renamed folder in the same task; one pass handles them all.
        if (pendingMoves.length === 0) queueMicrotask(flushMoves);
        pendingMoves.push({ from: oldPath, to: file.path });
      }
      scheduleCheck();
    })
  );

  plugin.registerEvent(
    app.vault.on('delete', (file) => {
      if (file instanceof TFile && file.extension === EXTENSION_ATLASMAP) {
        closeMapTab(app, file.path);
        deletedMaps.add(file.path);
      }
      deleted.add(file.path);
      scheduleCheck();
    })
  );

  // Obsidian reports every existing file as created while it loads the vault; only later creations are new.
  app.workspace.onLayoutReady(() => {
    // The first load checks the index against the vault, also when no map or asset manager opens.
    runInBackground(assets.initialize(), 'Checking Atlas files against the vault');
    plugin.registerEvent(
      app.vault.on('create', (file) => {
        if (file.path.startsWith(`${ATLAS_VTT_DIR}/`) || isScenePath(file.path)) scheduleCheck();
      })
    );
  });
}
