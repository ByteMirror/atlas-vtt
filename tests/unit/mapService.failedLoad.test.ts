import { EventEmitter } from 'events';
import { describe, expect, it, vi } from 'vitest';
import { createInMemoryApp } from '../mocks/inMemoryVault';

vi.mock('../../src/app/MapController', () => ({
  MapController: { loadAndDisplay: vi.fn().mockRejectedValue(new Error('[MapLoader] Failed to parse map JSON')) },
}));

import { createViewAtlasStore } from '../../src/app/storeFactory';
import { MapService } from '../../src/app/services/MapService';
import type { RendererService } from '../../src/app/services/RendererService';

const BROKEN_MAP = 'maps/broken.atlasmap';
const BROKEN_CONTENT = '{"state": {"objects": ';

function setup(renderer: object | null): {
  service: MapService;
  store: ReturnType<typeof createViewAtlasStore>;
  files: Map<string, string>;
  rendererService: RendererService;
} {
  const { app, files } = createInMemoryApp({ files: { [BROKEN_MAP]: BROKEN_CONTENT } });
  app.vault.getFileByPath = app.vault.getAbstractFileByPath;
  app.vault.getFolderByPath = app.vault.getAbstractFileByPath;
  const store = createViewAtlasStore(app, 'failed-load-test');
  vi.spyOn(console, 'error').mockImplementation(() => {});
  return {
    service: new MapService(app, new EventEmitter(), store),
    store,
    files,
    rendererService: { getRenderer: () => renderer } as unknown as RendererService,
  };
}

describe('MapService.loadMap failure', () => {
  it('never saves the emptied store over a map that failed to load', async () => {
    const { service, store, files, rendererService } = setup({});

    expect(await service.loadMap(rendererService, BROKEN_MAP)).toBeNull();
    expect(store.getState().mapPath).toBeNull();

    store.getState().setGridVisible(false);
    await store.flushStorage();
    expect(files.get(BROKEN_MAP)).toBe(BROKEN_CONTENT);
  });

  it('keeps the previous map bound when loading fails before the store was switched', async () => {
    const { service, store, rendererService } = setup(null);
    store.getState().setMapPath('maps/previous.atlasmap');

    expect(await service.loadMap(rendererService, BROKEN_MAP)).toBeNull();
    expect(store.getState().mapPath).toBe('maps/previous.atlasmap');
  });
});
