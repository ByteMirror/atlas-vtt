import type { SettingsService } from '../services/SettingsService';
import type { StatblockPresentation } from '../services/statblockPresentation';
import type { AtlasSettingSection } from './settingSections';

const PRESENTATION_LABELS: Record<StatblockPresentation, string> = {
  source: 'Follow the layout',
  atlas: 'Atlas',
};

const PRESENTATION_HINTS: Record<StatblockPresentation, string> = {
  source:
    'Lay statblocks out the way their Fantasy Statblocks layout asks: the columns it declares, a full-width header, and stats on ordinary label lines. Columns drop away on their own wherever the panel is too narrow for them.',
  atlas:
    "Atlas' own compact reading: one column, the token's artwork top right, and inline stats as a label-over-value strip. Best on narrow panels.",
};

/** How Fantasy Statblocks layouts are presented on Atlas' surfaces. */
export function statblockSettingsSection(settingsService: SettingsService): AtlasSettingSection {
  return {
    heading: 'Statblocks',
    rows: [{
      name: 'Layout',
      desc: PRESENTATION_HINTS[settingsService.getStatblockPresentation()],
      aliases: ['fantasy statblocks', 'columns', 'two column', '5.5e', '2024', 'monster'],
      render: (setting) => {
        setting.addDropdown((dropdown) => {
          dropdown
            .addOptions(PRESENTATION_LABELS)
            .setValue(settingsService.getStatblockPresentation())
            .onChange((value) => {
              const presentation = value as StatblockPresentation;
              settingsService.setStatblockPresentation(presentation);
              setting.setDesc(PRESENTATION_HINTS[presentation]);
            });
        });
      },
    }],
  };
}
