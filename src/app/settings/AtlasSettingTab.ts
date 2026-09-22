import { App, Plugin, PluginSettingTab, Setting, type SettingDefinitionItem } from 'obsidian';
import type { AtlasSettingSection } from './settingSections';

/** Renders the sections the plugin composes; it does not know which services exist. */
export class AtlasSettingTab extends PluginSettingTab {
  private cleanups: Array<() => void> = [];

  constructor(app: App, plugin: Plugin, private readonly sections: () => AtlasSettingSection[]) {
    super(app, plugin);
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
