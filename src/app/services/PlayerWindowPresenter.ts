import { App, Notice } from 'obsidian';
import type { StoreApi } from 'zustand';
import { AtlasView } from '../atlas-view';
import type { ViewAtlasState } from '../storeFactory';
import { playerWindowStore } from '../stores/playerWindowStore';
import type { SceneTab } from '../types/sceneTabTypes';
import { PlayerWindowService, type PlayerFrameSource } from './PlayerWindowService';

/** Unsubscribes the tab watcher of the view whose tab is currently presented. */
let stopWatchingPresentedTab: (() => void) | null = null;

/** Present the active view's current scene tab, opening the player window if needed. */
export async function presentActiveTabInPlayerWindow(app: App): Promise<void> {
  const view = app.workspace.getActiveViewOfType(AtlasView);
  const activeTabId = view?.tabMetaStore.getState().activeTabId ?? null;
  if (!view || !activeTabId) {
    new Notice('No active map to send to the player view');
    return;
  }
  await presentTabInPlayerWindow(app, view, activeTabId);
}

/**
 * Switch `view` to the scene tab `tabId`, wait until it is rendered, then show it
 * to players. Opens the player window when it is not open yet. From then on the
 * player window keeps showing this tab while the DM browses other tabs.
 */
export async function presentTabInPlayerWindow(app: App, view: AtlasView, tabId: string): Promise<void> {
  const tab = findTab(view, tabId);
  if (!tab) return;

  await view.switchToTab(tabId);
  if (view.tabMetaStore.getState().activeTabId !== tabId) return;

  const source = await waitForRenderedFrameSource(view);
  if (!source) {
    new Notice('No map canvas found. Please ensure a map is loaded.');
    return;
  }

  const service =
    PlayerWindowService.getInstance() ??
    new PlayerWindowService(app, view.atlasStore as StoreApi<ViewAtlasState>, view.serviceManager.getSettingsService());
  if (service.isWindowOpen()) {
    service.presentCanvas(source, tabId);
  } else {
    service.openPlayerWindow(source, tabId);
  }
  watchPresentedTab(view, service);
  new Notice(`Player view shows ${tab.displayName}`);
}

/**
 * Hold the players' frame whenever the DM leaves the presented tab and resume
 * live mirroring once the DM is back on it and the scene has rendered again.
 */
function watchPresentedTab(view: AtlasView, service: PlayerWindowService): void {
  stopWatchingPresentedTab?.();
  // Release the view once the player window closes, otherwise this closure keeps a closed view alive.
  const stopWatchingWindow = playerWindowStore.subscribe((state) => {
    if (!state.presentedTabId) stopWatchingPresentedTab?.();
  });
  const stopWatchingTabs = view.tabMetaStore.subscribe((state, previous) => {
    if (state.activeTabId === previous.activeTabId) return;
    const { presentedTabId } = playerWindowStore.getState();
    if (!presentedTabId) return;

    if (state.activeTabId === presentedTabId) {
      void resumePresentedTab(view, service, presentedTabId);
    } else {
      service.holdCurrentFrame();
    }
  });
  stopWatchingPresentedTab = (): void => {
    stopWatchingTabs();
    stopWatchingWindow();
    stopWatchingPresentedTab = null;
  };
}

async function resumePresentedTab(view: AtlasView, service: PlayerWindowService, tabId: string): Promise<void> {
  const source = await waitForRenderedFrameSource(view);
  if (!source || view.tabMetaStore.getState().activeTabId !== tabId) return;
  service.releaseHeldFrame(source);
}

function findTab(view: AtlasView, tabId: string): SceneTab | undefined {
  return view.tabMetaStore.getState().tabs.find((tab) => tab.id === tabId);
}

/** Resolve the view's frame source after the current scene load has finished and been drawn. */
async function waitForRenderedFrameSource(view: AtlasView): Promise<PlayerFrameSource | null> {
  await waitForMapLoaded(view.atlasStore as StoreApi<ViewAtlasState>);
  await nextAnimationFrames(2);
  const renderer = view.serviceManager.getRendererService().getRenderer();
  const canvas = renderer?.getAppInstance()?.canvas;
  if (!renderer || !(canvas instanceof HTMLCanvasElement)) return null;
  return { canvas, withPlayerSafeFrame: (capture, settings) => renderer.withPlayerSafeFrame(capture, settings) };
}

function waitForMapLoaded(store: StoreApi<ViewAtlasState>): Promise<void> {
  if (!store.getState().isMapLoading) return Promise.resolve();
  return new Promise((resolve) => {
    const unsubscribe = store.subscribe((state) => {
      if (state.isMapLoading) return;
      unsubscribe();
      resolve();
    });
  });
}

function nextAnimationFrames(count: number): Promise<void> {
  return new Promise((resolve) => {
    const step = (remaining: number): void => {
      if (remaining === 0) {
        resolve();
        return;
      }
      window.requestAnimationFrame(() => step(remaining - 1));
    };
    step(count);
  });
}
