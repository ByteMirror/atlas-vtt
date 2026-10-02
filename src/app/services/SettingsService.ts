import { App, Platform, normalizePath } from 'obsidian';
import { availableHotkeys, canShareHotkey, type MapHotkeyId, type MapHotkeys } from '../keyboard/mapHotkeys';
import { hotkeyOrigin, readHotkeyOverrides, resolveHotkeys, withHotkey, type HotkeyOrigin, type HotkeyOverrides } from '../keyboard/hotkeyOverrides';
import { getDataFilePath } from '../utils/dataFileMigration';
import {
  DEFAULT_LASER_POINTER_SETTINGS,
  resolveLaserPointerSettings,
  type LaserPointerSettings,
} from '../tools/laserPointerSettings';
import {
  DEFAULT_STATBLOCK_PRESENTATION,
  resolveStatblockPresentation,
  type StatblockPresentation,
} from './statblockPresentation';

/**
 * How wheel events drive the map viewport.
 * - `mouse`: the wheel always zooms; right-drag pans.
 * - `trackpad`: two-finger scroll pans; pinch (Ctrl/Cmd + wheel) zooms.
 */
export type NavigationInputMode = 'mouse' | 'trackpad';

export interface NavigationSettings {
  inputMode: NavigationInputMode;
}

/** Every tutorial Atlas has; the settings list those the user finished or skipped. */
export const TUTORIAL_IDS = ['assets', 'palette', 'tokenStatblocks', 'lootSettings', 'lootRoller', 'lootResults'] as const;
export type TutorialId = typeof TUTORIAL_IDS[number];

export interface AtlasSettings {
  showChangelogOnUpdate: boolean;
  changelogMajorUpdatesOnly: boolean;
  /** Only the bindings the user changed; read the effective ones with `getHotkeys`. */
  hotkeys: HotkeyOverrides;
  onboarding: { enabled: boolean; completed: Partial<Record<TutorialId, boolean>>; tokenImported: boolean };
  /** The starter tokens were added to the default collection once; deleted ones stay deleted. */
  starterTokensAdded: boolean;
  navigation: NavigationSettings;
  laserPointer: LaserPointerSettings;
  /** How closely a Fantasy Statblocks layout is followed; read with `getStatblockPresentation`. */
  statblockPresentation: StatblockPresentation;
  /** Game system presets the user saved, as stored; `SystemPresetService` validates them. */
  systemPresets: unknown[];
  localPlayerView: {
    // UI element visibility toggles
    showToolbar: boolean;
    showTokenHP: boolean;
    showTokenStress: boolean;
    showTokenNameplates: boolean;
    showNotePreviews: boolean;
    showGrid: boolean;
    showWidgets: boolean;
    showInitiative: boolean;
    /** Show the DM's dice rolls to players as toasts in the player window. */
    showDiceRolls: boolean;
    showCommandPalette: boolean;
  };
}

const DEFAULT_SETTINGS: AtlasSettings = {
  showChangelogOnUpdate: true,
  changelogMajorUpdatesOnly: false,
  hotkeys: {},
  onboarding: { enabled: true, completed: {}, tokenImported: false },
  starterTokensAdded: false,
  navigation: {
    inputMode: Platform.isMacOS ? 'trackpad' : 'mouse',
  },
  laserPointer: DEFAULT_LASER_POINTER_SETTINGS,
  statblockPresentation: DEFAULT_STATBLOCK_PRESENTATION,
  systemPresets: [],
  localPlayerView: {
    // UI element visibility defaults
    showToolbar: false, // Hide toolbar by default in player view
    showTokenHP: false, // Hide HP bars
    showTokenStress: false, // Hide stress bars
    showTokenNameplates: false, // Hide nameplates
    showNotePreviews: false, // Hide note previews
    showGrid: true, // Show grid by default
    showWidgets: true,
    showInitiative: true,
    showDiceRolls: false,
    showCommandPalette: false // Hide command palette
  },
};

type SettingsListener = (settings: AtlasSettings) => void;

export class SettingsService {
  private static instances = new WeakMap<App, SettingsService>();
  static forApp(app: App | undefined): SettingsService | undefined {
    return app ? this.instances.get(app) : undefined;
  }
  private initialization?: Promise<void>;
  private app: App;
  private settings: AtlasSettings;
  private settingsPath: string;
  private saveTimeout: number | undefined;
  private listeners: Set<SettingsListener> = new Set();
  /** Settles once the settings file is in place (after the startup migration). */
  private readonly storageReady: Promise<unknown>;

  constructor(app: App, storageReady: Promise<unknown> = Promise.resolve()) {
    this.app = app;
    this.storageReady = storageReady;
    SettingsService.instances.set(app, this);
    this.settings = { ...DEFAULT_SETTINGS };
    this.settingsPath = normalizePath(getDataFilePath('atlas-vtt/settings.json'));
  }

  /**
   * Loads the settings file once and notifies subscribers, since views restored at startup
   * subscribe while the service still holds the defaults.
   */
  async initialize(): Promise<void> {
    await (this.initialization ??= this.loadSettings().then(() => this.notify()));
  }

  /**
   * Ensure a directory exists, creating nested directories if necessary
   */
  private async ensureDirectoryExists(path: string): Promise<void> {
    const parts = path.split('/');
    let currentPath = '';

    for (const part of parts) {
      currentPath = currentPath ? `${currentPath}/${part}` : part;

      if (!await this.app.vault.adapter.exists(currentPath)) {
        await this.app.vault.adapter.mkdir(currentPath);
      }
    }
  }

  /**
   * Deep merge two objects, with source values overriding target
   */
  private isRecord(value: unknown): value is Record<string, unknown> {
    return value !== null && typeof value === 'object' && !Array.isArray(value);
  }

  private deepMerge<T extends object>(target: T, source: Partial<T>): T {
    const result: Record<string, unknown> = { ...(target as Record<string, unknown>) };
    for (const [key, sourceValue] of Object.entries(source as Record<string, unknown>)) {
      const targetValue = (target as Record<string, unknown>)[key];
      if (
        this.isRecord(sourceValue) &&
        this.isRecord(targetValue)
      ) {
        result[key] = this.deepMerge(targetValue, sourceValue);
      } else if (sourceValue !== undefined) {
        result[key] = sourceValue;
      }
    }
    return result as T;
  }

  private async loadSettings(): Promise<void> {
    // A failed migration is reported by the plugin's startup; settings still load.
    await this.storageReady.catch(() => undefined);
    try {
      // Use adapter.exists() and adapter.read() to bypass vault index timing issues
      // The vault index may not be ready at plugin startup, but adapter reads directly from disk

      // Try new location first
      if (await this.app.vault.adapter.exists(this.settingsPath)) {
        const content = await this.app.vault.adapter.read(this.settingsPath);
        this.applyStoredSettings(JSON.parse(content) as Partial<AtlasSettings>);
        return;
      }

      // Try old location as fallback
      const oldPath = 'atlas-vtt/settings.json';
      if (await this.app.vault.adapter.exists(oldPath)) {
        const content = await this.app.vault.adapter.read(oldPath);
        this.applyStoredSettings(JSON.parse(content) as Partial<AtlasSettings>);
        return;
      }

      this.settings = { ...DEFAULT_SETTINGS };
    } catch {
      this.settings = { ...DEFAULT_SETTINGS };
    }
  }

  private applyStoredSettings(stored: Partial<AtlasSettings>): void {
    this.settings = this.deepMerge(DEFAULT_SETTINGS, stored);
    this.settings.hotkeys = readHotkeyOverrides(stored.hotkeys);
    // Rewrite files from versions that saved every binding, so they keep only the user's.
    if (JSON.stringify(stored.hotkeys ?? {}) !== JSON.stringify(this.settings.hotkeys)) this.scheduleSave();
  }

  private async saveSettings(): Promise<void> {
    // Saving before the file was read would write the defaults over the user's settings.
    await this.initialize();
    try {
      const settingsJson = JSON.stringify(this.settings, null, 2);

      // Use adapter.exists() to bypass vault index timing issues (same as loadSettings)
      // Always save to the new location - this is the canonical path
      const fileExists = await this.app.vault.adapter.exists(this.settingsPath);
      if (fileExists) {
        await this.app.vault.adapter.write(this.settingsPath, settingsJson);
      } else {
        // Ensure directory exists
        const dir = this.settingsPath.substring(0, this.settingsPath.lastIndexOf('/'));
        await this.ensureDirectoryExists(dir);

        await this.app.vault.adapter.write(this.settingsPath, settingsJson);
      }
    } catch (error) {
      console.error('[SettingsService] Failed to save settings:', error);
      console.error('[SettingsService] Settings path:', this.settingsPath);
      console.error('[SettingsService] Current settings:', this.settings);
    }
  }

  private scheduleSave(): void {
    if (this.saveTimeout) {
      window.clearTimeout(this.saveTimeout);
    }

    this.saveTimeout = window.setTimeout(() => {
      void this.saveSettings();
    }, 500); // Debounce saves by 500ms
  }

  /** Persist (debounced) and notify subscribers of the new settings. */
  private commit(): void {
    this.scheduleSave();
    this.notify();
  }

  private notify(): void {
    for (const listener of this.listeners) {
      listener(this.getAllSettings());
    }
  }

  /**
   * Subscribe to settings changes. Returns an unsubscribe function.
   */
  onChange(listener: SettingsListener): () => void {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  }

  getHotkeys(): MapHotkeys { return resolveHotkeys(this.settings.hotkeys); }

  getHotkeyOrigin(id: MapHotkeyId): HotkeyOrigin { return hotkeyOrigin(this.settings.hotkeys, id); }

  setHotkey(id: MapHotkeyId, key: string): void {
    const bindings = this.getHotkeys();
    const conflict = key && availableHotkeys().find(action => action.id !== id && bindings[action.id] === key && !canShareHotkey(action.id, id));
    if (conflict) throw new Error(`Already assigned to ${conflict.label}. Clear that shortcut first.`);
    this.settings.hotkeys = withHotkey(this.settings.hotkeys, id, key);
    this.commit();
  }

  resetHotkeys(): void {
    this.settings.hotkeys = {};
    this.commit();
  }

  shouldShowTutorial(id: TutorialId): boolean {
    return this.settings.onboarding.enabled && !this.settings.onboarding.completed[id];
  }

  completeTutorial(id: TutorialId): void {
    this.settings.onboarding = { ...this.settings.onboarding, completed: { ...this.settings.onboarding.completed, [id]: true } };
    this.commit();
  }

  markTokenImported(): void {
    if (this.settings.onboarding.tokenImported) return;
    this.settings.onboarding = { ...this.settings.onboarding, tokenImported: true };
    this.commit();
  }

  /** How many tutorials the user finished or skipped; either way they do not show again until reset. */
  finishedTutorialCount(): number {
    return TUTORIAL_IDS.filter((id) => this.settings.onboarding.completed[id]).length;
  }

  resetTutorials(): void {
    this.settings.onboarding = { ...this.settings.onboarding, enabled: true, completed: {} };
    this.commit();
  }

  // Navigation settings
  getNavigationSettings(): NavigationSettings {
    return { ...this.settings.navigation };
  }

  setNavigationSettings(settings: Partial<NavigationSettings>): void {
    this.settings.navigation = { ...this.settings.navigation, ...settings };
    this.commit();
  }

  getStatblockPresentation(): StatblockPresentation {
    return resolveStatblockPresentation(this.settings.statblockPresentation);
  }

  setStatblockPresentation(presentation: StatblockPresentation): void {
    this.settings.statblockPresentation = resolveStatblockPresentation(presentation);
    this.commit();
  }

  getLaserPointerSettings(): LaserPointerSettings {
    return resolveLaserPointerSettings(this.settings.laserPointer);
  }

  setLaserPointerSettings(settings: Partial<LaserPointerSettings>): void {
    this.settings.laserPointer = resolveLaserPointerSettings({ ...this.settings.laserPointer, ...settings });
    this.commit();
  }

  // Local Player View settings
  getLocalPlayerViewSettings(): AtlasSettings['localPlayerView'] {
    return { ...this.settings.localPlayerView };
  }

  setLocalPlayerViewSettings(settings: Partial<AtlasSettings['localPlayerView']>): void {
    this.settings.localPlayerView = { ...this.settings.localPlayerView, ...settings };
    this.commit();
  }

  /**
   * Force an immediate save (no debounce)
   */
  async saveSettingsNow(): Promise<void> {
    // Clear any pending debounced save
    if (this.saveTimeout) {
      window.clearTimeout(this.saveTimeout);
      this.saveTimeout = undefined;
    }
    await this.saveSettings();
  }

  // Generic getter for accessing nested settings
  getSetting<K extends keyof AtlasSettings>(key: K): AtlasSettings[K] {
    return this.settings[key];
  }

  // Generic setter for updating nested settings
  setSetting<K extends keyof AtlasSettings>(key: K, value: AtlasSettings[K]): void {
    this.settings[key] = value;
    this.commit();
  }

  // Get all settings
  getAllSettings(): AtlasSettings {
    return { ...this.settings };
  }

  // Reset to default settings
  resetToDefaults(): void {
    this.settings = { ...DEFAULT_SETTINGS };
    this.commit();
  }
}
