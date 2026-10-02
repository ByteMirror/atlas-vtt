import type { StoreApi } from 'zustand';
import type { ViewAtlasState } from '../../../storeFactory';
import type { ContextMenuEntry } from './AtlasContextMenu';
import { LIGHT_PRESETS, LIGHT_PRESET_IDS, presetOf, type LightPresetId } from '../../../lighting/lightPresets';
import { carriedLight } from '../../../lighting/tokenLighting';
import { t } from '../../../i18n';

/**
 * Vision and carried light for `tokenId` and the rest of `targets` (the selection it belongs to),
 * each change one undo step. The clicked token decides what the menu shows as current.
 */
export function tokenLightingEntries(store: StoreApi<ViewAtlasState>, tokenId: string, targets: readonly string[]): ContextMenuEntry[] {
  const tokens = store.getState().objects.tokens;
  const token = tokens[tokenId];
  if (!token) return [];
  const sees = token.vision?.enabled ?? false;
  const current = token.light ? presetOf(token.light) ?? 'custom' : null;

  const carry = (preset: LightPresetId | null): void => {
    store.getState().updateTokens(targets.map((id) => ({ id, changes: { light: carriedLight(preset) } })));
  };
  const option = (label: string, preset: LightPresetId | null): ContextMenuEntry => ({
    type: 'item',
    label,
    checked: current === preset,
    onClick: () => carry(preset),
  });

  return [
    {
      type: 'item',
      label: t('vision.toggle'),
      icon: 'scan-eye',
      checked: sees,
      onClick: () => store.getState().updateTokens(
        targets.map((id) => ({ id, changes: { vision: { ...tokens[id]?.vision, enabled: !sees } } })),
      ),
    },
    {
      type: 'submenu',
      label: t('vision.carryLight'),
      icon: 'flame',
      children: [option(t('common.none'), null), ...LIGHT_PRESET_IDS.map((id) => option(LIGHT_PRESETS[id].label, id))],
    },
  ];
}
