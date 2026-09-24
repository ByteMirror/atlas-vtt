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

it('follows a collection folder renamed in the vault', async () => {
  const service = await setup();
  const { uid } = (await service.getCollection('winter-camp'))!;
  const token = await service.addTokenAsset({ name: 'Goblin', imagePath: 'atlas-vtt/collections/winter-camp/tokens/goblin.webp', collection: 'winter-camp', tags: [] });
  const scene = await service.addAsset({ type: 'scene', name: 'Cave', collection: 'winter-camp', tags: [], data: { mapPath: 'atlas-vtt/collections/winter-camp/scenes/Cave.atlasmap' } });

  expect(await service.followCollectionFolderRename('atlas-vtt/collections/winter-camp', 'atlas-vtt/collections/Frozen Keep')).toBe(true);

  expect(await service.getCollection('winter-camp')).toBeNull();
  expect(await service.getCollection('Frozen Keep')).toMatchObject({ id: 'Frozen Keep', uid, name: 'Frozen Keep' });
  const assets = await service.getAssets('Frozen Keep');
  expect(assets.find((asset) => asset.id === token.id)).toMatchObject({ imagePath: 'atlas-vtt/collections/Frozen Keep/tokens/goblin.webp' });
  expect(assets.find((asset) => asset.id === scene.id)).toMatchObject({
    filePath: `atlas-vtt/collections/Frozen Keep/scenes/${scene.id}.json`,
    data: { mapPath: 'atlas-vtt/collections/Frozen Keep/scenes/Cave.atlasmap' },
  });
});

it('ignores folder renames outside the collections folder and keeps a default collection', async () => {
  const service = await setup();
  expect(await service.followCollectionFolderRename('atlas-vtt/collections/winter-camp/tokens', 'atlas-vtt/collections/winter-camp/art')).toBe(false);
  expect(await service.followCollectionFolderRename('Notes', 'Journal')).toBe(false);

  expect(await service.followCollectionFolderRename('atlas-vtt/collections/default', 'atlas-vtt/collections/homebrew')).toBe(true);
  expect((await service.getCollections()).map((c) => [c.id, c.name])).toEqual([['winter-camp', 'Winter Camp'], ['homebrew', 'Homebrew'], ['default', 'Default']]);
});

it('forgets a collection whose folder was deleted in the vault', async () => {
  const service = await setup();
  await service.addTokenAsset({ name: 'Goblin', imagePath: 'goblin.webp', collection: 'winter-camp', tags: [] });
  const kept = await service.addTokenAsset({ name: 'Orc', imagePath: 'goblin.webp', collection: 'default', tags: [] });

  expect(await service.forgetDeletedCollectionFolder('atlas-vtt/collections/winter-camp/tokens')).toBe(false);
  expect(await service.forgetDeletedCollectionFolder('atlas-vtt/collections/winter-camp')).toBe(true);

  expect((await service.getCollections()).map((c) => c.id)).toEqual(['default']);
  expect(await service.getAssets('winter-camp')).toEqual([]);
  expect((await service.getAssets('default')).map((asset) => asset.id)).toEqual([kept.id]);

  expect(await service.forgetDeletedCollectionFolder('atlas-vtt/collections/default')).toBe(true);
  expect((await service.getCollections()).map((c) => [c.id, c.name])).toEqual([['default', 'Default']]);
  expect(await service.getAssets('default')).toEqual([]);
});

it('numbers collections that an older import left with the same name', async () => {
  const collection = (id: string): Record<string, unknown> => ({ id, uid: id, name: 'Default', version: 1, settings: { conditions: [] }, tags: {} });
  const metadata = { version: 2, assets: {}, collections: { 'default-2': collection('default-2'), default: collection('default') } };
  const { app } = createInMemoryApp({ files: { 'atlas-vtt/.atlas-data/assets-metadata.json': JSON.stringify(metadata) } });
  const service = AssetService.getInstance(app as any);
  await service.initialize();

  expect((await service.getCollection('default'))?.name).toBe('Default');
  expect((await service.getCollection('default-2'))?.name).toBe('Default (2)');
});

it('renames and deletes tags whether assets store their id or their name', async () => {
  const service = await setup();
  await service.createTag('winter-camp', 'tokens', 'Big Dragon');
  const byId = await service.addTokenAsset({ name: 'Wyrmling', imagePath: 'goblin.webp', collection: 'winter-camp', tags: ['big-dragon'] });
  const byName = await service.addTokenAsset({ name: 'Drake', imagePath: 'goblin.webp', collection: 'winter-camp', tags: ['Big Dragon', 'beast'] });
  const tagsOf = async (id: string): Promise<string[]> => (await service.getAssets('winter-camp')).find((asset) => asset.id === id)!.tags;

  expect(await service.renameTag('winter-camp', 'tokens', 'big-dragon', 'Wyrm')).toMatchObject({ id: 'wyrm', name: 'Wyrm' });
  expect((await service.getCollectionTags('winter-camp', 'tokens')).map((tag) => tag.id)).toEqual(['wyrm']);
  expect(await tagsOf(byId.id)).toEqual(['wyrm']);
  expect(await tagsOf(byName.id)).toEqual(['Wyrm', 'beast']);

  await service.createTag('winter-camp', 'tokens', 'Beast');
  await expect(service.renameTag('winter-camp', 'tokens', 'wyrm', 'beast')).rejects.toThrow('already exists');

  await service.deleteTag('winter-camp', 'tokens', 'wyrm');
  expect((await service.getCollectionTags('winter-camp', 'tokens')).map((tag) => tag.id)).toEqual(['beast']);
  expect(await tagsOf(byId.id)).toEqual([]);
  expect(await tagsOf(byName.id)).toEqual(['beast']);
});

it('forgets a collection whose folder was moved out of the collections folder', async () => {
  const service = await setup();
  await service.addTokenAsset({ name: 'Goblin', imagePath: 'goblin.webp', collection: 'winter-camp', tags: [] });

  expect(await service.followCollectionFolderRename('atlas-vtt/collections/winter-camp', 'Archive/winter-camp')).toBe(true);

  expect((await service.getCollections()).map((c) => c.id)).toEqual(['default']);
  expect(await service.getAssets('winter-camp')).toEqual([]);
});

it('finds the assets of a renamed default collection by its id', async () => {
  const service = await setup();
  const token = await service.addTokenAsset({ name: 'Goblin', imagePath: 'goblin.webp', collection: 'default', tags: [] });
  await service.renameCollection('default', '5e');
  expect((await service.getAssets('default')).map((asset) => asset.id)).toEqual([token.id]);
});
