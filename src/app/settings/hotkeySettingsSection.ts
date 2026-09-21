import { Notice, type Setting, type ToggleComponent } from 'obsidian';
import { availableHotkeys, DEFAULT_MAP_HOTKEYS, formatHotkey, hotkeyFromEvent } from '../keyboard/mapHotkeys';
import type { SettingsService } from '../services/SettingsService';
import type { AtlasSettingRow, AtlasSettingSection } from './settingSections';

type HotkeyAction = ReturnType<typeof availableHotkeys>[number];

function notifyFailure(error: unknown, fallback: string): void {
  new Notice(error instanceof Error ? error.message : fallback);
}

/** Map shortcut recorder rows plus the "reset all" row that refreshes them. */
export function hotkeySettingsSection(settings: SettingsService): AtlasSettingSection {
  // Each rendered row registers a callback that re-reads its binding, so
  // "reset all" can refresh every recorder without re-rendering the tab.
  const rowSyncs = new Set<() => void>();

  const hotkeyRow = (action: HotkeyAction): AtlasSettingRow => ({
    name: action.label,
    desc: action.group,
    aliases: ['hotkey', 'shortcut'],
    render: (setting: Setting) => {
      let input: HTMLInputElement | undefined;
      const sync = (): void => {
        if (input) input.value = formatHotkey(settings.getHotkeys()[action.id]);
      };

      setting.addText(text => {
        input = text.inputEl;
        const recorder = text.inputEl;
        sync();
        recorder.readOnly = true;
        recorder.classList.add('atlas-hotkey-recorder');
        recorder.setAttribute('aria-label', `Shortcut for ${action.label}`);
        recorder.addEventListener('focus', () => { recorder.value = 'Press a key…'; });
        recorder.addEventListener('blur', sync);
        recorder.addEventListener('keydown', event => {
          event.preventDefault(); event.stopPropagation();
          if (event.key === 'Escape') { recorder.blur(); return; }
          if (event.repeat) return;
          const binding = hotkeyFromEvent(event);
          if (!binding) return;
          try { settings.setHotkey(action.id, binding); recorder.blur(); }
          catch (error) { notifyFailure(error, 'Could not assign shortcut'); }
        });
      });
      setting.addExtraButton(button => button.setIcon('x').setTooltip('Clear shortcut').onClick(() => {
        settings.setHotkey(action.id, ''); sync();
      }));
      setting.addExtraButton(button => button.setIcon('reset').setTooltip('Restore default').onClick(() => {
        try { settings.setHotkey(action.id, DEFAULT_MAP_HOTKEYS[action.id]); sync(); }
        catch (error) { notifyFailure(error, 'Could not restore shortcut'); }
      }));

      rowSyncs.add(sync);
      return () => { rowSyncs.delete(sync); };
    },
  });

  return {
    heading: 'Map hotkeys',
    rows: [
      {
        name: 'Single keys and combinations',
        desc: 'These shortcuts work only in the active map, outside text fields and dialogs. Select a shortcut field and press a key or combination. Escape cancels recording. Clear a binding before assigning its key to another action.',
        aliases: ['hotkey', 'shortcut', 'reset'],
        render: (setting) => {
          setting.addButton(button => button.setButtonText('Reset all hotkeys').onClick(() => {
            settings.resetHotkeys();
            rowSyncs.forEach(sync => sync());
          }));
        },
      },
      ...availableHotkeys().map(hotkeyRow),
    ],
  };
}

/** Tutorial toggles. */
export function onboardingSettingsSection(settings: SettingsService): AtlasSettingSection {
  let tutorialToggle: ToggleComponent | undefined;
  return {
    heading: 'Getting started',
    rows: [
      {
        name: 'Show tutorials',
        desc: 'Brief walkthroughs for assets, commands, and token statblocks.',
        aliases: ['onboarding', 'walkthrough'],
        render: (setting) => {
          setting.addToggle(toggle => {
            tutorialToggle = toggle;
            toggle.setValue(settings.getSetting('onboarding').enabled).onChange(enabled => {
              settings.setSetting('onboarding', { ...settings.getSetting('onboarding'), enabled });
            });
          });
        },
      },
      {
        name: 'Replay tutorials',
        desc: 'Show the walkthroughs again the next time you open each feature.',
        aliases: ['onboarding', 'walkthrough'],
        render: (setting) => {
          setting.addButton(button => button.setButtonText('Replay tutorials').onClick(() => {
            settings.resetTutorials();
            tutorialToggle?.setValue(true);
            new Notice('Tutorials will appear when you next open each feature.');
          }));
        },
      },
    ],
  };
}
