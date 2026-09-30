import { describe, expect, it } from 'vitest';
import { createViewAtlasStore } from '../../src/app/storeFactory';
import { getHistoryStore } from '../../src/app/stores/history';
import { DEFAULT_SCENE_LIGHTING } from '../../src/app/types/lightingTypes';
import { createInMemoryApp } from '../mocks/inMemoryVault';

function createStore(): ReturnType<typeof createViewAtlasStore> {
  const { app } = createInMemoryApp();
  const store = createViewAtlasStore(app, `lighting-${Math.random()}`);
  store.setState({ persistenceEnabled: false });
  return store;
}

describe('scene lighting state', () => {
  it('starts with lighting off', () => {
    expect(createStore().getState().lighting).toEqual(DEFAULT_SCENE_LIGHTING);
  });

  it('merges changes and clamps the ambient level', () => {
    const store = createStore();
    store.getState().setSceneLighting({ enabled: true, ambient: 3 });
    expect(store.getState().lighting).toEqual({ ...DEFAULT_SCENE_LIGHTING, enabled: true, ambient: 1 });
    store.getState().setSceneLighting({ ambient: -1 });
    expect(store.getState().lighting.ambient).toBe(0);
  });

  it('never enters the undo history', () => {
    const store = createStore();
    const history = getHistoryStore(store)!;
    const before = history.getState().pastStates.length;
    store.getState().setSceneLighting({ enabled: true });
    store.getState().setExploredMask('data:image/png;base64,AAAA');
    expect(history.getState().pastStates.length).toBe(before);
  });

  it('saves lighting and explored memory with the scene', () => {
    const store = createStore();
    store.getState().setSceneLighting({ enabled: true });
    store.getState().setExploredMask('data:image/png;base64,AAAA');
    store.setState({ persistenceEnabled: true });
    const saved = store.persist.getOptions().partialize?.(store.getState()) as Record<string, unknown>;
    expect(saved.lighting).toEqual({ ...DEFAULT_SCENE_LIGHTING, enabled: true });
    expect(saved.exploredMask).toBe('data:image/png;base64,AAAA');
  });
});
