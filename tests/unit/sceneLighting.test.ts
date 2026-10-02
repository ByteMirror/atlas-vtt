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

  it('clamps the lit threshold to 0..1 and keeps the other scene options as given', () => {
    const store = createStore();
    store.getState().setSceneLighting({ litThreshold: 1.5, tokenVision: false, exploredMemory: false, exploredColor: '#aabbcc', unexploredColor: '#112233' });
    expect(store.getState().lighting).toEqual({
      ...DEFAULT_SCENE_LIGHTING, litThreshold: 1, tokenVision: false, exploredMemory: false, exploredColor: '#aabbcc', unexploredColor: '#112233',
    });
    store.getState().setSceneLighting({ litThreshold: -0.5 });
    expect(store.getState().lighting.litThreshold).toBe(0);
    store.getState().setSceneLighting({ litThreshold: Number.NaN });
    expect(store.getState().lighting.litThreshold).toBe(0.25);
  });

  it('leaves the lit threshold unset until the scene sets one', () => {
    const store = createStore();
    store.getState().setSceneLighting({ ambient: 0.4 });
    expect(store.getState().lighting).not.toHaveProperty('litThreshold');
  });

  it('never enters the undo history', () => {
    const store = createStore();
    const history = getHistoryStore(store)!;
    const before = history.getState().pastStates.length;
    store.getState().setSceneLighting({ enabled: true });
    store.getState().setSceneLighting({ tokenVision: false, exploredMemory: false, litThreshold: 0.5, ambientColor: '#ff0000' });
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

  it('loads only valid explored memory and fills in missing lighting fields', () => {
    const store = createStore();
    const merge = store.persist.getOptions().merge!;
    const current = store.getState();
    const unsafe = merge({ exploredMask: 'javascript:alert(1)', lighting: { enabled: true } }, current);
    expect(unsafe.exploredMask).toBeNull();
    expect(unsafe.lighting).toEqual({ ...DEFAULT_SCENE_LIGHTING, enabled: true });
    expect(merge({ exploredMask: 'data:image/png;base64,AAAA' }, current).exploredMask).toBe('data:image/png;base64,AAAA');
    expect(merge({ lighting: 'broken' }, current).lighting).toEqual(DEFAULT_SCENE_LIGHTING);
  });

  it('drops colours the composite could not read when a scene loads', () => {
    const store = createStore();
    const merge = store.persist.getOptions().merge!;
    const lighting = { enabled: true, ambient: 0.4, ambientColor: 'not a colour', exploredColor: 42, unexploredColor: '#102030' };
    expect(merge({ lighting }, store.getState()).lighting).toEqual({ enabled: true, ambient: 0.4, unexploredColor: '#102030' });
  });

  it('saves the darkvision look and tint with the scene, reads them back, and never makes them undo steps', () => {
    const store = createStore();
    const history = getHistoryStore(store)!;
    const before = history.getState().pastStates.length;
    store.getState().setSceneLighting({ enabled: true, darkSightLook: 'grey', darkSightTint: '#40ff80' });
    expect(history.getState().pastStates.length).toBe(before);
    store.setState({ persistenceEnabled: true });
    const saved = JSON.parse(JSON.stringify(store.persist.getOptions().partialize?.(store.getState()))) as Record<string, unknown>;
    expect(saved.lighting).toEqual({ ...DEFAULT_SCENE_LIGHTING, enabled: true, darkSightLook: 'grey', darkSightTint: '#40ff80' });

    const loaded = store.persist.getOptions().merge!(saved, createStore().getState());
    expect(loaded.lighting).toEqual({ ...DEFAULT_SCENE_LIGHTING, enabled: true, darkSightLook: 'grey', darkSightTint: '#40ff80' });
  });

  it('removes an option that is set back to its default, so the scene is as it was before it had one', () => {
    const store = createStore();
    store.getState().setSceneLighting({ darkSightLook: 'colour', darkSightTint: '#40ff80' });
    store.getState().setSceneLighting({ darkSightLook: undefined, darkSightTint: undefined });
    expect(store.getState().lighting).toEqual(DEFAULT_SCENE_LIGHTING);
    expect(store.getState().lighting).not.toHaveProperty('darkSightLook');
    expect(store.getState().lighting).not.toHaveProperty('darkSightTint');
  });

  it('drops a darkvision look and tint the composite could not read when a scene loads', () => {
    const store = createStore();
    const lighting = { enabled: true, ambient: 0.4, darkSightLook: 'sepia', darkSightTint: 'green' };
    expect(store.persist.getOptions().merge!({ lighting }, store.getState()).lighting).toEqual({ enabled: true, ambient: 0.4 });
  });
});
