import { beforeEach, describe, expect, it, vi } from 'vitest';

import { AssetService } from '../../src/app/services/AssetService';
import { createInMemoryApp } from '../mocks/inMemoryVault';

const METADATA_PATH = 'atlas-vtt/.atlas-data/assets-metadata.json';

function seededApp(): ReturnType<typeof createInMemoryApp> {
  return createInMemoryApp({
    folders: ['atlas-vtt/collections', 'atlas-vtt/collections/default'],
    files: {
      [METADATA_PATH]: JSON.stringify({
        collections: {
          default: { id: 'default', name: 'Default', tags: {}, createdAt: 1, modifiedAt: 1 },
        },
        assets: {
          'token-1': { id: 'token-1', type: 'token', name: 'Goblin', imagePath: 'atlas-vtt/assets/goblin.webp', tags: [], collection: 'default', createdAt: 1, modifiedAt: 1 },
        },
        version: 2,
      }),
      'atlas-vtt/assets/goblin.webp': 'WEBP',
    },
  });
}

describe('AssetService metadata loading', () => {
  beforeEach(() => {
    (AssetService as any).instance = null;
  });

  it('reads the index once and answers queries from memory', async () => {
    const { app } = seededApp();
    const service = AssetService.getInstance(app as any);

    await Promise.all([service.initialize(), service.initialize()]);
    await service.initialize();
    expect(app.vault.adapter.read).toHaveBeenCalledTimes(1);

    const tokens = await service.getAssets('default', 'token');
    await service.getAssets('default');
    await service.getCollectionTags('default');
    await service.getAllTags();

    expect(tokens.map((asset) => asset.id)).toEqual(['token-1']);
    expect(app.vault.adapter.read).toHaveBeenCalledTimes(1);
  });

  it('re-reads the index only on an explicit refresh', async () => {
    const { app } = seededApp();
    const service = AssetService.getInstance(app as any);
    await service.initialize();

    await service.refreshMetadata();

    expect(app.vault.adapter.read).toHaveBeenCalledTimes(2);
  });

  it('keeps a save made while a refresh was reading the file', async () => {
    const { app } = seededApp();
    const service = AssetService.getInstance(app as any);
    await service.initialize();
    const read = app.vault.adapter.read.getMockImplementation()!;
    let finishRead = (): void => {};
    const readStarted = new Promise<void>((started) => {
      app.vault.adapter.read = vi.fn(async (path: string) => {
        const content = await read(path);
        started();
        await new Promise<void>((resolve) => { finishRead = resolve; });
        app.vault.adapter.read = vi.fn(read);
        return content;
      });
    });

    const refresh = service.refreshMetadata();
    await readStarted;
    await service.addTokenAsset({ name: 'Orc', imagePath: 'atlas-vtt/assets/goblin.webp', collection: 'default', tags: [] });
    finishRead();
    await refresh;

    expect((await service.getAssets('default', 'token')).map((asset) => asset.name).sort()).toEqual(['Goblin', 'Orc']);
  });

  it('keeps the loaded index when a refresh finds the file unreadable', async () => {
    const { app, files } = seededApp();
    const service = AssetService.getInstance(app as any);
    await service.initialize();

    files.set(METADATA_PATH, '{"collections": {');
    await service.refreshMetadata();

    expect((await service.getAssets('default', 'token')).map((asset) => asset.id)).toEqual(['token-1']);
  });

  it('only reads the index on a refresh and leaves checking it against the vault to startup', async () => {
    const { app, files } = seededApp();
    const service = AssetService.getInstance(app as any);
    await service.initialize();

    files.delete('atlas-vtt/assets/goblin.webp');
    files.set('atlas-vtt/collections/default/tokens/stray.webp', 'WEBP');
    await service.refreshMetadata();

    expect((await service.getAssets()).map((asset) => asset.id)).toEqual(['token-1']);
  });

  it('checks the index against the vault only once Obsidian has listed its files', async () => {
    const { app, files } = seededApp();
    files.delete('atlas-vtt/assets/goblin.webp');
    files.set('Notes/Session.md', 'notes');
    let layoutReady = (): void => {};
    app.workspace.layoutReady = false;
    app.workspace.onLayoutReady = vi.fn((callback: () => void) => { layoutReady = callback; });
    const service = AssetService.getInstance(app as any);
    await service.initialize();
    expect((await service.getAssets()).map((asset) => asset.id)).toEqual(['token-1']);

    layoutReady();
    await service.refreshMetadata();

    expect(await service.getAssets()).toEqual([]);
  });

  it('keeps a token whose image is on disk but not yet in the vault\'s file list', async () => {
    const { app, files } = seededApp();
    files.set('Notes/Session.md', 'notes');
    const listed = app.vault.getFiles.getMockImplementation()!;
    app.vault.getFiles = vi.fn(() => listed().filter((file: { path: string }) => file.path !== 'atlas-vtt/assets/goblin.webp'));
    const service = AssetService.getInstance(app as any);
    await service.initialize();

    expect((await service.getAssets()).map((asset) => asset.id)).toEqual(['token-1']);
  });

  it('keeps a copy of an unreadable index before rebuilding it from the collection files', async () => {
    const { app, files } = seededApp();
    files.set(METADATA_PATH, '{"collections": {');
    files.set('atlas-vtt/collections/default/tokens/wolf.webp', 'WEBP');
    const service = AssetService.getInstance(app as any);
    await service.initialize();

    const copies = [...files.keys()].filter((path) => path.includes('assets-metadata.unreadable-'));
    expect(copies).toHaveLength(1);
    expect(files.get(copies[0]!)).toBe('{"collections": {');
    expect((await service.getAssets()).map((asset) => asset.name)).toEqual(['Wolf']);
  });

  it('leaves an unreadable index untouched when it cannot keep a copy', async () => {
    const { app, files } = seededApp();
    files.set(METADATA_PATH, '{"collections": {');
    app.vault.adapter.copy = vi.fn(async () => { throw new Error('Disk full'); });
    const service = AssetService.getInstance(app as any);

    await expect(service.initialize()).rejects.toThrow('Disk full');
    expect(files.get(METADATA_PATH)).toBe('{"collections": {');
  });
});
