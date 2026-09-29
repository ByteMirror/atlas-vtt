import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('../../src/app/plugin/atlasLeaves', () => ({ getLoadedAtlasView: () => null }));

import { AssetService, type EncounterAsset } from '../../src/app/services/AssetService';
import { FileReferenceService } from '../../src/app/services/FileReferenceService';
import { createInMemoryApp } from '../mocks/inMemoryVault';
import { createViewAtlasStore } from '../../src/app/storeFactory';
import { getDataFilePath } from '../../src/app/utils/dataFileMigration';

const mapPath = 'atlas-vtt/collections/default/scenes/Map.atlasmap';
const oldNote = 'Notes/Journal.md';
const newNote = 'Notes/Renamed Journal.md';

beforeEach(() => Reflect.set(AssetService, 'instance', null));

describe('token note file references', () => {
  it('links, duplicates, saves, restores and unlinks a token note independently of its statblock', async () => {
    const path = 'maps/token-note.atlasmap';
    const { app, files } = createInMemoryApp();
    app.vault.getFileByPath = app.vault.getAbstractFileByPath;
    app.vault.getFolderByPath = app.vault.getAbstractFileByPath;
    const store = createViewAtlasStore(app, 'token-note-save');
    store.getState().setMapPath(path);
    const id = store.getState().addToken({ kind: 'character', name: 'Hero', x: 0, y: 0,
      imagePath: 'Art/Hero.webp', statblockPath: 'Bestiary/Hero.md' });
    store.getState().updateToken(id, { notePath: oldNote });
    const [copyId] = store.getState().duplicateMapObjects([id]);
    expect(store.getState().objects.tokens[copyId!]?.notePath).toBe(oldNote);

    await store.flushStorage();
    const saved = JSON.parse(files.get(getDataFilePath(path))!).state.objects.tokens;
    expect(saved[id].notePath).toBe(oldNote);
    expect(saved[copyId!].notePath).toBe(oldNote);

    const reopened = createViewAtlasStore(app, 'token-note-reopened');
    reopened.getState().setPersistenceEnabled(false);
    reopened.getState().setMapPath(path);
    await reopened.persist.rehydrate();
    expect(reopened.getState().objects.tokens[id]?.notePath).toBe(oldNote);
    reopened.getState().updateToken(id, { notePath: undefined });
    expect(reopened.getState().objects.tokens[id]?.notePath).toBeUndefined();
    expect(reopened.getState().objects.tokens[id]).toMatchObject({ statblockPath: 'Bestiary/Hero.md' });
  });

  it('updates a scene and both encounter token copies after a note move', async () => {
    const { app, files } = createInMemoryApp({ files: {
      [mapPath]: JSON.stringify({ version: 4, state: { objects: { tokens: {
        one: { id: 'one', kind: 'character', name: 'Hero', x: 0, y: 0,
          imagePath: 'Art/Hero.webp', notePath: oldNote, statblockPath: 'Bestiary/Hero.md' },
      } } } }),
      [oldNote]: 'Journal text',
    } });
    const assets = AssetService.getInstance(app);
    await assets.initialize();
    const encounter = await assets.createEncounter({
      name: 'Party', collection: 'default', tags: [], data: {},
      tokens: [{ id: 'one', name: 'Hero', imagePath: 'Art/Hero.webp', state: {
        kind: 'character', name: 'Hero', imagePath: 'Art/Hero.webp',
        notePath: oldNote, statblockPath: 'Bestiary/Hero.md',
      } }],
    });

    await app.vault.rename(app.vault.getFileByPath(oldNote)!, newNote);
    await new FileReferenceService(app).handleFileRenamed(oldNote, newNote);

    const mapToken = JSON.parse(files.get(mapPath)!).state.objects.tokens.one;
    const saved = await assets.getAssetById(encounter.id) as EncounterAsset;
    const record = JSON.parse(files.get(assets.getAssetFilePath(saved))!);
    expect(mapToken.notePath).toBe(newNote);
    expect(mapToken.statblockPath).toBe('Bestiary/Hero.md');
    expect(saved.tokens[0]?.state?.notePath).toBe(newNote);
    expect(saved.data?.tokens?.[0]?.state?.notePath).toBe(newNote);
    expect(record.tokens[0].state.notePath).toBe(newNote);
  });
});
