import React, { act } from 'react';
import { render, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { EventEmitter } from 'events';
import { Container, Sprite, Texture, TextureSource } from 'pixi.js';
import { createInMemoryApp } from '../mocks/inMemoryVault';

vi.mock('../../src/app/pixi/backgroundTextureCache', () => ({
  backgroundTextureCache: { acquire: vi.fn(() => Promise.resolve(mapTexture())), release: vi.fn() },
}));

import { PixiRendererOrchestrator } from '../../src/app/PixiRendererOrchestrator';
import { GridSystem } from '../../src/app/grid/GridSystem';
import { BackgroundSprite } from '../../src/app/react/BackgroundSprite';
import { AtlasUIContext } from '../../src/app/react/root/AtlasUIContext';
import { ViewStoreProvider, useAtlasStore } from '../../src/app/react/ViewStoreContext';
import { createViewAtlasStore, type ViewAtlasStore } from '../../src/app/storeFactory';

function mapTexture(): Texture {
  return new Texture({ source: new TextureSource({ width: 280, height: 210 }) });
}

const nextFrame = (): Promise<void> => new Promise((resolve) => window.requestAnimationFrame(() => resolve()));

const SceneBackground: React.FC = () => {
  const background = useAtlasStore((state) => state.background);
  return background ? <BackgroundSprite imagePath={background} /> : null;
};

interface Harness {
  renderer: PixiRendererOrchestrator;
  store: ViewAtlasStore;
  unmount: () => void;
}

const renderers: PixiRendererOrchestrator[] = [];

async function showScene(): Promise<Harness> {
  // jsdom has no canvas; the token and text renderers built with the grid only need it for icons
  vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue(null);
  const { app } = createInMemoryApp({ files: { 'maps/a.png': '', 'maps/b.png': '' } });
  app.vault.adapter.getResourcePath = (path: string): string => `app://${path}`;
  const store = createViewAtlasStore(app, 'background-removal-test');
  const viewport = Object.assign(new Container(), {
    plugins: { resume: vi.fn(), pause: vi.fn() },
    moveCenter: vi.fn(),
    worldWidth: 0,
    worldHeight: 0,
    dirty: false,
  });
  const manager = {
    init: vi.fn(),
    getViewport: () => viewport,
    getApp: () => ({ renderer: { resolution: 1 } }),
    destroy: vi.fn(),
  };
  const renderer = new PixiRendererOrchestrator(app, manager as never, new EventEmitter(), store, 'background-removal-test');
  vi.spyOn(renderer as never, 'setupRenderersAndManagers').mockImplementation(() => {});
  vi.spyOn(renderer as never, 'setupKeyboardHandlers').mockImplementation(() => {});
  await renderer.init(document.createElement('div'));
  renderers.push(renderer);

  const { unmount } = render(
    <AtlasUIContext.Provider value={{ app, view: null, pixiApp: null, renderer }}>
      <ViewStoreProvider store={store}><SceneBackground /></ViewStoreProvider>
    </AtlasUIContext.Provider>,
  );
  act(() => store.getState().setBackground('maps/a.png'));
  await waitFor(() => expect(renderer.getGridSystem()?.getGridSprite()).toBeTruthy());
  return { renderer, store, unmount };
}

afterEach(() => {
  for (const renderer of renderers.splice(0)) renderer.destroy();
  vi.restoreAllMocks();
});

describe('a map background that goes away', () => {
  it('leaves the renderer and the grid without a background instead of a destroyed one', async () => {
    const { renderer, store, unmount } = await showScene();
    const shown = renderer.getBackgroundSprite();
    // A scene with a hidden grid: the next scene's default grid switches it back on
    act(() => store.getState().setGridVisible(false));

    // What a render error anywhere in the map UI does: React unmounts the whole tree
    unmount();
    await nextFrame();

    expect(shown?.destroyed).toBe(true);
    expect(() => store.getState().clearMapState()).not.toThrow();
    expect(renderer.getBackgroundSprite()).toBeNull();
    expect(renderer.getGridSystem()?.getGridSprite()).toBeNull();
  });

  it('draws the grid again on the next background', async () => {
    const { renderer, store } = await showScene();
    act(() => store.getState().setBackground(null));
    await nextFrame();

    act(() => store.getState().setBackground('maps/b.png'));

    await waitFor(() => expect(renderer.getGridSystem()?.getGridSprite()).toBeTruthy());
    expect(renderer.getBackgroundSprite()?.destroyed).toBe(false);
  });

  it('hands the grid the new sprite when the image is swapped', async () => {
    const { renderer, store } = await showScene();
    const first = renderer.getBackgroundSprite();
    act(() => store.getState().setGridVisible(false));

    act(() => store.getState().setBackground('maps/b.png'));
    await waitFor(() => expect(renderer.getBackgroundSprite()).not.toBe(first));
    await nextFrame();

    expect(first?.destroyed).toBe(true);
    expect(renderer.getBackgroundSprite()?.destroyed).toBe(false);
    expect(() => store.getState().clearMapState()).not.toThrow();
  });
});

describe('a grid whose background was destroyed', () => {
  it('waits for the next background instead of reading the destroyed sprite', () => {
    const viewport = new Container();
    const background = new Sprite(mapTexture());
    viewport.addChild(background);
    const grid = new GridSystem({} as never, viewport as never, background, { size: 70, enabled: false });
    try {
      background.destroy();

      expect(() => grid.setEnabled(true)).not.toThrow();
      expect(() => grid.setMapScale(2)).not.toThrow();
      expect(grid.getGridSprite()).toBeNull();

      const next = new Sprite(mapTexture());
      viewport.addChild(next);
      grid.updateBackgroundSprite(next);
      expect(grid.getGridSprite()).not.toBeNull();
    } finally {
      grid.destroy();
    }
  });
});
