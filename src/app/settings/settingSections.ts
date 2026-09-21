import type { Setting } from 'obsidian';

/** One settings row. `render` adds the controls; name and description are already set. */
export interface AtlasSettingRow {
  name: string;
  desc?: string;
  /** Extra terms for Obsidian's settings search. */
  aliases?: string[];
  render: (setting: Setting) => void | (() => void);
}

/** Rows under a shared heading. */
export interface AtlasSettingSection {
  heading: string;
  rows: AtlasSettingRow[];
}
