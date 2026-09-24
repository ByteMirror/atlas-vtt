import React, { useState } from 'react';
import { act, cleanup, renderHook, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { AssetService } from '../../src/app/services/AssetService';
import { AtlasUIContext } from '../../src/app/react/root/AtlasUIContext';
import { useAssetData } from '../../src/app/packages/components/asset-manager/hooks/useAssetData';
import { useFollowSelectedCollection } from '../../src/app/packages/components/asset-manager/hooks/useFollowSelectedCollection';
import { useTagsAndCollections } from '../../src/app/packages/components/asset-manager/hooks/useTagsAndCollections';
import { createInMemoryApp } from '../mocks/inMemoryVault';

let app: ReturnType<typeof createInMemoryApp>['app'];
let service: AssetService;

beforeEach(async () => {
  (AssetService as unknown as { instance: AssetService | null }).instance = null;
  app = createInMemoryApp({ files: { 'goblin.webp': '', 'wolf.webp': '' } }).app;
  service = AssetService.getInstance(app);
  await service.initialize();
  await service.createCollection('Winter Camp');
  await service.addTokenAsset({ name: 'Goblin', imagePath: 'goblin.webp', collection: 'default', tags: [] });
  await service.addTokenAsset({ name: 'Wolf', imagePath: 'wolf.webp', collection: 'winter-camp', tags: [] });
});
afterEach(cleanup);

/** The asset manager's collection wiring: the selection, its data and the Manage dialog's handlers. */
function useManager(initialCollection: string) {
  const [selected, setSelected] = useState<string | null>(initialCollection);
  const data = useAssetData('tokens', selected, true);
  useFollowSelectedCollection(data.collections, selected, setSelected);
  const manage = useTagsAndCollections(
    data.assetService, selected, data.tagsByGroup, data.setAssets,
    data.reloadCollections, data.reloadGlobalTags,
  );
  return { selected, setSelected, data, manage };
}

const mountManager = (initialCollection = 'default') =>
  renderHook(() => useManager(initialCollection), {
    wrapper: ({ children }) => <AtlasUIContext.Provider value={{ app } as never}>{children}</AtlasUIContext.Provider>,
  });

const shownTokens = (result: { current: ReturnType<typeof useManager> }): string[] =>
  result.current.data.assets.map((asset) => asset.name);

it('keeps showing a renamed collection, also after a reload', async () => {
  const { result, unmount } = mountManager();
  await waitFor(() => expect(shownTokens(result)).toEqual(['Goblin']));

  await act(() => result.current.manage.handleUpdateCollection('default', '5E'));

  expect(result.current.data.collections.map((c) => [c.id, c.name])).toContainEqual(['default', '5E']);
  expect(result.current.selected).toBe('default');
  expect(shownTokens(result)).toEqual(['Goblin']);

  unmount();
  const reloaded = mountManager();
  await waitFor(() => expect(shownTokens(reloaded.result)).toEqual(['Goblin']));
  expect(reloaded.result.current.data.collections.find((c) => c.id === reloaded.result.current.selected)?.name).toBe('5E');
});

it('shows a renamed non-default collection and deletes it by id', async () => {
  const { result } = mountManager('winter-camp');
  await waitFor(() => expect(shownTokens(result)).toEqual(['Wolf']));

  await act(() => result.current.manage.handleUpdateCollection('winter-camp', 'Default'));
  expect(result.current.data.collections.map((c) => c.name)).toEqual(['Default', 'Winter Camp']);

  await act(() => result.current.manage.handleUpdateCollection('winter-camp', 'Frozen Keep'));
  await waitFor(() => expect(shownTokens(result)).toEqual(['Wolf']));

  await act(() => result.current.manage.handleDeleteCollection('winter-camp'));
  await waitFor(() => expect(result.current.selected).toBe('default'));
  await waitFor(() => expect(shownTokens(result)).toEqual(['Goblin']));
  expect(result.current.data.collections.map((c) => c.id)).toEqual(['default']);
});

it('reads the index from disk when it opens, not on every collection switch', async () => {
  const { result } = mountManager();
  await waitFor(() => expect(shownTokens(result)).toEqual(['Goblin']));
  const reads = vi.mocked(app.vault.adapter.read).mock.calls.length;

  await act(async () => { result.current.setSelected('winter-camp'); });
  await waitFor(() => expect(shownTokens(result)).toEqual(['Wolf']));

  expect(vi.mocked(app.vault.adapter.read).mock.calls.length).toBe(reads);
});

it('shows the newly selected collection when a refresh was announced before the switch rendered', async () => {
  const handlers = new Set<() => unknown>();
  app.workspace.on = ((_name: string, callback: () => unknown) => { handlers.add(callback); return callback; }) as never;
  app.workspace.offref = ((ref: () => unknown) => { handlers.delete(ref); }) as never;
  const { result } = mountManager();
  await waitFor(() => expect(shownTokens(result)).toEqual(['Goblin']));

  // Reading the index from disk takes a moment in Obsidian.
  const read = app.vault.adapter.read;
  app.vault.adapter.read = vi.fn(async (path: string): Promise<string> => {
    await new Promise((resolve) => window.setTimeout(resolve, 10));
    return read(path);
  });

  // An import selects its collection and announces the change before React re-renders.
  await act(async () => {
    result.current.setSelected('winter-camp');
    handlers.forEach((handler) => { void handler(); });
  });
  await act(() => new Promise((resolve) => window.setTimeout(resolve, 50)));

  expect(shownTokens(result)).toEqual(['Wolf']);
});
