import { Notice, Setting, type ToggleComponent } from 'obsidian';
import { availableHotkeys, DEFAULT_MAP_HOTKEYS, formatHotkey, hotkeyFromEvent } from '../keyboard/mapHotkeys';
import type { SettingsService } from '../services/SettingsService';

export function renderHotkeySettings(container: HTMLElement, settings: SettingsService): void {
  new Setting(container).setName('Map hotkeys').setHeading();
  new Setting(container).setName('Single keys and combinations')
    .setDesc('These shortcuts work only in the active map, outside text fields and dialogs. Select a shortcut field and press a key or combination. Escape cancels recording. Clear a binding before assigning its key to another action.')
    .addButton(button => button.setButtonText('Reset all hotkeys').onClick(() => {
      settings.resetHotkeys(); refresh();
    }));
  const rows = container.createDiv();
  const refresh = (): void => {
    rows.empty();
    const bindings = settings.getHotkeys();
    for (const action of availableHotkeys()) {
      const row = new Setting(rows).setName(action.label).setDesc(action.group);
      row.addText(text => {
        text.setValue(formatHotkey(bindings[action.id]));
        const input = text.inputEl;
        input.readOnly = true;
        input.classList.add('atlas-hotkey-recorder');
        input.setAttribute('aria-label', `Shortcut for ${action.label}`);
        input.addEventListener('focus', () => { input.value = 'Press a key…'; });
        input.addEventListener('blur', () => { input.value = formatHotkey(settings.getHotkeys()[action.id]); });
        input.addEventListener('keydown', event => {
          event.preventDefault(); event.stopPropagation();
          if (event.key === 'Escape') { input.blur(); return; }
          if (event.repeat) return;
          const binding = hotkeyFromEvent(event);
          if (!binding) return;
          try { settings.setHotkey(action.id, binding); input.blur(); }
          catch (error) { new Notice(error instanceof Error ? error.message : 'Could not assign shortcut'); }
        });
      });
      row.addExtraButton(button => button.setIcon('x').setTooltip('Clear shortcut').onClick(() => { settings.setHotkey(action.id, ''); refresh(); }));
      row.addExtraButton(button => button.setIcon('reset').setTooltip('Restore default').onClick(() => {
        try { settings.setHotkey(action.id, DEFAULT_MAP_HOTKEYS[action.id]); refresh(); }
        catch (error) { new Notice(error instanceof Error ? error.message : 'Could not restore shortcut'); }
      }));
    }
  };
  refresh();
  new Setting(container).setName('Getting started').setHeading();
  let tutorialToggle: ToggleComponent | undefined;
  new Setting(container).setName('Show tutorials').setDesc('Brief walkthroughs for assets, commands, and token statblocks.')
    .addToggle(toggle => {
      tutorialToggle = toggle;
      toggle.setValue(settings.getSetting('onboarding').enabled).onChange(enabled => {
      settings.setSetting('onboarding', { ...settings.getSetting('onboarding'), enabled });
      });
    });
  new Setting(container).setName('Replay tutorials').setDesc('Show the walkthroughs again the next time you open each feature.')
    .addButton(button => button.setButtonText('Replay tutorials').onClick(() => {
      settings.resetTutorials(); tutorialToggle?.setValue(true); new Notice('Tutorials will appear when you next open each feature.');
    }));
}
