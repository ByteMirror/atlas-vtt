import { Plugin } from 'obsidian';
// Tailwind first, so the custom SCSS can override it.
import './styles/index.css';
import './styles/main.scss';
import { AtlasView, ATLAS_VIEW_TYPE } from './src/app/atlas-view';
import { LocalPlayerView, LOCAL_PLAYER_VIEW_TYPE } from './src/app/local-player-view';
import { PlayerView, PLAYER_VIEW_TYPE } from './src/app/player-view';
import { DashboardView, DASHBOARD_VIEW_TYPE } from './src/app/dashboard-view';
import { initializeAtlasStorage } from './src/app/atlasStorageInit';
import { GlobalAssetManagerService } from './src/app/services/GlobalAssetManagerService';
import { ImageDisplayService } from './src/app/services/ImageDisplayService';
import { PlayerWindowService } from './src/app/services/PlayerWindowService';
import { SettingsService } from './src/app/services/SettingsService';
import type { WidgetSyncService } from './src/app/services/WidgetSyncService';
import { AtlasSettingTab } from './src/app/settings/AtlasSettingTab';
import { changelogSettingsSection } from './src/app/settings/changelogSettingsSection';
import { hotkeySettingsSection, onboardingSettingsSection } from './src/app/settings/hotkeySettingsSection';
import { navigationSettingsSection } from './src/app/settings/navigationSettingsSection';
import { supportSettingsSection } from './src/app/settings/supportSettingsSection';
import { EXTENSION_ATLASMAP, registerAtlasLeafSync } from './src/app/plugin/atlasLeaves';
import { registerColorSwatchIcons } from './src/app/plugin/colorSwatchIcons';
import { HeaderAutocompleteSuggest } from './src/app/plugin/HeaderAutocompleteSuggest';
import { registerCommands } from './src/app/plugin/registerCommands';
import { registerPlayerWindowReloadCleanup } from './src/app/plugin/playerWindowReload';
import { registerSceneSnapshotSync } from './src/app/plugin/sceneSnapshotSync';
import { runStartupMigration } from './src/app/plugin/startupMigration';
import { registerStatusBarVisibility } from './src/app/plugin/statusBarVisibility';
import { ChangelogService } from './src/app/changelog/ChangelogService';
import { AtlasErrorLog } from './src/app/support/errorLog';
import { IssueReporter } from './src/app/support/IssueReporter';

declare const __ATLAS_RELEASE_BUILD__: boolean;

export default class AtlasVTTPlugin extends Plugin {
  /** Read by each view's ServiceManager so all views share one settings instance. */
  public settingsService!: SettingsService;
  /** Created lazily by the first view's ServiceManager and shared by all views. */
  public widgetSyncService: WidgetSyncService | undefined;

  /** Opened by each view for its scene browser. */
  public globalAssetManager!: GlobalAssetManagerService;
  private imageDisplayService!: ImageDisplayService;
  private changelogService: ChangelogService | undefined;

  async onload(): Promise<void> {
    // Record errors from the very start so startup problems can be reported too.
    const errorLog = new AtlasErrorLog();
    this.register(errorLog.attach());
    const issueReporter = new IssueReporter(this.app, this.manifest, errorLog);
    this.addCommand({ id: 'report-issue', name: 'Report an issue…', callback: () => issueReporter.open() });

    // Views first, so workspace restore can resolve persisted Atlas tabs
    // before the slower startup path finishes.
    this.registerAtlasViews();

    // Capture this before migrations/services can create Atlas's storage folder.
    const existingInstallation = await this.app.vault.adapter.exists('atlas-vtt');

    await initializeAtlasStorage(this.app);
    await runStartupMigration(this.app);

    this.settingsService = new SettingsService(this.app);
    await this.settingsService.initialize();
    const changelogService = new ChangelogService(this.app, this.settingsService, {
      installedVersion: this.manifest.version,
      existingInstallation,
      releaseBuild: __ATLAS_RELEASE_BUILD__,
    });
    this.changelogService = changelogService;
    this.addCommand({ id: 'view-changelog', name: 'View changelog', callback: () => changelogService.open() });

    this.globalAssetManager = new GlobalAssetManagerService(this.app);
    this.imageDisplayService = new ImageDisplayService(this.app);

    this.addSettingTab(new AtlasSettingTab(this.app, this, () => [
      navigationSettingsSection(this.settingsService),
      hotkeySettingsSection(this.settingsService),
      onboardingSettingsSection(this.settingsService),
      changelogSettingsSection(this.settingsService, changelogService, this.manifest.version),
      supportSettingsSection(issueReporter),
    ]));
    this.registerEditorSuggest(new HeaderAutocompleteSuggest(this.app));
    registerAtlasLeafSync(this);
    registerSceneSnapshotSync(this);
    registerPlayerWindowReloadCleanup(this);
    registerCommands(this, {
      imageDisplay: this.imageDisplayService,
      assetManager: this.globalAssetManager,
    });

    this.app.workspace.onLayoutReady(() => {
      registerColorSwatchIcons();
      this.imageDisplayService.registerContextMenu();
      registerStatusBarVisibility(this);
      this.changelogService?.showUpdates();
    });
  }

  onunload(): void {
    this.changelogService?.destroy();
    void this.settingsService?.saveSettingsNow();
    this.widgetSyncService?.destroy();
    this.widgetSyncService = undefined;

    this.imageDisplayService?.destroy();
    PlayerWindowService.getInstance()?.destroy(false);
    this.globalAssetManager?.close();
  }

  private registerAtlasViews(): void {
    this.registerExtensions([EXTENSION_ATLASMAP], ATLAS_VIEW_TYPE);
    this.registerView(ATLAS_VIEW_TYPE, (leaf) => new AtlasView(leaf, this));
    this.registerView(LOCAL_PLAYER_VIEW_TYPE, (leaf) => new LocalPlayerView(leaf));
    this.registerView(PLAYER_VIEW_TYPE, (leaf) => new PlayerView(leaf, this));
    this.registerView(DASHBOARD_VIEW_TYPE, (leaf) => new DashboardView(leaf, this));
  }
}
