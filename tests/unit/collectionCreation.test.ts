import { expect, it, vi } from 'vitest';
import { AssetService } from '../../src/app/services/AssetService';
import { createCollectionWithSystem } from '../../src/app/services/collectionCreation';

it('stores the resources and bar switches of a collection without a game system, so it never reads as one saved before resources', async () => {
  const updateCollectionSettings = vi.fn(async () => undefined);
  vi.spyOn(AssetService, 'getInstance').mockReturnValue({
    createCollection: async (name: string) => ({ id: name, name }),
    updateCollectionSettings,
  } as unknown as AssetService);

  await createCollectionWithSystem({} as never, 'Plain', undefined, []);

  expect(updateCollectionSettings).toHaveBeenCalledOnce();
  const [id, settings] = updateCollectionSettings.mock.calls[0] as unknown as [string, { resources: Array<{ key: string }>; defaultWidgets: unknown; conditions: unknown[] }];
  expect(id).toBe('Plain');
  expect(settings.resources.map((r) => r.key)).toEqual(['hp']);
  expect(settings.defaultWidgets).toEqual({ hpBar: true, stressBar: false });
  expect(settings.conditions).toEqual([]);
});
