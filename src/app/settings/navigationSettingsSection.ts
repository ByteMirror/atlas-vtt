import { Setting } from 'obsidian';
import type { NavigationInputMode, SettingsService } from '../services/SettingsService';

const MODE_LABELS: Record<NavigationInputMode, string> = {
  mouse: 'Mouse',
  trackpad: 'Trackpad',
};

const MODE_HINTS: Record<NavigationInputMode, string> = {
  mouse: 'Scroll wheel zooms in and out. Right-click and drag to pan around the map.',
  trackpad: 'Two-finger scroll pans around the map. Pinch to zoom in and out. Right-click and drag also pans.',
};

/**
 * Renders the map navigation options beneath the settings tab’s Navigation heading.
 */
export function renderNavigationSettings(containerEl: HTMLElement, settingsService: SettingsService): void {
  const currentMode = settingsService.getNavigationSettings().inputMode;
  const setting = new Setting(containerEl)
    .setName('Input device')
    .setDesc(MODE_HINTS[currentMode]);

  setting.addDropdown((dropdown) => {
    dropdown.addOptions(MODE_LABELS).setValue(currentMode).onChange((value) => {
      const inputMode = value as NavigationInputMode;
      settingsService.setNavigationSettings({ inputMode });
      setting.setDesc(MODE_HINTS[inputMode]);
    });
  });
}
