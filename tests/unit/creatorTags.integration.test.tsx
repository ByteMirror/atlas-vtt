import React from 'react';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { TFolder, type TAbstractFile } from 'obsidian';
import { AssetService } from '../../src/app/services/AssetService';
import { AtlasUIContext } from '../../src/app/react/root/AtlasUIContext';
import { TokenCreator } from '../../src/app/packages/components/asset-manager/TokenCreator';
import CreateSceneModal from '../../src/app/packages/components/asset-manager/CreateSceneModal';

const { blob } = vi.hoisted(() => ({ blob: { arrayBuffer: async () => new ArrayBuffer(1) } }));
vi.mock('../../src/app/packages/components/asset-manager/token-creator/TokenPreviewCard', () => ({ TokenPreviewCard: () => null }));
vi.mock('../../src/app/packages/components/asset-manager/token-creator/bakeTokenCrop', () => ({ bakeTokenCrop: async () => blob }));
vi.mock('../../src/app/utils/imageOptimizer', () => ({ optimizeImage: async () => ({ blob }), OPTIMIZATION_PRESETS: { token: {} } }));

const service = {
  initialize: vi.fn().mockResolvedValue(undefined),
  getCollections: vi.fn().mockResolvedValue([{ id: 'default', name: 'Default' }]),
  getAllTags: vi.fn().mockResolvedValue(['Existing']),
  createTag: vi.fn(async (_collection: string, name: string) => ({ name })),
  addTokenAsset: vi.fn().mockResolvedValue({}),
  addAsset: vi.fn().mockResolvedValue({}),
  getAssets: vi.fn().mockResolvedValue([]),
  getCollectionSettings: vi.fn().mockReturnValue({}),
};
const app = {
  vault: {
    getAbstractFileByPath: vi.fn((_path: string): TAbstractFile | null => null),
    getFolderByPath: vi.fn((path: string): TFolder | null => new TFolder(path)),
    createFolder: vi.fn().mockResolvedValue(undefined),
    createBinary: vi.fn().mockResolvedValue({}),
    create: vi.fn(async (_path: string, _content: string) => ({})),
  },
  workspace: { trigger: vi.fn(), getLeaf: () => ({ openFile: vi.fn().mockResolvedValue(undefined) }) },
};

beforeEach(() => {
  vi.clearAllMocks();
  vi.stubGlobal('ResizeObserver', class { observe() {} unobserve() {} disconnect() {} });
  URL.createObjectURL = vi.fn(() => 'blob:art');
  URL.revokeObjectURL = vi.fn();
  service.getCollections.mockResolvedValue([{ id: 'default', name: 'Default' }]);
  app.vault.getAbstractFileByPath.mockReturnValue(null);
  app.vault.getFolderByPath.mockImplementation((path: string) => new TFolder(path));
  app.vault.createFolder.mockResolvedValue(undefined);
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
  fireEvent.change(document.querySelector('input[type=file]')!, { target: { files: [new File(['art'], 'Test.png', { type: 'image/png' })] } });
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

it.each([
  { name: 'Jojo', id: 'jojo', selection: 'Jojo' },
  { name: 'My Campaign', id: 'my-campaign', selection: 'My Campaign' },
  { name: 'Renamed Campaign', id: 'original-id', selection: 'Renamed Campaign' },
  { name: 'Jojo', id: 'jojo', selection: 'jojo' },
])('creates a scene in the stored collection folder for $selection', async ({ name, id, selection }) => {
  service.getCollections.mockResolvedValue([{ id, name }]);
  const folderPath = `atlas-vtt/collections/${id}/scenes`;
  const folder = new TFolder(folderPath);
  // The vault index uses the stored spelling, even on a case-insensitive disk.
  app.vault.getAbstractFileByPath.mockImplementation((path: string) => path === folderPath ? folder : null);
  app.vault.getFolderByPath.mockImplementation((path: string) => path === folderPath ? folder : null);
  app.vault.createFolder.mockImplementation(async () => { throw new Error('Folder already exists.'); });
  const onSceneCreated = vi.fn();
  mount(<CreateSceneModal isOpen onClose={() => {}} onSceneCreated={onSceneCreated}
    collections={[name]} selectedCollection={selection} assetService={service as unknown as AssetService}
    backgroundPath="atlas-vtt/assets/forest.webp" defaultName="Forest" />);

  fireEvent.click(screen.getByRole('button', { name: 'Create scene' }));

  await waitFor(() => expect(onSceneCreated).toHaveBeenCalledOnce());
  expect(app.vault.createFolder).not.toHaveBeenCalled();
  expect(app.vault.create).toHaveBeenCalledWith(`${folderPath}/Forest.atlasmap`, expect.any(String));
  const saved = JSON.parse(app.vault.create.mock.calls[0]![1]);
  expect(saved.state.background).toBe('atlas-vtt/assets/forest.webp');
  expect(service.getCollectionSettings).toHaveBeenCalledWith(id);
  expect(service.addAsset).toHaveBeenCalledWith(expect.objectContaining({
    collection: id,
    data: expect.objectContaining({ mapPath: `${folderPath}/Forest.atlasmap` }),
  }));
});
