import { describe, expect, test, vi, beforeEach } from 'vitest';
import { createStore } from 'zustand/vanilla';
import { createTabMetaStore } from '../../src/app/stores/tabMetaStore';
import { playerWindowStore, resetPlayerWindowStore } from '../../src/app/stores/playerWindowStore';
import { SettingsService } from '../../src/app/services/SettingsService';
import type { PlayerFrameSource } from '../../src/app/services/PlayerWindowService';

vi.mock('../../src/app/atlas-view', () => ({
  AtlasView: class AtlasView {},
}));

const serviceMock = vi.hoisted(() => ({
  isWindowOpen: vi.fn(() => false),
  openPlayerWindow: vi.fn(),
  presentCanvas: vi.fn(),
  holdCurrentFrame: vi.fn(),
  releaseHeldFrame: vi.fn(),
}));

vi.mock('../../src/app/services/PlayerWindowService', async () => {
  const { playerWindowStore: store } = await import('../../src/app/stores/playerWindowStore');
  class PlayerWindowService {
    static getInstance(): PlayerWindowService {
      return new PlayerWindowService();
    }
    isWindowOpen = serviceMock.isWindowOpen;
    holdCurrentFrame = serviceMock.holdCurrentFrame;
    releaseHeldFrame = serviceMock.releaseHeldFrame;
    openPlayerWindow(source: PlayerFrameSource, tabId: string): void {
      serviceMock.openPlayerWindow(source, tabId);
      store.setState({ presentedTabId: tabId, isOpen: true });
    }
    presentCanvas(source: PlayerFrameSource, tabId: string): void {
      serviceMock.presentCanvas(source, tabId);
      store.setState({ presentedTabId: tabId });
    }
  }
  return { PlayerWindowService };
});

import { presentTabInPlayerWindow } from '../../src/app/services/PlayerWindowPresenter';

interface FakeView {
  view: any;
  canvas: HTMLCanvasElement;
  withPlayerSafeFrame: ReturnType<typeof vi.fn>;
  atlasStore: ReturnType<typeof createStore<{ isMapLoading: boolean }>>;
}

function createFakeView(): FakeView {
  const tabMetaStore = createTabMetaStore();
  const atlasStore = createStore<{ isMapLoading: boolean }>(() => ({ isMapLoading: false }));
  const canvas = document.createElement('canvas');
  const withPlayerSafeFrame = vi.fn((capture: () => void) => capture());
  const renderer = { getAppInstance: () => ({ canvas }), withPlayerSafeFrame };
  const view = {
    tabMetaStore,
    atlasStore,
    serviceManager: { getRendererService: () => ({ getRenderer: () => renderer }) },
    switchToTab: vi.fn(async (tabId: string) => {
      tabMetaStore.getState().setActiveTab(tabId);
    }),
  };
  return { view, canvas, withPlayerSafeFrame, atlasStore };
}

/** Matches the frame source the presenter builds for `canvas`. */
const frameSourceFor = (canvas: HTMLCanvasElement): PlayerFrameSource =>
  expect.objectContaining({ canvas, withPlayerSafeFrame: expect.any(Function) });

const flush = (): Promise<void> => new Promise((resolve) => setTimeout(resolve, 10));

describe('PlayerWindowPresenter', () => {
  beforeEach(() => {
    vi.stubGlobal('requestAnimationFrame', (cb: FrameRequestCallback) => setTimeout(() => cb(0), 0));
    resetPlayerWindowStore();
    serviceMock.isWindowOpen.mockReturnValue(false);
    Object.values(serviceMock).forEach((fn) => fn.mockClear());
  });

  test('switches to the tab, opens the window with its canvas and marks it presented', async () => {
    const { view, canvas, withPlayerSafeFrame } = createFakeView();
    const tavern = view.tabMetaStore.getState().addTab('maps/tavern.md', 'Tavern');
    const dungeon = view.tabMetaStore.getState().addTab('maps/dungeon.md', 'Dungeon');
    view.tabMetaStore.getState().setActiveTab(tavern);

    await presentTabInPlayerWindow({} as any, view, dungeon);

    expect(view.switchToTab).toHaveBeenCalledWith(dungeon);
    expect(serviceMock.openPlayerWindow).toHaveBeenCalledWith(frameSourceFor(canvas), dungeon);
    expect(playerWindowStore.getState().presentedTabId).toBe(dungeon);

    // Frames are captured through the renderer so DM-only layers stay out of the player view.
    const source: PlayerFrameSource = serviceMock.openPlayerWindow.mock.calls[0][0];
    const capture = vi.fn();
    const settings = new SettingsService({} as any).getLocalPlayerViewSettings();
    source.withPlayerSafeFrame(capture, settings);
    expect(withPlayerSafeFrame).toHaveBeenCalledWith(capture, settings);
    expect(capture).toHaveBeenCalledTimes(1);
  });

  test('holds the frame while the DM browses another tab and releases it on return', async () => {
    const { view, canvas, atlasStore } = createFakeView();
    const tavern = view.tabMetaStore.getState().addTab('maps/tavern.md', 'Tavern');
    const dungeon = view.tabMetaStore.getState().addTab('maps/dungeon.md', 'Dungeon');
    serviceMock.isWindowOpen.mockReturnValue(true);

    await presentTabInPlayerWindow({} as any, view, tavern);
    expect(serviceMock.presentCanvas).toHaveBeenCalledWith(frameSourceFor(canvas), tavern);

    view.tabMetaStore.getState().setActiveTab(dungeon);
    expect(serviceMock.holdCurrentFrame).toHaveBeenCalledTimes(1);

    atlasStore.setState({ isMapLoading: true });
    view.tabMetaStore.getState().setActiveTab(tavern);
    await flush();
    expect(serviceMock.releaseHeldFrame).not.toHaveBeenCalled();

    atlasStore.setState({ isMapLoading: false });
    await flush();
    expect(serviceMock.releaseHeldFrame).toHaveBeenCalledWith(frameSourceFor(canvas));
  });

  test('presenting another tab re-targets the open window instead of reopening it', async () => {
    const { view, canvas } = createFakeView();
    const tavern = view.tabMetaStore.getState().addTab('maps/tavern.md', 'Tavern');
    const dungeon = view.tabMetaStore.getState().addTab('maps/dungeon.md', 'Dungeon');
    serviceMock.isWindowOpen.mockReturnValue(true);

    await presentTabInPlayerWindow({} as any, view, tavern);
    await presentTabInPlayerWindow({} as any, view, dungeon);

    expect(serviceMock.openPlayerWindow).not.toHaveBeenCalled();
    expect(serviceMock.presentCanvas).toHaveBeenLastCalledWith(frameSourceFor(canvas), dungeon);
    expect(playerWindowStore.getState().presentedTabId).toBe(dungeon);
  });
});
