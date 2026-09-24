import { App, Plugin, TFile, WorkspaceLeaf } from 'obsidian';
import { AtlasView, ATLAS_VIEW_TYPE } from '../atlas-view';
import { FileReferenceService } from '../services/FileReferenceService';

export const EXTENSION_ATLASMAP = 'atlasmap';

function getExistingAtlasLeaf(app: App): WorkspaceLeaf | null {
  return app.workspace.getLeavesOfType(ATLAS_VIEW_TYPE)[0] ?? null;
}

/** The loaded Atlas view, or null when none is open (or it is still deferred). */
export function getLoadedAtlasView(app: App): AtlasView | null {
  const view = getExistingAtlasLeaf(app)?.view;
  return view instanceof AtlasView ? view : null;
}

/**
 * Opens a map in the Atlas view. Only one Atlas leaf exists at a time, so an
 * already open view receives the map as a scene tab instead of a new leaf.
 */
export async function openMapInView(app: App, mapFile: TFile): Promise<void> {
  const existingLeaf = getExistingAtlasLeaf(app);

  if (existingLeaf) {
    await app.workspace.revealLeaf(existingLeaf);
    const atlasView = existingLeaf.view;
    if (!(atlasView instanceof AtlasView)) return;

    const existingTab = atlasView.tabMetaStore.getState().getTabByFilePath(mapFile.path);
    if (existingTab) {
      await atlasView.switchToTab(existingTab.id);
    } else {
      await atlasView.onLoadFile(mapFile);
    }
    return;
  }

  let leaf = app.workspace.getMostRecentLeaf();
  if (!leaf || leaf.getViewState().pinned) {
    leaf = app.workspace.getLeaf('tab');
  }

  await leaf.loadIfDeferred();
  await leaf.setViewState({ type: ATLAS_VIEW_TYPE, state: { file: mapFile.path } });
  await app.workspace.revealLeaf(leaf);
}

/**
 * Folds duplicate Atlas leaves (e.g. from drag-to-split) into the first one,
 * re-opening their maps there as scene tabs.
 */
function mergeDuplicateAtlasLeaves(app: App): void {
  const [primaryLeaf, ...extraLeaves] = app.workspace.getLeavesOfType(ATLAS_VIEW_TYPE);
  if (!primaryLeaf || extraLeaves.length === 0) return;

  for (const extraLeaf of extraLeaves) {
    const extraView = extraLeaf.view;
    const file = extraView instanceof AtlasView ? extraView.file : null;
    extraLeaf.detach();

    if (file && primaryLeaf.view instanceof AtlasView) {
      void primaryLeaf.view.onLoadFile(file);
    }
  }
  void app.workspace.revealLeaf(primaryLeaf);
}

/** Keeps the single Atlas view and its scene tabs consistent with the vault. */
export function registerAtlasLeafSync(plugin: Plugin): void {
  const { app } = plugin;
  const fileReferences = new FileReferenceService(app);

  plugin.registerEvent(
    app.workspace.on('layout-change', () => mergeDuplicateAtlasLeaves(app))
  );

  plugin.registerEvent(
    app.vault.on('rename', async (file, oldPath) => {
      if (!(file instanceof TFile)) return;
      // The open map first, so its next autosave cannot write the old paths back.
      getLoadedAtlasView(app)?.handleFileRenamed(oldPath, file.path, file.basename);
      await fileReferences.handleFileRenamed(oldPath, file.path);
    })
  );

  plugin.registerEvent(
    app.vault.on('delete', (file) => {
      if (!(file instanceof TFile) || file.extension !== EXTENSION_ATLASMAP) return;
      const atlasView = getLoadedAtlasView(app);
      const tab = atlasView?.tabMetaStore.getState().getTabByFilePath(file.path);
      if (atlasView && tab) {
        void atlasView.closeTab(tab.id);
      }
    })
  );
}
