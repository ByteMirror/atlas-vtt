import { describe, expect, it } from 'vitest';
import { waitFor } from '@testing-library/react';
import { createInMemoryApp } from '../mocks/inMemoryVault';
import { createViewAtlasStore } from '../../src/app/storeFactory';
import { getStatblockResources, getResourceUpdate } from '../../src/app/services/statblockResources';
import { toTokenVitals } from '../../src/app/services/statblockVitalsSync';
import { getDataFilePath } from '../../src/app/utils/dataFileMigration';

const monster = { hp: 27, hope: 6, mana: 8 };
const layout = { id: 'basic', name: 'Basic', blocks: [] };

describe('statblock token resource persistence', () => {
  it('round-trips independent HP, hope and additional resource changes through map storage', async () => {
    const { app, files } = createInMemoryApp();
    app.vault.getFileByPath = app.vault.getAbstractFileByPath;
    app.vault.getFolderByPath = app.vault.getAbstractFileByPath;
    const path = 'maps/resources.atlasmap';
    const store = createViewAtlasStore(app, 'resources-test');
    store.getState().setMapPath(path);
    const first = store.getState().addToken({ kind: 'character', x: 10, y: 20, imagePath: 'mage.png', name: 'Mage', hp: { current: 27, max: 27 } } as never);
    const second = store.getState().addToken({ kind: 'character', x: 30, y: 40, imagePath: 'mage.png', name: 'Mage', hp: { current: 27, max: 27 } } as never);
    for (const [key, current] of [['hp', 15], ['hope', 2], ['mana', 3]] as const) {
      const token = toTokenVitals(store.getState().objects.tokens[first]);
      const resource = getStatblockResources(monster, layout, token).find((resource) => resource.key === key)!;
      store.getState().updateToken(first, getResourceUpdate(token, resource, current));
    }
    await (store as typeof store & { flushStorage: () => Promise<void> }).flushStorage();
    await waitFor(() => expect(files.has(getDataFilePath(path))).toBe(true));
    const saved = JSON.parse(files.get(getDataFilePath(path))!);
    expect(saved.state.objects.tokens[first]).toMatchObject({
      hp: { current: 15, max: 27 }, hope: { current: 2, max: 6 }, statblockResources: { mana: { current: 3, max: 8 } },
    });
    expect(saved.state.objects.tokens[second].hp.current).toBe(27);
    expect(saved.state.objects.tokens[second].statblockResources).toBeUndefined();
    const reopened = createViewAtlasStore(app, 'resources-reopened');
    reopened.getState().setPersistenceEnabled(false);
    reopened.getState().setMapPath(path);
    await reopened.persist.rehydrate();
    const resources = getStatblockResources(monster, layout, toTokenVitals(reopened.getState().objects.tokens[first]));
    expect(resources.map(({ key, current }) => ({ key, current }))).toEqual([
      { key: 'hp', current: 15 }, { key: 'hope', current: 2 }, { key: 'mana', current: 3 },
    ]);
  });
});
