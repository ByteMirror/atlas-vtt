import type { NavigationInputMode, SettingsService } from '../services/SettingsService';
import type { AtlasSettingSection } from './settingSections';

const MODE_LABELS: Record<NavigationInputMode, string> = {
  mouse: 'Mouse',
  trackpad: 'Trackpad',
};

const MODE_HINTS: Record<NavigationInputMode, string> = {
  mouse: 'Scroll wheel zooms in and out. Right-click and drag to pan around the map.',
  trackpad: 'Two-finger scroll pans around the map. Pinch to zoom in and out. Right-click and drag also pans.',
};

/** Map navigation options. */
export function navigationSettingsSection(settingsService: SettingsService): AtlasSettingSection {
  return {
    heading: 'Navigation',
    rows: [{
      name: 'Input device',
      desc: MODE_HINTS[settingsService.getNavigationSettings().inputMode],
      aliases: ['mouse', 'trackpad', 'zoom', 'pan'],
      render: (setting) => {
        setting.addDropdown((dropdown) => {
          dropdown
            .addOptions(MODE_LABELS)
            .setValue(settingsService.getNavigationSettings().inputMode)
            .onChange((value) => {
              const inputMode = value as NavigationInputMode;
              settingsService.setNavigationSettings({ inputMode });
              setting.setDesc(MODE_HINTS[inputMode]);
            });
        });
      },
    }],
  };
}
