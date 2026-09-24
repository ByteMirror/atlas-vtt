import { beforeEach, expect, it } from 'vitest';
import { AssetService } from '../../src/app/services/AssetService';
import { createInMemoryApp } from '../mocks/inMemoryVault';

const METADATA_PATH = 'atlas-vtt/.atlas-data/assets-metadata.json';

beforeEach(() => { (AssetService as any).instance = null; });

async function emptyService(): Promise<AssetService> {
  const { app } = createInMemoryApp({ files: { 'goblin.webp': '', 'forest.webp': '' } });
  const service = AssetService.getInstance(app as any);
  await service.initialize();
  return service;
}

const tagNames = async (service: AssetService, group: 'tokens' | 'maps'): Promise<string[]> =>
  (await service.getCollectionTags('default', group)).map((tag) => tag.name).sort();

it('offers registered tags before they are assigned and retains tags from assets', async () => {
  const service = await emptyService();
  await service.createTag('default', 'tokens', 'Unused');
  await service.addTokenAsset({ name: 'Goblin', imagePath: 'goblin.webp', collection: 'default', tags: ['Forest'] });
  expect(await service.getAllTags('tokens')).toEqual(['Forest', 'Unused']);
});

it('keeps the tags of tokens and encounters apart from those of maps and scenes', async () => {
  const service = await emptyService();
  await service.createTag('default', 'tokens', 'Undead');
  await service.createTag('default', 'maps', 'Forest');
  await service.addAsset({ type: 'scene', name: 'Glade', collection: 'default', tags: ['Night'] });
  await service.addAsset({ type: 'encounter', name: 'Ambush', collection: 'default', tags: ['Boss'], tokens: [] });

  expect(await tagNames(service, 'tokens')).toEqual(['Undead']);
  expect(await tagNames(service, 'maps')).toEqual(['Forest']);
  expect(await service.getAllTags('tokens')).toEqual(['Boss', 'Undead']);
  expect(await service.getAllTags('maps')).toEqual(['Forest', 'Night']);
});

it('lets both groups hold a tag of the same name and edits only the group asked for', async () => {
  const service = await emptyService();
  await service.createTag('default', 'tokens', 'Forest');
  await service.createTag('default', 'maps', 'Forest');
  const goblin = await service.addTokenAsset({ name: 'Goblin', imagePath: 'goblin.webp', collection: 'default', tags: ['Forest'] });
  const glade = await service.addAsset({ type: 'scene', name: 'Glade', collection: 'default', tags: ['Forest'] });
  const tagsOf = async (id: string): Promise<string[]> => (await service.getAssets('default')).find((asset) => asset.id === id)!.tags;

  await service.renameTag('default', 'tokens', 'forest', 'Woodland');
  expect(await tagNames(service, 'tokens')).toEqual(['Woodland']);
  expect(await tagNames(service, 'maps')).toEqual(['Forest']);
  expect(await tagsOf(goblin.id)).toEqual(['Woodland']);
  expect(await tagsOf(glade.id)).toEqual(['Forest']);

  await service.deleteTag('default', 'maps', 'forest');
  expect(await tagNames(service, 'maps')).toEqual([]);
  expect(await tagsOf(glade.id)).toEqual([]);
  expect(await tagsOf(goblin.id)).toEqual(['Woodland']);
});

it('moves tags saved before tag groups into the groups whose assets carry them', async () => {
  const asset = (id: string, type: string, tags: string[]): Record<string, unknown> => ({
    id, name: id, type, tags, collection: 'default', createdAt: 0, modifiedAt: 0,
    ...(type === 'token' ? { imagePath: 'goblin.webp' } : type === 'map' ? { mapFilePath: 'forest.webp' } : {}),
  });
  const metadata = {
    version: 2,
    collections: {
      default: {
        id: 'default', uid: 'default', name: 'Default', version: 1, settings: { conditions: [] },
        tags: {
          goblin: { id: 'goblin', name: 'Goblin' },
          forest: { id: 'forest', name: 'Forest' },
          shared: { id: 'shared', name: 'Shared' },
          unused: { id: 'unused', name: 'Unused' },
        },
      },
    },
    assets: {
      token: asset('token', 'token', ['Goblin', 'shared']),
      map: asset('map', 'map', ['forest']),
      scene: asset('scene', 'scene', ['Shared']),
    },
  };
  const { app } = createInMemoryApp({ files: { 'goblin.webp': '', 'forest.webp': '', [METADATA_PATH]: JSON.stringify(metadata) } });
  const service = AssetService.getInstance(app as any);
  await service.initialize();

  expect(await tagNames(service, 'tokens')).toEqual(['Goblin', 'Shared', 'Unused']);
  expect(await tagNames(service, 'maps')).toEqual(['Forest', 'Shared', 'Unused']);
  const saved = JSON.parse(await app.vault.adapter.read(METADATA_PATH));
  expect(Object.keys(saved.collections.default.tags).sort()).toEqual([
    'maps:forest', 'maps:shared', 'maps:unused', 'tokens:goblin', 'tokens:shared', 'tokens:unused',
  ]);
});
