import type { Setting, ToggleComponent } from 'obsidian';
import type { SettingsService } from '../services/SettingsService';
import type { AtlasSettingRow, AtlasSettingSection } from './settingSections';
import {
  TOOLBAR_CONTROLS, isHideableToolbarControl, isToolbarControlShown, movedToolbarOrder, orderedToolbarIds, type ToolbarControlId,
} from './toolbarControls';

const DEFAULT_ORDER: readonly string[] = TOOLBAR_CONTROLS.map(control => control.id);

/** The controls in the order the user set, or the default order. */
function currentOrder(settings: SettingsService): ToolbarControlId[] {
  return orderedToolbarIds(DEFAULT_ORDER, settings.getToolbarOrder()) as ToolbarControlId[];
}

/**
 * Which controls the map toolbar shows and in what order. Row n always stands
 * for the nth place on the bar and follows whichever control is there, so a
 * move only redraws the rows' texts, as the hotkey rows do.
 */
export function toolbarSettingsSection(settings: SettingsService): AtlasSettingSection {
  const placeRow = (index: number): AtlasSettingRow => ({
    name: TOOLBAR_CONTROLS[index]!.label,
    aliases: ['toolbar', 'hide', 'show', 'tools', 'order', 'priority'],
    render: (setting: Setting) => {
      let toggle: ToggleComponent | undefined;
      const controlAt = (): (typeof TOOLBAR_CONTROLS)[number] => {
        const id = currentOrder(settings)[index];
        return TOOLBAR_CONTROLS.find(control => control.id === id) ?? TOOLBAR_CONTROLS[index]!;
      };
      const move = (delta: number): void => settings.setToolbarOrder(movedToolbarOrder(currentOrder(settings), index, delta));

      setting.addToggle(component => {
        toggle = component;
        component.onChange(shown => {
          const { id } = controlAt();
          if (isHideableToolbarControl(id)) settings.setToolbarControl(id, shown);
        });
      });
      setting.addExtraButton(button => button.setIcon('arrow-up').setTooltip('Move left').setDisabled(index === 0).onClick(() => move(-1)));
      setting.addExtraButton(button => button.setIcon('arrow-down').setTooltip('Move right').setDisabled(index === TOOLBAR_CONTROLS.length - 1).onClick(() => move(1)));

      const sync = (): void => {
        const control = controlAt();
        setting.setName(`${index + 1}. ${control.label}`);
        setting.setDesc(control.hideable ? control.desc : `${control.desc} Always shown.`);
        toggle?.setValue(!isHideableToolbarControl(control.id) || isToolbarControlShown(settings.getToolbarControls(), control.id));
        toggle?.setDisabled(!control.hideable);
      };
      sync();
      return settings.onChange(sync);
    },
  });

  return {
    heading: 'Toolbar',
    rows: [
      {
        name: 'Order and visibility',
        desc: 'Turn controls off to declutter the bar and use the arrows to reorder it. The control furthest left stays on the bar longest when the window is narrow. A hidden control keeps its keyboard shortcut.',
        aliases: ['toolbar', 'reset', 'order', 'priority'],
        render: (setting) => {
          setting.addButton(button => button.setButtonText('Reset order').onClick(() => settings.setToolbarOrder([])));
        },
      },
      ...TOOLBAR_CONTROLS.map((_control, index) => placeRow(index)),
    ],
  };
}
