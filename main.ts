import { Plugin } from 'obsidian';
// Tailwind first, so the custom SCSS can override it.
import './styles/index.css';
import './styles/main.scss';
import { AtlasView, ATLAS_VIEW_TYPE } from './src/app/atlas-view';
import { PlayerView, PLAYER_VIEW_TYPE } from './src/app/player-view';
import { DashboardView, DASHBOARD_VIEW_TYPE } from './src/app/dashboard-view';
import { initializeAtlasStorage } from './src/app/atlasStorageInit';
import { GlobalAssetManagerService } from './src/app/services/GlobalAssetManagerService';
import { GlobalMusicPlayerService } from './src/app/services/GlobalMusicPlayerService';
import { ImageDisplayService } from './src/app/services/ImageDisplayService';
import { ImageOptimizationService } from './src/app/services/ImageOptimizationService';
import { PlayerWindowService } from './src/app/services/PlayerWindowService';
import { ServiceManager } from './src/app/services/ServiceManager';
import { SettingsService } from './src/app/services/SettingsService';
import type { WidgetSyncService } from './src/app/services/WidgetSyncService';
import { AtlasSettingTab } from './src/app/settings/AtlasSettingTab';
import { EXTENSION_ATLASMAP, registerAtlasLeafSync } from './src/app/plugin/atlasLeaves';
import { registerColorSwatchIcons } from './src/app/plugin/colorSwatchIcons';
import { HeaderAutocompleteSuggest } from './src/app/plugin/HeaderAutocompleteSuggest';
import { registerCommands } from './src/app/plugin/registerCommands';
import { runStartupMigration } from './src/app/plugin/startupMigration';
import { registerStatusBarVisibility } from './src/app/plugin/statusBarVisibility';

export default class AtlasVTTPlugin extends Plugin {
  /** Read by each view's ServiceManager so all views share one settings instance. */
  public settingsService!: SettingsService;
  /** Created lazily by the first view's ServiceManager and shared by all views. */
  public widgetSyncService: WidgetSyncService | undefined;

  private globalAssetManager!: GlobalAssetManagerService;
  private globalMusicPlayer!: GlobalMusicPlayerService;
  private imageDisplayService!: ImageDisplayService;

  async onload(): Promise<void> {
    // Views first, so workspace restore can resolve persisted Atlas tabs
    // before the slower startup path finishes.
    this.registerAtlasViews();

    await initializeAtlasStorage(this.app);
    await runStartupMigration(this.app);

    this.settingsService = new SettingsService(this.app);
    await this.settingsService.initialize();

    this.globalAssetManager = new GlobalAssetManagerService(this.app);
    this.globalMusicPlayer = new GlobalMusicPlayerService(this.app);
    this.imageDisplayService = new ImageDisplayService(this.app);

    this.addSettingTab(new AtlasSettingTab(this.app, this, this.settingsService));
    this.registerEditorSuggest(new HeaderAutocompleteSuggest(this.app));
    registerAtlasLeafSync(this);
    registerCommands(this, {
      imageDisplay: this.imageDisplayService,
      assetManager: this.globalAssetManager,
      musicPlayer: this.globalMusicPlayer,
      imageOptimization: new ImageOptimizationService(this.app),
    });

    this.app.workspace.onLayoutReady(() => {
      registerColorSwatchIcons();
      this.imageDisplayService.registerContextMenu();
      registerStatusBarVisibility(this);
    });
  }

  onunload(): void {
    void this.settingsService?.saveSettingsNow();
    this.widgetSyncService?.destroy();
    this.widgetSyncService = undefined;

    this.globalMusicPlayer?.destroy();
    try {
      ServiceManager.destroyAllAudio();
    } catch (error) {
      console.error('[Atlas] Error cleaning up audio services:', error);
    }
    this.imageDisplayService?.destroy();
    PlayerWindowService.getInstance()?.destroy();
    this.globalAssetManager?.close();
  }

  private registerAtlasViews(): void {
    this.registerExtensions([EXTENSION_ATLASMAP], ATLAS_VIEW_TYPE);
    this.registerView(ATLAS_VIEW_TYPE, (leaf) => new AtlasView(leaf, this));
    this.registerView(PLAYER_VIEW_TYPE, (leaf) => new PlayerView(leaf, this));
    this.registerView(DASHBOARD_VIEW_TYPE, (leaf) => new DashboardView(leaf, this));
  }
}
