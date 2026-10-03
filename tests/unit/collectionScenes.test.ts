import { afterEach, describe, expect, it, vi } from 'vitest';
import { TFile, type App } from 'obsidian';
import { createInMemoryApp } from '../mocks/inMemoryVault';

vi.mock('../../src/app/services/ServiceManager', () => ({ ServiceManager: class {} }));
vi.mock('../../src/app/storeFactory', () => ({ createViewAtlasStore: vi.fn() }));

import { AtlasView } from '../../src/app/atlas-view';
import { AssetService } from '../../src/app/services/AssetService';
import { updateCollectionScenes } from '../../src/app/services/collectionScenes';

const SCENE = 'atlas-vtt/collections/umbra/scenes/Keep.atlasmap';
const CONTENT = JSON.stringify({ version: 4, state: { objects: { tokens: {} } } });

afterEach(() => vi.restoreAllMocks());

/** A map view on `SCENE`'s tab, whose store is in the given state. */
function setup(scene: { mapLoaded: boolean; mapPath: string | null }, otherFiles: Record<string, string> = {}): {
  app: App; files: Map<string, string>; view: AtlasView; saveMap: ReturnType<typeof vi.fn>; reloadActiveScene: ReturnType<typeof vi.fn>;
} {
  const { app, files } = createInMemoryApp({ files: { [SCENE]: CONTENT, ...otherFiles } });
  const saveMap = vi.fn().mockResolvedValue(undefined);
  const reloadActiveScene = vi.fn(async (rewrite: (file: TFile) => Promise<void>) => rewrite(new TFile(SCENE)));
  const view = Object.assign(Object.create(AtlasView.prototype) as AtlasView, {
    file: new TFile(SCENE),
    getStore: () => ({ getState: () => ({ isPlayerView: false, ...scene }) }),
    saveMap,
    reloadActiveScene,
  });
  app.workspace = { getLeavesOfType: () => [{ view }] } as unknown as App['workspace'];
  vi.spyOn(AssetService, 'getInstance').mockReturnValue({ getCollectionForMap: () => 'umbra' } as unknown as AssetService);
  return { app, files, view, saveMap, reloadActiveScene };
}

const update = (updateOpen = vi.fn()): { updateOpen: ReturnType<typeof vi.fn>; rewrite: (content: string) => string } => ({
  updateOpen,
  rewrite: (content) => content.replace('"tokens":{}', '"tokens":{},"updated":true'),
});

describe('updating every scene of a collection', () => {
  it('updates an open scene in its store and lets the view save it', async () => {
    const { app, files, view, saveMap } = setup({ mapLoaded: true, mapPath: SCENE });
    const sceneUpdate = update();

    await updateCollectionScenes(app, 'umbra', sceneUpdate);

    expect(sceneUpdate.updateOpen).toHaveBeenCalledWith(view);
    expect(saveMap).toHaveBeenCalled();
    expect(files.get(SCENE)).toBe(CONTENT);
  });

  it('updates the file of a scene whose view failed to load it: its store does not hold the scene', async () => {
    const { app, files, saveMap } = setup({ mapLoaded: false, mapPath: null });
    const sceneUpdate = update();

    await updateCollectionScenes(app, 'umbra', sceneUpdate);

    expect(sceneUpdate.updateOpen).not.toHaveBeenCalled();
    expect(saveMap).not.toHaveBeenCalled();
    expect(files.get(SCENE)).toContain('"updated":true');
  });

  it('goes by the scene a store holds, not by the tab: the tab may name a scene that did not open', async () => {
    const other = 'atlas-vtt/collections/umbra/scenes/Inn.atlasmap';
    const { app, files, view } = setup({ mapLoaded: true, mapPath: other }, { [other]: CONTENT });
    const sceneUpdate = update();

    await updateCollectionScenes(app, 'umbra', sceneUpdate);

    expect(sceneUpdate.updateOpen.mock.calls).toEqual([[view]]);
    expect(files.get(other)).toBe(CONTENT);
    expect(files.get(SCENE)).toContain('"updated":true');
  });

  it('updates the file of a scene that is still loading through its view, so the load cannot finish on the old content', async () => {
    const { app, files, reloadActiveScene } = setup({ mapLoaded: false, mapPath: SCENE });
    const sceneUpdate = update();

    await updateCollectionScenes(app, 'umbra', sceneUpdate);

    expect(sceneUpdate.updateOpen).not.toHaveBeenCalled();
    expect(reloadActiveScene).toHaveBeenCalledTimes(1);
    expect(files.get(SCENE)).toContain('"updated":true');
  });
});
