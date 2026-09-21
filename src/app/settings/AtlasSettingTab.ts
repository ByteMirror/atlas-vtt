import { App, Plugin, PluginSettingTab, Setting, type SettingDefinitionItem } from 'obsidian';
import type { SettingsService } from '../services/SettingsService';
import { navigationSettingsSection } from './navigationSettingsSection';
import { hotkeySettingsSection, onboardingSettingsSection } from './hotkeySettingsSection';
import type { AtlasSettingSection } from './settingSections';
import type { ChangelogService } from '../changelog/ChangelogService';
import { changelogSettingsSection } from './changelogSettingsSection';

export class AtlasSettingTab extends PluginSettingTab {
  private cleanups: Array<() => void> = [];
  constructor(app: App, plugin: Plugin, private readonly settingsService: SettingsService,
    private readonly changelog?: ChangelogService, private readonly version = plugin.manifest.version) {
    super(app, plugin);
  }

  private sections(): AtlasSettingSection[] {
    return [
      navigationSettingsSection(this.settingsService),
      hotkeySettingsSection(this.settingsService),
      onboardingSettingsSection(this.settingsService),
      ...(this.changelog ? [changelogSettingsSection(this.settingsService, this.changelog, this.version)] : []),
    ];
  }

  /** Obsidian 1.13+: declarative settings, indexed by the settings search. */
  getSettingDefinitions(): SettingDefinitionItem[] {
    return this.sections().map(({ heading, rows }) => ({
      type: 'group' as const,
      heading,
      items: rows.map(({ render, ...row }) => ({ ...row, render: (setting: Setting) => render(setting) })),
    }));
  }

  /** Obsidian before 1.13 never calls `getSettingDefinitions`, so render the same sections by hand. */
  display(): void {
    this.hide();
    this.containerEl.empty();
    for (const { heading, rows } of this.sections()) {
      new Setting(this.containerEl).setName(heading).setHeading();
      for (const row of rows) {
        const setting = new Setting(this.containerEl).setName(row.name);
        if (row.desc) setting.setDesc(row.desc);
        const cleanup = row.render(setting);
        if (cleanup) this.cleanups.push(cleanup);
      }
    }
  }

  hide(): void {
    this.cleanups.splice(0).forEach(cleanup => cleanup());
  }
}
