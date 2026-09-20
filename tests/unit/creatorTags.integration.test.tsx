import React from 'react';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { TFolder } from 'obsidian';
import { AssetService } from '../../src/app/services/AssetService';
import { AtlasUIContext } from '../../src/app/react/root/AtlasUIContext';
import { TokenCreator } from '../../src/app/packages/components/asset-manager/TokenCreator';
import CreateSceneModal from '../../src/app/packages/components/asset-manager/CreateSceneModal';

const { blob, previews } = vi.hoisted(() => {
  const blob = { arrayBuffer: async () => new ArrayBuffer(1) };
  return { blob, previews: {
    previews: [{ id: 'one', name: 'Test', file: {}, imageScale: 1, imagePosition: { x: 0, y: 0 } }],
    selectedIds: [], reset: () => {}, waitForOptimized: async () => blob,
  } };
});
vi.mock('../../src/app/packages/components/asset-manager/token-creator/useTokenPreviews', () => ({ useTokenPreviews: () => previews }));
vi.mock('../../src/app/packages/components/asset-manager/token-creator/TokenPreviewCard', () => ({ TokenPreviewCard: () => null }));
vi.mock('../../src/app/packages/components/asset-manager/token-creator/bakeTokenCrop', () => ({ bakeTokenCrop: async () => blob }));
vi.mock('../../src/app/utils/imageOptimizer', () => ({ optimizeImage: async () => ({ blob }), OPTIMIZATION_PRESETS: { token: {} } }));

const service = {
  initialize: vi.fn().mockResolvedValue(undefined),
  getCollections: vi.fn().mockResolvedValue([{ name: 'Default' }]),
  getAllTags: vi.fn().mockResolvedValue(['Existing']),
  createTag: vi.fn(async (_collection: string, name: string) => ({ name })),
  addTokenAsset: vi.fn().mockResolvedValue({}),
  addAsset: vi.fn().mockResolvedValue({}),
  getAssets: vi.fn().mockResolvedValue([]),
  getCollectionSettings: vi.fn().mockReturnValue({}),
};
const app = {
  vault: {
    getAbstractFileByPath: vi.fn().mockReturnValue(null),
    getFolderByPath: vi.fn((path: string) => new TFolder(path)),
    createFolder: vi.fn().mockResolvedValue(undefined),
    createBinary: vi.fn().mockResolvedValue({}),
    create: vi.fn().mockResolvedValue({}),
  },
  workspace: { trigger: vi.fn(), getLeaf: () => ({ openFile: vi.fn().mockResolvedValue(undefined) }) },
};

beforeEach(() => {
  vi.clearAllMocks();
  vi.spyOn(AssetService, 'getInstance').mockReturnValue(service as unknown as AssetService);
});
afterEach(cleanup);

function mount(child: React.ReactNode) {
  render(<AtlasUIContext.Provider value={{ app } as any}>{child}</AtlasUIContext.Provider>);
}

async function selectAndCreateTags() {
  fireEvent.click(await screen.findByRole('button', { name: 'Existing' }));
  const input = screen.getByRole('textbox', { name: 'Search or create tags' });
  fireEvent.change(input, { target: { value: 'New tag' } });
  fireEvent.keyDown(input, { key: 'Enter' });
  await waitFor(() => expect(screen.getByRole('button', { name: 'New tag' }).getAttribute('aria-pressed')).toBe('true'));
  expect(service.createTag).toHaveBeenCalledWith('default', 'New tag');
}

it.each(['token', 'map'] as const)('persists selected and newly created tags when importing a %s', async (mode) => {
  mount(<TokenCreator isOpen onClose={() => {}} mode={mode} />);
  await selectAndCreateTags();
  fireEvent.click(screen.getByRole('button', { name: /^Create/ }));
  const save = mode === 'token' ? service.addTokenAsset : service.addAsset;
  await waitFor(() => expect(save).toHaveBeenCalledWith(expect.objectContaining({ tags: ['Existing', 'New tag'] })));
});

it('persists selected and newly created tags when creating a scene', async () => {
  mount(<CreateSceneModal isOpen onClose={() => {}} onSceneCreated={() => {}} collections={['default']}
    selectedCollection="default" assetService={service as unknown as AssetService} />);
  fireEvent.change(screen.getByPlaceholderText('Enter scene name'), { target: { value: 'Forest scene' } });
  await selectAndCreateTags();
  expect(service.addAsset).not.toHaveBeenCalled();
  fireEvent.click(screen.getByRole('button', { name: 'Create scene' }));
  await waitFor(() => expect(service.addAsset).toHaveBeenCalledWith(expect.objectContaining({ type: 'scene', tags: ['Existing', 'New tag'] })));
});
