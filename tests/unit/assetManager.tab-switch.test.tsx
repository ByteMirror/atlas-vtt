import React from 'react';
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, expect, it, vi } from 'vitest';
import AssetManager from '../../src/app/packages/components/asset-manager/AssetManager';
import type { AnyAsset, Tab } from '../../src/app/packages/components/asset-manager/types';

// The loaded assets and the tab they belong to, as useAssetData reports them.
const loaded: { tab: Tab; assets: AnyAsset[] } = {
  tab: 'tokens',
  assets: [{ id: 'goblin', name: 'Goblin', type: 'tokens', imageUrl: '', folderId: null, modifiedAt: 0 }],
};

vi.mock('../../src/app/packages/components/asset-manager/hooks/useAssetData', () => ({
  useAssetData: () => ({
    folders: [], collections: [], availableTags: [], assets: loaded.assets, assetsTab: loaded.tab,
  }),
}));
vi.mock('../../src/app/packages/components/asset-manager/hooks/useAssetCrud', () => ({ useAssetCrud: () => ({}) }));
vi.mock('../../src/app/packages/components/asset-manager/hooks/useTagsAndCollections', () => ({ useTagsAndCollections: () => ({}) }));
vi.mock('../../src/app/packages/components/asset-manager/hooks/useContextMenus', () => ({ useContextMenus: () => ({}) }));
vi.mock('../../src/app/packages/components/asset-manager/hooks/useStatblockLink', () => ({ useStatblockLink: () => ({}) }));
vi.mock('../../src/app/packages/components/asset-manager/hooks/useAssetManagerEffects', () => ({ useAssetManagerEffects: () => {} }));
vi.mock('../../src/app/packages/components/asset-manager/components/Sidebar', () => ({ Sidebar: () => null }));
vi.mock('../../src/app/packages/components/asset-manager/components/ModalLayer', () => ({ ModalLayer: () => null }));
vi.mock('../../src/app/packages/components/asset-manager/components/Header', () => ({
  Header: ({ onTabChange }: { onTabChange: (tab: Tab) => void }) => <button onClick={() => onTabChange('maps')}>Maps</button>,
}));
vi.mock('../../src/app/packages/components/asset-manager/components/Content', () => ({
  Content: ({ activeTab, assets }: { activeTab: Tab; assets: AnyAsset[] }) => (
    <ul aria-label={activeTab}>{assets.map((asset) => <li key={asset.id}>{asset.name}</li>)}</ul>
  ),
}));

afterEach(cleanup);

it('keeps the previous tab on screen until the new tab has loaded', () => {
  const { rerender } = render(<AssetManager isOpen onClose={() => {}} />);
  fireEvent.click(screen.getByRole('button', { name: 'Maps' }));

  // Loading: the characters stay instead of an empty maps page.
  expect(screen.getByRole('list', { name: 'tokens' }).textContent).toBe('Goblin');

  act(() => {
    loaded.tab = 'maps';
    loaded.assets = [{ id: 'keep', name: 'Keep', type: 'maps', imageUrl: '', mapFilePath: 'keep.jpg', folderId: null, modifiedAt: 0 }];
  });
  rerender(<AssetManager isOpen onClose={() => {}} />);
  expect(screen.getByRole('list', { name: 'maps' }).textContent).toBe('Keep');
});
