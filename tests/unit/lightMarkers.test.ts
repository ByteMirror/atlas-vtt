import { afterEach, describe, expect, it } from 'vitest';
import type { EventSystem, Graphics } from 'pixi.js';
import { Viewport } from 'pixi-viewport';
import { emissionOfPreset } from '../../src/app/lighting/lightEmissionForm';
import { LightMarkers, lightMarkersShown } from '../../src/app/pixi/lighting/LightMarkers';
import { createViewAtlasStore, type ViewAtlasStore } from '../../src/app/storeFactory';
import { createInMemoryApp } from '../mocks/inMemoryVault';

let cleanup: (() => void) | null = null;

function setup(): { markers: LightMarkers; store: ViewAtlasStore; viewport: Viewport } {
  const events = { domElement: document.createElement('canvas') } as unknown as EventSystem;
  const viewport = new Viewport({ screenWidth: 800, screenHeight: 600, events });
  const { app } = createInMemoryApp({ files: {} });
  const store = createViewAtlasStore(app, 'light-markers-view');
  store.getState().setPersistenceEnabled(false);
  store.getState().setMapPath('maps/lights.atlasmap');
  const markers = new LightMarkers(viewport, store);
  cleanup = () => {
    markers.destroy();
    viewport.destroy();
  };
  return { markers, store, viewport };
}

function addTorch(store: ViewAtlasStore, x: number, y: number, hidden?: boolean): string {
  return store.getState().addLight({ x, y, emission: emissionOfPreset('torch'), ...(hidden ? { hidden } : {}) });
}

function fills(marker: Graphics): boolean {
  return marker.context.instructions.some((instruction) => instruction.action === 'fill');
}

describe('lightMarkersShown', () => {
  it('shows markers only while the scene is lit and the lighting tool is not in use', () => {
    expect(lightMarkersShown({ lighting: { enabled: true, ambient: 0 }, activeTool: 'select' })).toBe(true);
    expect(lightMarkersShown({ lighting: { enabled: false, ambient: 0 }, activeTool: 'select' })).toBe(false);
    expect(lightMarkersShown({ lighting: { enabled: true, ambient: 0 }, activeTool: 'wall' })).toBe(false);
  });
});

describe('LightMarkers', () => {
  afterEach(() => {
    cleanup?.();
    cleanup = null;
  });

  it('draws nothing while the scene has no lighting', () => {
    const { markers, store } = setup();
    store.getState().setSceneLighting({ enabled: false });
    addTorch(store, 100, 200);
    expect(markers.view.visible).toBe(false);
    expect(markers.view.children).toHaveLength(0);
  });

  it('marks every placed light once the scene is lit', () => {
    const { markers, store, viewport } = setup();
    addTorch(store, 100, 200);
    store.getState().setSceneLighting({ enabled: true });
    expect(markers.view.parent).toBe(viewport);
    expect(markers.view.visible).toBe(true);
    expect(markers.view.children).toHaveLength(1);
    expect(markers.view.children[0]!.position).toMatchObject({ x: 100, y: 200 });
  });

  it('hides while the lighting tool draws the full light handles', () => {
    const { markers, store } = setup();
    store.getState().setSceneLighting({ enabled: true });
    addTorch(store, 100, 200);
    store.getState().setActiveTool('wall');
    expect(markers.view.visible).toBe(false);
    store.getState().setActiveTool('select');
    expect(markers.view.visible).toBe(true);
  });

  it('moves a marker in place and drops the markers of deleted lights', () => {
    const { markers, store } = setup();
    store.getState().setSceneLighting({ enabled: true });
    const id = addTorch(store, 100, 200);
    const marker = markers.view.children[0]!;
    store.getState().updateLight(id, { x: 300, y: 50 });
    expect(markers.view.children[0]).toBe(marker);
    expect(marker.position).toMatchObject({ x: 300, y: 50 });
    store.getState().deleteLight(id);
    expect(markers.view.children).toHaveLength(0);
    expect(marker.destroyed).toBe(true);
  });

  it('draws a switched-off light hollow', () => {
    const { markers, store } = setup();
    store.getState().setSceneLighting({ enabled: true });
    const id = addTorch(store, 100, 200, true);
    const marker = markers.view.children[0] as Graphics;
    expect(fills(marker)).toBe(false);
    store.getState().updateLight(id, { hidden: false });
    expect(fills(markers.view.children[0] as Graphics)).toBe(true);
  });

  it('keeps the same size on screen at any zoom', () => {
    const { markers, store, viewport } = setup();
    store.getState().setSceneLighting({ enabled: true });
    addTorch(store, 100, 200);
    viewport.scale.set(2);
    viewport.emit('zoomed', { viewport, type: 'wheel' });
    expect(markers.view.children[0]!.scale.x).toBeCloseTo(0.5);
    // A light added later takes the current zoom's size.
    addTorch(store, 300, 200);
    expect(markers.view.children[1]!.scale.x).toBeCloseTo(0.5);
  });
});
