import { beforeEach, describe, expect, it, vi } from 'vitest';
import { TFile, TFolder } from 'obsidian';
import { createScene, sceneFilePath } from '../../src/app/services/sceneCreation';
import type { AssetService } from '../../src/app/services/AssetService';

type App = import('obsidian').App;

const create = vi.fn();
const addAsset = vi.fn();
let collectionSettings: Record<string, unknown>;

function fakeApp(): App {
  const folder = new TFolder();
  return {
    vault: {
      getAbstractFileByPath: () => folder,
      getFolderByPath: () => folder,
      createFolder: vi.fn(),
      create,
    },
  } as unknown as App;
}

function fakeAssetService(): AssetService {
  return {
    runExclusive: <T>(task: () => Promise<T>): Promise<T> => task(),
    getCollectionSettings: () => collectionSettings,
    addAsset,
  } as unknown as AssetService;
}

/** The scene state `createScene` wrote, as parsed back from the file contents. */
function writtenState(): Record<string, never> {
  return JSON.parse(create.mock.calls[0][1] as string).state;
}

describe('createScene', () => {
  beforeEach(() => {
    collectionSettings = { defaultWidgets: [] };
    create.mockReset().mockResolvedValue(new TFile());
    addAsset.mockReset().mockResolvedValue(undefined);
  });

  it('puts a scene in its collection, named after itself', () => {
    expect(sceneFilePath('campaign', 'Cavern')).toBe('atlas-vtt/collections/campaign/scenes/Cavern.atlasmap');
  });

  it('leaves the grid to be measured from the map on first load', async () => {
    await createScene({ app: fakeApp(), assetService: fakeAssetService(), name: 'Cavern', collectionId: 'campaign' });

    const state = writtenState();
    expect(state).toMatchObject({ schema: 'atlas-vtt', version: 3 });
    expect(state.grid).toMatchObject({ autoDetect: true, type: 'square' });
  });

  it('opens on the background it was given', async () => {
    await createScene({
      app: fakeApp(), assetService: fakeAssetService(), name: 'Cavern', collectionId: 'campaign',
      backgroundPath: 'atlas-vtt/assets/Cavern.webm',
    });

    expect(writtenState().background).toBe('atlas-vtt/assets/Cavern.webm');
  });

  it('takes the collection measurement rather than the plain default', async () => {
    collectionSettings = {
      defaultWidgets: [],
      gridDefaults: { unitType: 'm', unitDistance: 2, measurementMode: 'abstract' },
    };

    await createScene({ app: fakeApp(), assetService: fakeAssetService(), name: 'Cavern', collectionId: 'campaign' });

    expect(writtenState().grid).toMatchObject({ unitType: 'm', unitDistance: 2, measurementType: 'abstract' });
  });

  it('records the scene as an asset in the same step as its file', async () => {
    await createScene({
      app: fakeApp(), assetService: fakeAssetService(), name: 'Cavern', collectionId: 'campaign', tags: ['caves'],
    });

    expect(addAsset).toHaveBeenCalledWith({
      type: 'scene',
      name: 'Cavern',
      collection: 'campaign',
      tags: ['caves'],
      data: { mapPath: 'atlas-vtt/collections/campaign/scenes/Cavern.atlasmap' },
    });
  });
});
