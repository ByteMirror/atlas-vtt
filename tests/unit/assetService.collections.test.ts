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

it('never lets two collections share a name or an id', async () => {
  const { app } = createInMemoryApp({ folders: ['atlas-vtt/collections/lore'] });
  const service = AssetService.getInstance(app);
  await service.initialize();

  const first = await service.createCollection('Monsters');
  await expect(service.createCollection('monsters ')).rejects.toThrow('A collection named "monsters" already exists');
  await expect(service.renameCollection('default', 'MONSTERS')).rejects.toThrow(/already exists/);
  expect(await service.getCollection(first.id)).toMatchObject({ name: 'Monsters' });

  // A leftover folder of a deleted collection is not reused for a new one.
  expect((await service.createCollection('Lore')).id).toBe('lore-2');
  expect(await service.freeCollectionName('Monsters')).toBe('Monsters (2)');
});

it('gives the vault an identity and makes it the publisher of the collections it creates', async () => {
  const { app } = createInMemoryApp();
  const service = AssetService.getInstance(app);
  await service.initialize();
  const vaultId = await service.getVaultId();
  expect(vaultId).toMatch(/^[0-9a-f-]{36}$/);
  expect(await service.createCollection('Monsters')).toMatchObject({ publisherId: vaultId, version: 1 });
});

it('leaves the index untouched when saving an import fails', async () => {
  const { app } = createInMemoryApp();
  const service = AssetService.getInstance(app);
  await service.initialize();
  const collection = { id: 'pack', uid: crypto.randomUUID(), version: 1, name: 'Pack', tags: {}, settings: { conditions: [] }, createdAt: 0, modifiedAt: 0 };
  app.vault.adapter.write = async (): Promise<void> => { throw new Error('Disk full'); };
  await expect(service.commitCollectionImport({ collectionId: 'pack', collection, upsert: [], remove: [] })).rejects.toThrow('Disk full');
  expect(await service.getCollection('pack')).toBeNull();
});
