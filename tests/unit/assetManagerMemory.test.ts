import { describe, expect, it, vi } from 'vitest';
import type { App } from 'obsidian';
import {
  AssetManagerMemory,
  placeToRestore,
  type AssetManagerPlace,
  type RestoreContext,
} from '../../src/app/packages/components/asset-manager/assetManagerMemory';

function vaultStorage(initial?: unknown): App & { stored: Map<string, unknown> } {
  const stored = new Map<string, unknown>();
  if (initial !== undefined) stored.set('atlas-vtt:asset-manager', initial);
  return {
    stored,
    loadLocalStorage: (key: string) => stored.get(key) ?? null,
    saveLocalStorage: vi.fn((key: string, value: unknown) => stored.set(key, value)),
  } as unknown as App & { stored: Map<string, unknown> };
}

const place: AssetManagerPlace = {
  mapCollection: 'witherwild',
  collection: 'witherwild',
  tab: 'maps',
  folderId: 'folder-atlas-vtt/collections/witherwild/maps/regions',
  search: 'forest',
  tagIds: ['tag-outdoor'],
  sortBy: 'date',
  sortOrder: 'desc',
  collapsedSections: { folders: true, assets: false },
};

const context = (overrides: Partial<RestoreContext> = {}): RestoreContext => ({
  requestedTab: undefined,
  mapCollection: 'witherwild',
  defaultCollection: 'default',
  folderExists: () => true,
  ...overrides,
});

describe('AssetManagerMemory', () => {
  it('keeps the place and scroll positions in the vault\'s local storage across instances', () => {
    const app = vaultStorage();
    const memory = AssetManagerMemory.forApp(app);
    memory.setScrollTop('witherwild/maps/?', 840);
    memory.setPlace(place);

    const reloaded = AssetManagerMemory.forApp(vaultStorage(app.stored.get('atlas-vtt:asset-manager')));
    expect(reloaded.getPlace()).toEqual(place);
    expect(reloaded.scrollTopOf('witherwild/maps/?')).toBe(840);
    expect(AssetManagerMemory.forApp(app)).toBe(memory);
  });

  it('ignores stored data it does not understand', () => {
    expect(AssetManagerMemory.forApp(vaultStorage('garbage')).getPlace()).toBeNull();
    expect(AssetManagerMemory.forApp(vaultStorage({ place: { ...place, tab: 'spells' } })).getPlace()).toBeNull();
  });

  it('forgets a place left on All Collections, which older versions offered', () => {
    expect(AssetManagerMemory.forApp(vaultStorage({ place: { ...place, collection: null } })).getPlace()).toBeNull();
  });

  it('reads only the scroll positions that are positions', () => {
    const memory = AssetManagerMemory.forApp(vaultStorage({ place: null, scroll: { a: 'far', b: -3, c: 120 } }));
    expect([memory.scrollTopOf('a'), memory.scrollTopOf('b'), memory.scrollTopOf('c')]).toEqual([0, 0, 120]);
  });

  it('keeps the scroll positions of the 50 most recent places', () => {
    const memory = AssetManagerMemory.forApp(vaultStorage());
    for (let index = 0; index < 55; index++) memory.setScrollTop(`place-${index}`, 100 + index);
    memory.setScrollTop('place-6', 500);
    memory.setScrollTop('extra', 1);
    expect(memory.scrollTopOf('place-5')).toBe(0);
    expect(memory.scrollTopOf('place-6')).toBe(500);
    expect(memory.scrollTopOf('place-54')).toBe(154);
  });
});

describe('placeToRestore', () => {
  it('reopens exactly where the manager was left', () => {
    const { mapCollection: _, ...where } = place;
    expect(placeToRestore(place, context())).toEqual(where);
  });

  it('starts at the root of the map\'s collection over a map of another collection', () => {
    expect(placeToRestore(place, context({ mapCollection: 'dolmenwood' }))).toMatchObject({
      collection: 'dolmenwood', tab: 'maps', folderId: null, search: 'forest', tagIds: [], sortBy: 'date',
    });
  });

  it('keeps the last collection when opened without a map', () => {
    expect(placeToRestore(place, context({ mapCollection: null }))).toMatchObject({ collection: 'witherwild', folderId: place.folderId });
  });

  it('opens a requested tab at its root without the other tab\'s search', () => {
    expect(placeToRestore(place, context({ requestedTab: 'scenes' }))).toMatchObject({
      tab: 'scenes', folderId: null, search: '', tagIds: [],
    });
  });

  it('falls back to the root when the folder was deleted', () => {
    expect(placeToRestore(place, context({ folderExists: () => false }))).toMatchObject({ folderId: null, tagIds: ['tag-outdoor'] });
  });

  it('opens the map\'s collection on tokens the first time', () => {
    expect(placeToRestore(null, context())).toMatchObject({ collection: 'witherwild', tab: 'tokens', folderId: null, search: '' });
    expect(placeToRestore(null, context({ mapCollection: null, defaultCollection: 'Homebrew' }))).toMatchObject({ collection: 'Homebrew' });
  });
});
