import { describe, expect, it, vi } from 'vitest';
import { migratePlayerResourceVisibility, withPlayerVisibility } from '../../../src/app/resources/playerVisibilityMigration';
import { HP, STR, STRESS } from '../../mocks/resourceFixtures';

const switches = (legacy: { hp: boolean; stress: boolean } | null) => ({ legacyPlayerBars: () => legacy, clearLegacyPlayerBars: vi.fn() });

describe('player visibility of resources', () => {
  it('shows players the resources the old switches showed them', () => {
    const visible = withPlayerVisibility([HP, STRESS, STR], { hp: true, stress: false });
    expect(visible.map((d) => [d.key, d.visibleToPlayers])).toEqual([['hp', true], ['stress', false], ['str', false]]);
  });

  it('writes it into every collection once, when a switch was on', async () => {
    const updateCollectionSettings = vi.fn(async () => undefined);
    const assets = {
      getCollections: async () => [
        { id: 'Daggerheart', settings: { conditions: [], systemPresetId: 'builtin:daggerheart' } },
        { id: 'Own', settings: { conditions: [], resources: [STR] } },
      ],
      updateCollectionSettings,
    };
    const settings = switches({ hp: true, stress: true });
    await migratePlayerResourceVisibility(settings, assets as never);
    expect(settings.clearLegacyPlayerBars).toHaveBeenCalledOnce();
    expect(updateCollectionSettings).toHaveBeenCalledTimes(1);
    const [id, update] = updateCollectionSettings.mock.calls[0] as unknown as [string, { resources: Array<{ key: string; visibleToPlayers: boolean }> }];
    expect(id).toBe('Daggerheart');
    expect(update.resources.map((d) => [d.key, d.visibleToPlayers])).toEqual([['hp', true], ['stress', true]]);
  });

  it('changes nothing when the switches were off or already taken', async () => {
    const updateCollectionSettings = vi.fn();
    const assets = { getCollections: vi.fn(async () => []), updateCollectionSettings };
    await migratePlayerResourceVisibility(switches(null), assets as never);
    await migratePlayerResourceVisibility(switches({ hp: false, stress: false }), assets as never);
    expect(assets.getCollections).not.toHaveBeenCalled();
    expect(updateCollectionSettings).not.toHaveBeenCalled();
  });

  it('keeps the switches when a collection could not be saved, so the next start tries again', async () => {
    const settings = switches({ hp: true, stress: false });
    const assets = {
      getCollections: async () => [{ id: 'Own', settings: { conditions: [], resources: [HP] } }],
      updateCollectionSettings: async () => { throw new Error('Disk full'); },
    };
    await expect(migratePlayerResourceVisibility(settings, assets as never)).rejects.toThrow('Disk full');
    expect(settings.clearLegacyPlayerBars).not.toHaveBeenCalled();
  });
});
