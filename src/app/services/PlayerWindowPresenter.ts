import { App, Notice } from 'obsidian';
import type { StoreApi } from 'zustand';
import type { LocalPlayerView } from '../local-player-view';
import { AtlasView, ATLAS_VIEW_TYPE } from '../atlas-view';
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
    new PlayerWindowService(app, view.atlasStore, view.serviceManager.getSettingsService());
  if (service.isWindowOpen()) {
    service.presentCanvas(source, tabId, tab.filePath);
  } else {
    await service.openPlayerWindow(source, tabId, tab.filePath);
  }
  watchPresentedTab(view, service);
  new Notice(`Player view shows ${tab.displayName}`);
}

/** Reconnect a restored workspace leaf without opening another popout. */
export async function restorePlayerWindow(app: App, player: LocalPlayerView): Promise<void> {
  if (player.isClosed || PlayerWindowService.getInstance()?.ownsView(player)) return;
  const session = player.getState();
  const leaves = app.workspace.getLeavesOfType(ATLAS_VIEW_TYPE);
  // Prefer the exact scene tab; fall back to its path if tab IDs changed.
  let sourceView: AtlasView | undefined;
  let sourceTab: SceneTab | undefined;
  for (const leaf of leaves) {
    // revealLeaf also loads deferred views on supported Obsidian versions.
    if (!(leaf.view instanceof AtlasView)) await app.workspace.revealLeaf(leaf);
    if (!(leaf.view instanceof AtlasView)) continue;
    const tabs = leaf.view.tabMetaStore.getState().tabs;
    const tab = tabs.find((entry) => entry.id === session.tabId) ?? tabs.find((entry) => entry.filePath === session.filePath);
    if (tab) { sourceView = leaf.view; sourceTab = tab; break; }
  }
  if (!sourceView || !sourceTab) {
    player.contentEl.setText('Open the presented scene and send it to the player view to reconnect.');
    return;
  }
  const previousTabId = sourceView.tabMetaStore.getState().activeTabId;
  await waitForMapLoaded(sourceView.atlasStore);
  if (player.isClosed) return;
  await sourceView.switchToTab(sourceTab.id);
  if (sourceView.tabMetaStore.getState().activeTabId !== sourceTab.id) {
    player.contentEl.setText('The presented scene could not be loaded. Send a scene to reconnect.');
    return;
  }
  const source = await waitForRenderedFrameSource(sourceView);
  if (!source || player.isClosed) return;
  const service = PlayerWindowService.getInstance() ?? new PlayerWindowService(
    app, sourceView.atlasStore, sourceView.serviceManager.getSettingsService(),
  );
  const viewport = sourceView.serviceManager.getRendererService().getViewport();
  const dmCamera = source.getCamera?.();
  if (session.camera && viewport) {
    viewport.setZoom(session.camera.scale);
    viewport.moveCenter(session.camera.centerX, session.camera.centerY);
  }
  service.attachToView(player, source, sourceTab.id);
  watchPresentedTab(sourceView, service);
  if (session.frozen) {
    service.toggleCameraFreeze();
    if (dmCamera && viewport) {
      viewport.setZoom(dmCamera.scale);
      viewport.moveCenter(dmCamera.centerX, dmCamera.centerY);
    }
  }
  if (previousTabId && previousTabId !== sourceTab.id) await sourceView.switchToTab(previousTabId);
}

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
  await waitForMapLoaded(view.atlasStore);
  await nextAnimationFrames(2);
  const renderer = view.serviceManager.getRendererService().getRenderer();
  const canvas = renderer?.getAppInstance()?.canvas;
  if (!renderer || !canvas?.instanceOf(HTMLCanvasElement)) return null;
  return {
    canvas,
    withPlayerSafeFrame: (capture, settings) => renderer.withPlayerSafeFrame(capture, settings),
    getCamera: () => {
      const viewport = view.serviceManager.getRendererService().getViewport();
      return viewport ? { centerX: viewport.center.x, centerY: viewport.center.y, scale: viewport.scale.x } : undefined;
    },
  };
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
