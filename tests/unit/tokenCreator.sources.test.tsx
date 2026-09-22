import React from 'react';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, expect, it, vi } from 'vitest';
import { TokenCreator } from '../../src/app/packages/components/asset-manager/TokenCreator';
import { AtlasUIContext } from '../../src/app/react/root/AtlasUIContext';
import { createInMemoryApp } from '../mocks/inMemoryVault';
vi.mock('../../src/app/packages/components/asset-manager/token-creator/useAssetCatalog', () => ({ useAssetCatalog: () => ({ assetService: null, collections: [] }) }));
vi.mock('../../src/app/packages/components/asset-manager/token-creator/useAssetTags', () => ({ useAssetTags: () => ({ tags: [], createTag: vi.fn(), isCreatingTag: false }) }));
vi.mock('../../src/app/services/StatblockTokenImportService', () => ({ StatblockTokenImportService: class { scan = async () => []; } }));
vi.mock('../../src/app/services/AssetService', () => ({ AssetService: { getInstance: () => ({ getCollections: async () => [{ id: 'default', name: 'Default' }] }) } }));
afterEach(cleanup);

it('switches image sources inside the existing creator without another dialog', async () => {
  const { app } = createInMemoryApp();
  render(<AtlasUIContext.Provider value={{ app, view: null, pixiApp: null, renderer: null }}><TokenCreator isOpen onClose={vi.fn()} /></AtlasUIContext.Provider>);
  expect(screen.getByText('No tokens yet')).toBeTruthy();
  expect(screen.getByRole('switch', { name: 'Atlas ring for all' })).toBeTruthy();
  fireEvent.click(screen.getByRole('button', { name: 'Fantasy Statblocks' }));
  expect(await screen.findByLabelText('System / layout')).toBeTruthy();
  expect(screen.getAllByRole('dialog')).toHaveLength(1);
  fireEvent.click(screen.getByRole('button', { name: 'Upload images' }));
  expect(screen.getByText('No tokens yet')).toBeTruthy();
});
