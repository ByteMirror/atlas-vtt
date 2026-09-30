import { beforeEach, expect, it, vi } from 'vitest';
import { AssetService } from '../../src/app/services/AssetService';
import { createInMemoryApp, type InMemoryApp } from '../mocks/inMemoryVault';

const METADATA_PATH = 'atlas-vtt/.atlas-data/assets-metadata.json';

beforeEach(() => { (AssetService as any).instance = null; });

async function setup(): Promise<AssetService & { vault: InMemoryApp }> {
  const vault = createInMemoryApp({ files: { 'goblin.webp': '' } });
  const service = AssetService.getInstance(vault.app as any);
  await service.initialize();
  await service.createCollection('Winter Camp');
  return Object.assign(service, { vault });
}

it('names a new collection\'s folder like the collection', async () => {
  const service = await setup();
  expect(await service.getCollection('Winter Camp')).toMatchObject({ id: 'Winter Camp', name: 'Winter Camp' });
  expect(service.vault.folders.has('atlas-vtt/collections/Winter Camp/scenes')).toBe(true);
  await expect(service.createCollection('Winter/Camp')).rejects.toThrow(/cannot contain/);
});

it('renames a collection together with its folder', async () => {
  const service = await setup();
  const { uid } = (await service.getCollection('Winter Camp'))!;
  await service.vault.app.vault.create('atlas-vtt/collections/Winter Camp/scenes/Cave.atlasmap', '{}');
  const scene = await service.addAsset({ type: 'scene', name: 'Cave', collection: 'Winter Camp', tags: [], data: { mapPath: 'atlas-vtt/collections/Winter Camp/scenes/Cave.atlasmap' } });

  expect(await service.renameCollection('Winter Camp', 'Summer Camp')).toMatchObject({ id: 'Summer Camp', name: 'Summer Camp', uid });

  expect((await service.getCollections()).map((c) => c.name)).toEqual(['Default', 'Summer Camp']);
  expect(service.vault.files.has('atlas-vtt/collections/Summer Camp/scenes/Cave.atlasmap')).toBe(true);
  expect(service.vault.folders.has('atlas-vtt/collections/Winter Camp')).toBe(false);
  expect(await service.getAssetById(scene.id)).toMatchObject({ collection: 'Summer Camp', data: { mapPath: 'atlas-vtt/collections/Summer Camp/scenes/Cave.atlasmap' } });
});

it('renames the default collection with its folder and keeps it the default one', async () => {
  const service = await setup();
  const token = await service.addTokenAsset({ name: 'Goblin', imagePath: 'goblin.webp', collection: 'Default', tags: [] });

  await service.renameCollection('Default', '5e');

  expect(service.getDefaultCollectionId()).toBe('5e');
  expect((await service.getCollections()).map((c) => c.id).sort()).toEqual(['5e', 'Winter Camp']);
  expect((await service.getAssets('5e')).map((asset) => asset.id)).toEqual([token.id]);
  await service.deleteCollection('5e');
  expect(await service.getCollection('5e')).not.toBeNull();
});

it('deletes a collection together with its assets and keeps the default one', async () => {
  const service = await setup();
  await service.addTokenAsset({ name: 'Goblin', imagePath: 'goblin.webp', collection: 'Winter Camp', tags: [] });
  await service.deleteCollection('Winter Camp');
  await service.deleteCollection('Default');
  expect((await service.getCollections()).map((c) => c.id)).toEqual(['Default']);
  expect(await service.getAssets('Winter Camp')).toEqual([]);
});

it('deletes a collection whose files already left the disk, as after a git checkout', async () => {
  const service = await setup();
  const { app, files, folders } = service.vault;
  const thumbnail = 'atlas-vtt/assets/thumbnails/goblin-1.webp';
  const folder = 'atlas-vtt/collections/Winter Camp';
  files.set(thumbnail, 'jpeg');
  await service.addTokenAsset({ name: 'Goblin', imagePath: 'goblin.webp', thumbnailPath: thumbnail, collection: 'Winter Camp', tags: [] });
  // Obsidian still lists them, but they are gone from disk, so trashing them fails
  const trash = app.fileManager.trashFile;
  app.fileManager.trashFile = vi.fn(async (file: { path: string }) => {
    if (file.path !== thumbnail && file.path !== folder) return trash(file);
    files.delete(file.path);
    for (const path of [...folders]) if (path === folder || path.startsWith(`${folder}/`)) folders.delete(path);
    throw new Error(`ENOENT: no such file or directory, rename '${file.path}'`);
  });
  const errors = vi.spyOn(console, 'error').mockImplementation(() => {});

  await service.deleteCollection('Winter Camp');

  expect((await service.getCollections()).map((c) => c.id)).toEqual(['Default']);
  expect(await service.getAssets('Winter Camp')).toEqual([]);
  expect(errors).not.toHaveBeenCalled();
});

it('keeps a collection whose folder could not be trashed', async () => {
  const service = await setup();
  const { app } = service.vault;
  app.fileManager.trashFile = vi.fn(async () => { throw new Error('EACCES: permission denied'); });
  await expect(service.deleteCollection('Winter Camp')).rejects.toThrow('EACCES');
  expect(await service.getCollection('Winter Camp')).not.toBeNull();
});

it('never lets two collections share a name or a folder', async () => {
  const { app, folders } = createInMemoryApp();
  const service = AssetService.getInstance(app);
  await service.initialize();
  // A folder the vault check has not taken in yet.
  folders.add('atlas-vtt/collections/Lore');

  const first = await service.createCollection('Monsters');
  await expect(service.createCollection('monsters ')).rejects.toThrow('A collection named "monsters" already exists');
  await expect(service.renameCollection('Default', 'MONSTERS')).rejects.toThrow(/already exists/);
  await expect(service.createCollection('lore')).rejects.toThrow(/folder named "lore" already exists/);
  expect(await service.getCollection(first.id)).toMatchObject({ name: 'Monsters' });

  // A leftover folder of a deleted collection is not reused for an imported one.
  expect(await service.freeCollectionIdFor('Lore')).toBe('Lore (2)');
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
  const collection = { id: 'Pack', uid: crypto.randomUUID(), version: 1, name: 'Pack', tags: {}, settings: { conditions: [] }, createdAt: 0, modifiedAt: 0 };
  app.vault.adapter.write = async (): Promise<void> => { throw new Error('Disk full'); };
  await expect(service.commitCollectionImport({ collectionId: 'Pack', collection, upsert: [], remove: [] })).rejects.toThrow('Disk full');
  expect(await service.getCollection('Pack')).toBeNull();
});

it('follows a collection folder renamed in the vault', async () => {
  const service = await setup();
  const { uid } = (await service.getCollection('Winter Camp'))!;
  const token = await service.addTokenAsset({ name: 'Goblin', imagePath: 'atlas-vtt/collections/Winter Camp/tokens/goblin.webp', collection: 'Winter Camp', tags: [] });
  const scene = await service.addAsset({ type: 'scene', name: 'Cave', collection: 'Winter Camp', tags: [], data: { mapPath: 'atlas-vtt/collections/Winter Camp/scenes/Cave.atlasmap' } });

  expect(await service.followCollectionFolderRename('atlas-vtt/collections/Winter Camp', 'atlas-vtt/collections/Frozen Keep')).toBe(true);

  expect(await service.getCollection('Winter Camp')).toBeNull();
  expect(await service.getCollection('Frozen Keep')).toMatchObject({ id: 'Frozen Keep', uid, name: 'Frozen Keep' });
  const assets = await service.getAssets('Frozen Keep');
  expect(assets.find((asset) => asset.id === token.id)).toMatchObject({ imagePath: 'atlas-vtt/collections/Frozen Keep/tokens/goblin.webp' });
  expect(assets.find((asset) => asset.id === scene.id)).toMatchObject({
    filePath: `atlas-vtt/collections/Frozen Keep/scenes/${scene.id}.json`,
    data: { mapPath: 'atlas-vtt/collections/Frozen Keep/scenes/Cave.atlasmap' },
  });
});

it('ignores folder renames outside the collections folder, and the default collection follows its folder', async () => {
  const service = await setup();
  expect(await service.followCollectionFolderRename('atlas-vtt/collections/Winter Camp/tokens', 'atlas-vtt/collections/Winter Camp/art')).toBe(false);
  expect(await service.followCollectionFolderRename('Notes', 'Journal')).toBe(false);

  expect(await service.followCollectionFolderRename('atlas-vtt/collections/Default', 'atlas-vtt/collections/homebrew')).toBe(true);
  expect((await service.getCollections()).map((c) => [c.id, c.name])).toEqual([['Winter Camp', 'Winter Camp'], ['homebrew', 'homebrew']]);
  expect(service.getDefaultCollectionId()).toBe('homebrew');
});

it('forgets a collection whose folder was deleted in the vault', async () => {
  const { app, files, folders } = createInMemoryApp({ files: { 'goblin.webp': '' } });
  const service = AssetService.getInstance(app);
  await service.initialize();
  await service.createCollection('Winter Camp');
  await service.addTokenAsset({ name: 'Goblin', imagePath: 'goblin.webp', collection: 'Winter Camp', tags: [] });
  const kept = await service.addTokenAsset({ name: 'Orc', imagePath: 'goblin.webp', collection: 'Default', tags: [] });
  const removeFolder = (folder: string): void => {
    for (const path of [...files.keys()]) if (path.startsWith(`${folder}/`)) files.delete(path);
    for (const path of [...folders]) if (path === folder || path.startsWith(`${folder}/`)) folders.delete(path);
  };

  removeFolder('atlas-vtt/collections/Winter Camp');
  await service.reconcileWithVault();

  expect((await service.getCollections()).map((c) => c.id)).toEqual(['Default']);
  expect(await service.getAssets('Winter Camp')).toEqual([]);
  expect((await service.getAssets('Default')).map((asset) => asset.id)).toEqual([kept.id]);

  // Without any collection folder the vault counts as not listed yet: nothing goes, the default folder comes back.
  removeFolder('atlas-vtt/collections/Default');
  await service.reconcileWithVault();
  expect((await service.getCollections()).map((c) => [c.id, c.name])).toEqual([['Default', 'Default']]);
  expect((await service.getAssets('Default')).map((asset) => asset.id)).toEqual([kept.id]);
  expect(folders.has('atlas-vtt/collections/Default/scenes')).toBe(true);
});

it('hands the default role on when the default collection\'s folder is deleted', async () => {
  const service = await setup();
  for (const path of [...service.vault.folders]) if (path.startsWith('atlas-vtt/collections/Default')) service.vault.folders.delete(path);

  await service.reconcileWithVault();

  expect(service.getDefaultCollectionId()).toBe('Winter Camp');
  expect((await service.getCollections()).map((c) => c.id)).toEqual(['Winter Camp']);
});

it('renames the folders of older collections after their names, numbering names older imports duplicated', async () => {
  const collection = (id: string, name: string): Record<string, unknown> => ({ id, uid: id, name, version: 1, settings: { conditions: [] }, tags: {}, createdAt: id === 'default' ? 0 : 1 });
  const metadata = {
    version: 2,
    collections: { default: collection('default', '5e'), 'winter-camp': collection('winter-camp', 'Winter Camp'), taken: collection('taken', 'Winter Camp') },
    assets: {
      goblin: { id: 'goblin', type: 'token', name: 'Goblin', imagePath: 'atlas-vtt/collections/default/tokens/goblin.webp', tags: [], collection: 'default', createdAt: 0, modifiedAt: 0 },
    },
  };
  const { app, files, folders } = createInMemoryApp({
    files: { [METADATA_PATH]: JSON.stringify(metadata), 'atlas-vtt/collections/default/tokens/goblin.webp': 'IMG' },
    folders: ['atlas-vtt/collections/winter-camp', 'atlas-vtt/collections/taken'],
  });
  const service = AssetService.getInstance(app);
  await service.initialize();

  await vi.waitFor(async () => expect(service.getDefaultCollectionId()).toBe('5e'));
  expect(Object.fromEntries((await service.getCollections()).map((c) => [c.id, c.name]))).toEqual({ '5e': '5e', 'Winter Camp': 'Winter Camp', 'Winter Camp (2)': 'Winter Camp (2)' });
  expect(await service.getAssetById('goblin')).toMatchObject({ collection: '5e', imagePath: 'atlas-vtt/collections/5e/tokens/goblin.webp' });
  expect(files.has('atlas-vtt/collections/5e/tokens/goblin.webp')).toBe(true);
  expect(folders.has('atlas-vtt/collections/default')).toBe(false);
});

it('renames and deletes tags whether assets store their id or their name', async () => {
  const service = await setup();
  await service.createTag('Winter Camp', 'tokens', 'Big Dragon');
  const byId = await service.addTokenAsset({ name: 'Wyrmling', imagePath: 'goblin.webp', collection: 'Winter Camp', tags: ['big-dragon'] });
  const byName = await service.addTokenAsset({ name: 'Drake', imagePath: 'goblin.webp', collection: 'Winter Camp', tags: ['Big Dragon', 'beast'] });
  const tagsOf = async (id: string): Promise<string[]> => (await service.getAssets('Winter Camp')).find((asset) => asset.id === id)!.tags;

  expect(await service.renameTag('Winter Camp', 'tokens', 'big-dragon', 'Wyrm')).toMatchObject({ id: 'wyrm', name: 'Wyrm' });
  expect((await service.getCollectionTags('Winter Camp', 'tokens')).map((tag) => tag.id)).toEqual(['wyrm']);
  expect(await tagsOf(byId.id)).toEqual(['wyrm']);
  expect(await tagsOf(byName.id)).toEqual(['Wyrm', 'beast']);

  await service.createTag('Winter Camp', 'tokens', 'Beast');
  await expect(service.renameTag('Winter Camp', 'tokens', 'wyrm', 'beast')).rejects.toThrow('already exists');

  await service.deleteTag('Winter Camp', 'tokens', 'wyrm');
  expect((await service.getCollectionTags('Winter Camp', 'tokens')).map((tag) => tag.id)).toEqual(['beast']);
  expect(await tagsOf(byId.id)).toEqual([]);
  expect(await tagsOf(byName.id)).toEqual(['beast']);
});

it('forgets a collection whose folder was moved out of the collections folder', async () => {
  const service = await setup();
  await service.addTokenAsset({ name: 'Goblin', imagePath: 'goblin.webp', collection: 'Winter Camp', tags: [] });

  expect(await service.followCollectionFolderRename('atlas-vtt/collections/Winter Camp', 'Archive/Winter Camp')).toBe(true);

  expect((await service.getCollections()).map((c) => c.id)).toEqual(['Default']);
  expect(await service.getAssets('Winter Camp')).toEqual([]);
});

it('never waits for Obsidian to ask about updating links when it renames a folder', async () => {
  const metadata = { version: 2, collections: { default: { id: 'default', uid: 'u', name: '5e', version: 1, settings: { conditions: [] }, tags: {}, createdAt: 0 } }, assets: {} };
  const { app, folders } = createInMemoryApp({ files: { [METADATA_PATH]: JSON.stringify(metadata) }, folders: ['atlas-vtt/collections/default'] });
  // Obsidian renames the folder, reports it, and then waits for the user to answer its "Update links" dialog.
  const renameListeners: Array<(file: { path: string }, oldPath: string) => void> = [];
  app.vault.on = vi.fn((_name: string, listener: (file: { path: string }, oldPath: string) => void) => { renameListeners.push(listener); return listener; }) as never;
  app.fileManager.renameFile = vi.fn(async (file: { path: string }, newPath: string) => {
    const oldPath = file.path;
    await app.vault.adapter.rename(oldPath, newPath);
    renameListeners.forEach((listener) => listener({ path: newPath }, oldPath));
    return new Promise<void>(() => undefined);
  }) as never;
  const service = AssetService.getInstance(app);

  await service.initialize();
  await service.refreshMetadata();
  await service.reconcileWithVault();

  await vi.waitFor(async () => expect(await service.getCollection('5e')).toMatchObject({ uid: 'u', name: '5e' }));
  expect(folders.has('atlas-vtt/collections/5e')).toBe(true);
  expect(service.getDefaultCollectionId()).toBe('5e');
});
