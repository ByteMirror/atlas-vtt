import { TokenCreatorModal } from '../packages/components/asset-manager/token-creator/TokenCreatorModal';
import { Notice, Plugin, TFile } from 'obsidian';
import { AtlasView } from '../atlas-view';
import { DASHBOARD_VIEW_TYPE } from '../dashboard-view';
import type { GlobalAssetManagerService } from '../services/GlobalAssetManagerService';
import type { ImageDisplayService } from '../services/ImageDisplayService';
import { presentActiveTabInPlayerWindow } from '../services/PlayerWindowPresenter';
import { hasBestiaryFrontmatter } from '../services/statblockNoteSource';
import { TokenStatblockLinkService } from '../services/TokenStatblockLinkService';
import { cleanupMissingAssets } from './cleanupMissingAssets';

export interface CommandDependencies {
  imageDisplay: ImageDisplayService;
  assetManager: GlobalAssetManagerService;
}

const IMAGE_EXTENSIONS = ['png', 'jpg', 'jpeg', 'gif', 'bmp', 'svg', 'webp'];

function isImageFile(file: TFile): boolean {
  return IMAGE_EXTENSIONS.includes(file.extension.toLowerCase());
}

async function openDashboard(plugin: Plugin): Promise<void> {
  try {
    const leaf = plugin.app.workspace.getLeaf(true);
    await leaf.setViewState({ type: DASHBOARD_VIEW_TYPE, state: {} });
    plugin.app.workspace.setActiveLeaf(leaf);
  } catch (error) {
    console.error('[Atlas] Error opening dashboard:', error);
    new Notice('Error opening the dashboard');
  }
}

function registerPlayerViewCommands(plugin: Plugin, imageDisplay: ImageDisplayService): void {
  const { workspace } = plugin.app;

  plugin.addCommand({
    id: 'display-image-on-player-view',
    name: 'Display image on player view',
    checkCallback: (checking) => {
      const file = workspace.getActiveFile();
      if (!file || !isImageFile(file)) return false;
      if (!checking) void imageDisplay.displayImageOnPlayerView(file);
      return true;
    },
  });

  plugin.addCommand({
    id: 'dismiss-image-from-player-view',
    name: 'Dismiss image from player view',
    checkCallback: (checking) => {
      if (!imageDisplay.isImageDisplayed()) return false;
      if (!checking) imageDisplay.closeImageDisplay();
      return true;
    },
  });

  plugin.addCommand({
    id: 'send-map-to-player-view',
    name: 'Send current map to player view',
    callback: () => void presentActiveTabInPlayerWindow(plugin.app),
  });

  plugin.addRibbonIcon('monitor', 'Display image on player view', () => {
    const file = workspace.getActiveFile();
    if (file && isImageFile(file)) {
      void imageDisplay.displayImageOnPlayerView(file);
    } else {
      new Notice('Please open an image file first');
    }
  });
}

function registerMapCommands(plugin: Plugin, deps: CommandDependencies): void {
  const { app } = plugin;

  plugin.addCommand({
    id: 'open-dashboard',
    name: 'Open dashboard',
    callback: () => void openDashboard(plugin),
  });

  plugin.addCommand({
    id: 'open-scene-browser',
    name: 'Open scene browser',
    callback: () => deps.assetManager.open('scenes'),
  });

  plugin.addCommand({
    id: 'toggle-initiative-tracker',
    name: 'Toggle initiative tracker',
    checkCallback: (checking) => {
      const view = app.workspace.getActiveViewOfType(AtlasView);
      if (!view) return false;
      if (!checking) {
        const state = view.getStore().getState();
        state.setInitiativeTrackerOpen(!state.initiativeTrackerOpen);
      }
      return true;
    },
  });

  plugin.addCommand({
    id: 'toggle-dice-log',
    name: 'Toggle dice log',
    checkCallback: (checking) => {
      const view = app.workspace.getActiveViewOfType(AtlasView);
      if (!view) return false;
      if (!checking) {
        const state = view.getStore().getState();
        state.setDiceLogOpen(!state.isDiceLogOpen);
      }
      return true;
    },
  });

  plugin.addCommand({
    id: 'clean-up-missing-assets',
    name: 'Clean up missing assets in current map',
    checkCallback: (checking) => {
      const view = app.workspace.getActiveViewOfType(AtlasView);
      if (!view) return false;
      if (!checking) void cleanupMissingAssets(app, view);
      return true;
    },
  });
}

function registerStatblockCommands(plugin: Plugin): void {
  const { app } = plugin;

  plugin.addCommand({
    id: 'import-statblock-tokens',
    name: 'Import tokens from Fantasy Statblocks',
    callback: () => new TokenCreatorModal(app).open(),
  });

  plugin.addCommand({
    id: 'create-token-from-statblock',
    name: 'Create token from statblock image',
    checkCallback: (checking) => {
      const file = app.workspace.getActiveFile();
      if (!file || !hasBestiaryFrontmatter(app, file)) return false;
      if (!checking) {
        void TokenStatblockLinkService.getInstance(app).createTokenFromStatblockImage(file.path);
      }
      return true;
    },
  });
}

export function registerCommands(plugin: Plugin, deps: CommandDependencies): void {
  registerPlayerViewCommands(plugin, deps.imageDisplay);
  registerMapCommands(plugin, deps);
  registerStatblockCommands(plugin);
}
