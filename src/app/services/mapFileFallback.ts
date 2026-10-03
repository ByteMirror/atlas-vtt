import type { ViewAtlasState, ViewAtlasStore } from '../storeFactory';
import type { MapFile } from './MapPersistence';

/**
 * Fills what rehydration left empty from the map data the loader read: the background
 * and the grid, and the objects when the persisted state was not written by Atlas.
 */
export function fillStoreFromMapFile(store: ViewAtlasStore, mapData: MapFile): void {
  const storeState = store.getState();

  if (!storeState.background && mapData.background) {
    storeState.setBackground(mapData.background);
  }

  if (!storeState.grid && mapData.grid) {
    storeState.setGrid(mapData.grid);
  }

  // If the file exists but has old/different data, use what was persisted
  if (storeState.schema === 'atlas-vtt') return;

  const objects = mapData.objects;
  if (!objects) return;
  if (objects.tokens) {
    storeState.setTokens(objects.tokens);
  }
  if (objects.pins) {
    store.setState((state: ViewAtlasState) => ({
      ...state,
      objects: {
        ...state.objects,
        pins: objects.pins
      }
    }));
  }
  if (objects.texts) {
    storeState.setTexts(objects.texts);
  }
  if (objects.drawings) {
    storeState.setDrawings(objects.drawings);
  }
}
