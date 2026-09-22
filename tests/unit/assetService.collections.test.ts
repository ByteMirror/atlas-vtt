import { beforeEach, expect, it } from 'vitest';
import { AssetService } from '../../src/app/services/AssetService';
import { createInMemoryApp } from '../mocks/inMemoryVault';

beforeEach(() => { (AssetService as any).instance = null; });

async function setup(): Promise<AssetService> {
  const { app } = createInMemoryApp({ files: { 'goblin.webp': '' } });
  const service = AssetService.getInstance(app as any);
  await service.initialize();
  await service.createCollection('Winter Camp');
  return service;
}

it('resolves a collection by display name or id', async () => {
  const service = await setup();
  expect(await service.resolveCollectionId('Winter Camp')).toBe('winter-camp');
  expect(await service.resolveCollectionId('winter-camp')).toBe('winter-camp');
  expect(await service.resolveCollectionId('Nope')).toBeNull();
});

it('renames a collection in the persisted metadata', async () => {
  const service = await setup();
  await service.renameCollection('winter-camp', 'Summer Camp');
  expect((await service.getCollections()).map((c) => c.name)).toEqual(['Default', 'Summer Camp']);
});

it('deletes a collection together with its assets and keeps the default one', async () => {
  const service = await setup();
  await service.addTokenAsset({ name: 'Goblin', imagePath: 'goblin.webp', collection: 'winter-camp', tags: [] });
  await service.deleteCollection('winter-camp');
  await service.deleteCollection('default');
  expect((await service.getCollections()).map((c) => c.id)).toEqual(['default']);
  expect(await service.getAssets('winter-camp')).toEqual([]);
});
