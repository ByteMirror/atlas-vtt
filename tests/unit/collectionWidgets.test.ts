import { afterEach, describe, expect, it, vi } from 'vitest';
import { waitFor } from '@testing-library/react';
import { createInMemoryApp } from '../mocks/inMemoryVault';
import { createViewAtlasStore, type ViewAtlasStore } from '../../src/app/storeFactory';
import { AssetService } from '../../src/app/services/AssetService';
import { WidgetSyncService } from '../../src/app/services/WidgetSyncService';
import { getDataFilePath } from '../../src/app/utils/dataFileMigration';
import {
  pickCollectionWidgets,
  withCollectionWidgets,
  withoutCollectionWidgets,
  type WidgetRecord,
} from '../../src/app/utils/collectionWidgets';
import type { CounterWidget, TimerWidget } from '../../src/app/types/widgetTypes';

const fear: CounterWidget = {
  id: 'fear', type: 'counter', label: 'Fear', icon: 'skull', scope: 'collection',
  visible: true, visibleToPlayers: true, value: 2, order: 0,
};
const torches: CounterWidget = { ...fear, id: 'torches', label: 'Torches', scope: 'scene', order: 1 };
const clock: TimerWidget = {
  id: 'clock', type: 'timer', label: 'Clock', icon: 'hourglass', scope: 'collection',
  visible: true, visibleToPlayers: true, value: 42, duration: 60, direction: 'down', order: 2,
};

describe('collection widget helpers', () => {
  it('picks collection widgets with their current value', () => {
    const shared = pickCollectionWidgets({
      widgets: { fear, torches, clock },
      widgetValues: { fear: 5, torches: 3, clock: 1 },
    });
    expect(Object.keys(shared)).toEqual(['fear', 'clock']);
    expect(shared.fear?.value).toBe(5);
    // Timers keep their running value on the definition
    expect(shared.clock?.value).toBe(42);
  });

  it('replaces only the collection widgets of a scene', () => {
    const stale = { ...fear, id: 'old' };
    const merged = withCollectionWidgets(
      { widgets: { torches, old: stale }, widgetValues: { torches: 3, old: 9 } },
      { fear: { ...fear, value: 6 }, clock },
    );
    expect(Object.keys(merged.widgets).sort()).toEqual(['clock', 'fear', 'torches']);
    expect(merged.widgetValues).toEqual({ torches: 3, fear: 6 });
  });

  it('leaves scenes without collection widgets untouched', () => {
    const scene = { widgets: { torches }, widgetValues: { torches: 3 } };
    expect(withoutCollectionWidgets(scene)).toBe(scene);
    expect(withoutCollectionWidgets({ widgets: { fear, torches }, widgetValues: { fear: 1, torches: 3 } }))
      .toEqual({ widgets: { torches }, widgetValues: { torches: 3 } });
  });
});

describe('scene files', () => {
  it('do not store collection widgets', async () => {
    const { app, files } = createInMemoryApp();
    app.vault.getFileByPath = app.vault.getAbstractFileByPath;
    app.vault.getFolderByPath = app.vault.getAbstractFileByPath;
    const path = 'atlas-vtt/collections/campaign/scenes/cave.atlasmap';
    const store = createViewAtlasStore(app, 'scene-file-test');
    store.getState().setMapPath(path);
    store.getState().addWidget(fear);
    store.getState().addWidget(torches);
    store.getState().setWidgetValue('fear', 4);
    store.getState().setWidgetValue('torches', 1);
    await store.flushStorage();

    await waitFor(() => expect(files.has(getDataFilePath(path))).toBe(true));
    const saved = JSON.parse(files.get(getDataFilePath(path))!);
    expect(Object.keys(saved.state.widgetSettings.widgets)).toEqual(['torches']);
    expect(saved.state.widgetValues).toEqual({ torches: 1 });
  });
});

describe('WidgetSyncService', () => {
  const scenePath = (collection: string, scene: string): string =>
    `atlas-vtt/collections/${collection}/scenes/${scene}.atlasmap`;

  function setup(saved: WidgetRecord = {}): {
    sync: WidgetSyncService;
    open: (viewId: string, mapPath: string) => ViewAtlasStore;
    updateCollectionSettings: ReturnType<typeof vi.fn>;
  } {
    const { app } = createInMemoryApp();
    const updateCollectionSettings = vi.fn(() => Promise.resolve());
    vi.spyOn(AssetService, 'getInstance').mockReturnValue({
      initialize: () => Promise.resolve(),
      getCollectionForMap: (path: string) => path.match(/collections\/([^/]+)\//)?.[1] ?? null,
      getCollectionSettings: (id: string) => ({ conditions: [], ...(id === 'campaign' ? { widgets: saved } : {}) }),
      updateCollectionSettings,
    } as never);
    const sync = new WidgetSyncService({ app } as never);

    const open = (viewId: string, mapPath: string): ViewAtlasStore => {
      const store = createViewAtlasStore(app, viewId);
      store.getState().setPersistenceEnabled(false);
      sync.registerStore(viewId, store);
      store.getState().setMapLoading(true);
      store.getState().setMapPath(mapPath);
      store.getState().setMapLoading(false);
      return store;
    };
    return { sync, open, updateCollectionSettings };
  }

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('adds the collection widgets to a scene when it loads', async () => {
    const { open } = setup({ fear: { ...fear, value: 7 } });
    const cave = open('cave', scenePath('campaign', 'cave'));
    await waitFor(() => expect(cave.getState().widgetValues.fear).toBe(7));
  });

  it('keeps collection widgets on screen while another scene of the collection loads', async () => {
    const { open } = setup({ fear: { ...fear, value: 7 } });
    const view = open('view', scenePath('campaign', 'cave'));
    await waitFor(() => expect(view.getState().widgetValues.fear).toBe(7));
    const shown = view.getState().widgetSettings.widgets.fear;

    // What switching the view's scene tab does to the store
    const state = view.getState();
    state.setMapLoading(true);
    state.setMapPath(scenePath('campaign', 'keep'));
    state.clearMapState();
    expect(view.getState().widgetSettings.widgets.fear).toBe(shown);
    view.setState({
      widgetSettings: { ...view.getState().widgetSettings, widgets: { torches } },
      widgetValues: { torches: 1 },
    });
    expect(view.getState().widgetSettings.widgets.fear).toBe(shown);
    expect(view.getState().widgetValues).toEqual({ torches: 1, fear: 7 });
  });

  it('shares collection widgets with the collection and keeps scene widgets local', async () => {
    const { sync, open, updateCollectionSettings } = setup();
    const cave = open('cave', scenePath('campaign', 'cave'));
    const keep = open('keep', scenePath('campaign', 'keep'));
    const other = open('other', scenePath('side-quest', 'inn'));
    await Promise.resolve();

    cave.getState().addWidget(fear);
    cave.getState().addWidget(torches);
    cave.getState().setWidgetValue('fear', 3);

    expect(keep.getState().widgetSettings.widgets.fear?.scope).toBe('collection');
    expect(keep.getState().widgetValues.fear).toBe(3);
    expect(keep.getState().widgetSettings.widgets.torches).toBeUndefined();
    expect(other.getState().widgetSettings.widgets).toEqual({});

    sync.destroy();
    expect(updateCollectionSettings).toHaveBeenLastCalledWith('campaign', {
      widgets: { fear: { ...fear, value: 3 } },
    });
  });

  it('removes a widget from other scenes once it is no longer shared', async () => {
    const { open } = setup();
    const cave = open('cave', scenePath('campaign', 'cave'));
    const keep = open('keep', scenePath('campaign', 'keep'));
    await Promise.resolve();

    cave.getState().addWidget(fear);
    expect(keep.getState().widgetSettings.widgets.fear).toBeDefined();

    cave.getState().updateWidget('fear', { scope: 'scene' });
    expect(keep.getState().widgetSettings.widgets.fear).toBeUndefined();
    expect(cave.getState().widgetSettings.widgets.fear?.scope).toBe('scene');
  });
});
