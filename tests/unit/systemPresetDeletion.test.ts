import { afterEach, expect, it, vi } from 'vitest';
import { BUILT_IN_SYSTEM_PRESETS } from '../../src/app/gameSystems/builtInPresets';
import { vanillaSystemSettings } from '../../src/app/gameSystems/systemRules';
import { AssetService } from '../../src/app/services/AssetService';
import { SystemPresetService } from '../../src/app/services/SystemPresetService';
import { deleteSystemPreset } from '../../src/app/services/systemPresetDeletion';
import { createInMemoryApp } from '../mocks/inMemoryVault';
import { memorySettings } from '../mocks/memorySettings';

afterEach(() => vi.restoreAllMocks());

it('deletes the preset and leaves the collections that used it without a game system', async () => {
  const { app } = createInMemoryApp();
  app.workspace = { getLeavesOfType: () => [] } as any;
  const presets = new SystemPresetService(memorySettings());
  const homebrew = presets.create('Homebrew', structuredClone(BUILT_IN_SYSTEM_PRESETS[0]!.rules));
  const updateCollectionSettings = vi.fn(async () => undefined);
  vi.spyOn(AssetService, 'getInstance').mockReturnValue({
    getCollections: async () => [
      { id: 'uses-it', settings: { conditions: [], systemPresetId: homebrew.id } },
      { id: 'other', settings: { conditions: [], systemPresetId: 'builtin:dnd5e' } },
    ],
    updateCollectionSettings,
    getCollectionSettings: () => ({ conditions: [] }),
    getCollectionForMap: () => null,
  } as any);

  const affected = await deleteSystemPreset(app as any, presets, homebrew.id);

  expect(affected).toEqual(['uses-it']);
  expect(presets.list().some((preset) => preset.id === homebrew.id)).toBe(false);
  expect(updateCollectionSettings).toHaveBeenCalledOnce();
  expect(updateCollectionSettings).toHaveBeenCalledWith('uses-it', vanillaSystemSettings());
});
