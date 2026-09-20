import { App, Plugin, PluginSettingTab, Setting } from 'obsidian';
import type { SettingsService } from '../services/SettingsService';
import { renderNavigationSettings } from './navigationSettingsSection';
import { renderHotkeySettings } from './hotkeySettingsSection';

export class AtlasSettingTab extends PluginSettingTab {
  constructor(app: App, plugin: Plugin, private readonly settingsService: SettingsService) {
    super(app, plugin);
  }

  display(): void {
    this.containerEl.empty();
    new Setting(this.containerEl).setName('Navigation').setHeading();
    renderNavigationSettings(this.containerEl, this.settingsService);
    renderHotkeySettings(this.containerEl, this.settingsService);
  }
}
