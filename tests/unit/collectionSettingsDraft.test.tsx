import { act, renderHook } from '@testing-library/react';
import { expect, it } from 'vitest';
import { BUILT_IN_SYSTEM_PRESETS } from '../../src/app/gameSystems/builtInPresets';
import { useCollectionSettingsDraft } from '../../src/app/react/components/collection-settings/useCollectionSettingsDraft';
import type { AssetService } from '../../src/app/services/AssetService';
import type { CollectionSettings } from '../../src/app/types/collectionSettingsTypes';
import type { SystemPreset } from '../../src/app/types/systemPresetTypes';

const shadowdark = BUILT_IN_SYSTEM_PRESETS.find((preset) => preset.name === 'Shadowdark')!;
const dnd5e = BUILT_IN_SYSTEM_PRESETS.find((preset) => preset.name === 'D&D 5e')!;

function draftFor(settings: CollectionSettings) {
  const assets = { getCollectionSettings: () => settings } as unknown as AssetService;
  return renderHook(() => useCollectionSettingsDraft(assets, 'dungeon', true));
}

it('switching systems replaces every condition, even one with the same name', () => {
  const { result } = draftFor({ ...structuredClone(shadowdark.rules), systemPresetId: shadowdark.id });
  act(() => result.current.applyPreset(dnd5e));

  const settings = result.current.toSettings();
  expect(settings.systemPresetId).toBe(dnd5e.id);
  expect(settings.conditions?.map((c) => c.id)).toEqual(dnd5e.rules.conditions.map((c) => c.id));
  expect(settings.conditions?.some((c) => c.id.startsWith('shadowdark-'))).toBe(false);
});

it('clearing the system leaves the vanilla settings', () => {
  const { result } = draftFor({ ...structuredClone(shadowdark.rules), defaultWidgets: { timer: true }, systemPresetId: shadowdark.id });
  act(() => result.current.clearSystem());
  expect(result.current.toSettings()).toMatchObject({ conditions: [], defaultWidgets: {}, systemPresetId: undefined });
});

it('loads and saves the collection’s own creature filters and the switched-off ones, whatever the system', () => {
  const custom = [{ id: 'hd', label: 'HD', kind: 'range' as const, field: 'hit_dice' }];
  const { result } = draftFor({ ...structuredClone(shadowdark.rules), customCreatureFilters: custom, hiddenCreatureFilters: ['source'] });
  expect(result.current.customCreatureFilters).toEqual(custom);
  act(() => result.current.applyPreset(dnd5e));
  act(() => result.current.setHiddenCreatureFilters(['source', 'rarity']));
  expect(result.current.toSettings()).toMatchObject({ customCreatureFilters: custom, hiddenCreatureFilters: ['source', 'rarity'] });
});

describe('default token vision', () => {
  const ranged = { ...structuredClone(dnd5e.rules), defaultTokenVision: { darkvision: 60 }, systemPresetId: dnd5e.id };

  it('loads the collection’s default and saves an edit of it', () => {
    const { result } = draftFor(ranged);
    expect(result.current.defaultTokenVision).toEqual({ darkvision: 60 });
    act(() => result.current.setDefaultTokenVision({ darkvision: 60, range: 120, angle: 90 }));
    expect(result.current.toSettings().defaultTokenVision).toEqual({ darkvision: 60, range: 120, angle: 90 });
  });

  it('saves no default, explicitly, when none is set or every field is blank', () => {
    const { result } = draftFor(structuredClone(dnd5e.rules));
    expect(result.current.toSettings()).toHaveProperty('defaultTokenVision', undefined);
    act(() => result.current.setDefaultTokenVision({}));
    expect(result.current.toSettings()).toHaveProperty('defaultTokenVision', undefined);
  });

  it('takes the default of an applied preset, and none from a preset that sets none', () => {
    const night: SystemPreset = { ...dnd5e, id: 'user-night', builtIn: false, rules: { ...structuredClone(dnd5e.rules), defaultTokenVision: { tremorsense: 15 } } };
    const { result } = draftFor(ranged);
    act(() => result.current.applyPreset(night));
    expect(result.current.toSettings().defaultTokenVision).toEqual({ tremorsense: 15 });
    act(() => result.current.applyPreset(dnd5e));
    expect(result.current.toSettings().defaultTokenVision).toBeUndefined();
  });

  it('is cleared with the game system', () => {
    const { result } = draftFor(ranged);
    act(() => result.current.clearSystem());
    expect(result.current.toSettings().defaultTokenVision).toBeUndefined();
  });
});
