import { beforeEach, expect, it, vi } from 'vitest';
import type { StoreApi } from 'zustand';
import type { ViewAtlasState } from '../../src/app/storeFactory';
import { saveMapTokensAsEncounter } from '../../src/app/encounters/saveMapTokensAsEncounter';
import { saveEncounter } from '../../src/app/encounters/encounterSaveService';
import { AssetService } from '../../src/app/services/AssetService';

vi.mock('../../src/app/encounters/encounterSaveService', () => ({ saveEncounter: vi.fn(async () => null) }));

const collections = ['default', 'Goblin Warrens'];
const assetService = {
  getCollectionForMap: (mapPath: string): string | null => collections.find((id) => mapPath.startsWith(`atlas-vtt/collections/${id}/`)) ?? null,
  getDefaultCollectionId: (): string => 'default',
};

function storeWith(mapPath: string | null): StoreApi<ViewAtlasState> {
  const token = { id: 't1', kind: 'character', name: 'Goblin', imagePath: 'atlas-vtt/collections/Goblin Warrens/tokens/goblin.webp', x: 35, y: 35, resources: { hp: { current: 2, max: 7 }, str: { current: 8, max: 8 } }, overriddenMax: ['hp'] };
  const state = { mapPath, objects: { tokens: { t1: token } } };
  return { getState: () => state } as unknown as StoreApi<ViewAtlasState>;
}

beforeEach(() => {
  vi.mocked(saveEncounter).mockClear();
  vi.spyOn(AssetService, 'getInstance').mockReturnValue(assetService as unknown as AssetService);
});

it('saves the encounter into the collection of the open scene', async () => {
  await saveMapTokensAsEncounter({} as never, storeWith('atlas-vtt/collections/Goblin Warrens/scenes/Cave.atlasmap'), null, ['t1']);

  expect(vi.mocked(saveEncounter).mock.calls[0]?.[2]).toBe('Goblin Warrens');
});

it('falls back to the default collection when the scene lies outside every collection', async () => {
  await saveMapTokensAsEncounter({} as never, storeWith(null), null, ['t1']);

  expect(vi.mocked(saveEncounter).mock.calls[0]?.[2]).toBe('default');
});

it('saves each token\'s state in the fields every Atlas reads', async () => {
  await saveMapTokensAsEncounter({} as never, storeWith(null), null, ['t1']);

  const [draft] = vi.mocked(saveEncounter).mock.calls[0]![3];
  expect(draft!.state).toEqual({
    kind: 'character', name: 'Goblin', imagePath: 'atlas-vtt/collections/Goblin Warrens/tokens/goblin.webp',
    hp: { current: 2, max: 7 }, statblockResources: { str: { current: 8, max: 8 } }, maxHpOverridden: true,
  });
});
