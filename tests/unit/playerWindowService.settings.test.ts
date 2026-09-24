import { afterEach, describe, expect, it, vi } from 'vitest';
import { createStore, type StoreApi } from 'zustand/vanilla';
import { SettingsService } from '../../src/app/services/SettingsService';
import { PlayerWindowService, type PlayerFrameSource } from '../../src/app/services/PlayerWindowService';
import type { ViewAtlasState } from '../../src/app/storeFactory';
import { attachFakePlayerWindow } from '../mocks/playerPopout';

vi.mock('../../src/app/atlas-view', () => ({ AtlasView: class {}, ATLAS_VIEW_TYPE: 'atlas-vtt' }));

const app = { vault: { adapter: { exists: async () => true, write: async () => {} } } } as any;
afterEach(() => { PlayerWindowService.getInstance()?.destroy(); vi.useRealTimers(); vi.unstubAllGlobals(); vi.restoreAllMocks(); });

type CounterScene = Pick<ViewAtlasState, 'widgetValues' | 'widgetSettings'>;

function counterScene(label: string, value: number): CounterScene {
  return { widgetValues: {}, widgetSettings: { globalVisible: true, position: 'top', scale: 1, widgets: {
    counter: { id: 'counter', type: 'counter', icon: 'shield', label, value, visible: true, visibleToPlayers: true, order: 0 },
  } } } as CounterScene;
}

/** A frame source for `store`; jsdom has no 2D context, so mirroring stays idle. */
function sourceFor(store: StoreApi<CounterScene>): PlayerFrameSource {
  vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue(null);
  return { canvas: createEl('canvas'), store: store as unknown as StoreApi<ViewAtlasState>, withPlayerSafeFrame: vi.fn() };
}

describe('live player settings', () => {
  it('updates widgets immediately and releases the settings listener on close', () => {
    vi.useFakeTimers();
    const settings = new SettingsService(app);
    const store = createStore(() => counterScene('Counter', 3));
    const source = sourceFor(store);
    const service = new PlayerWindowService(app, source.store!, settings);
    const doc = attachFakePlayerWindow(service, source);
    expect(doc.getElementById('atlas-player-info')).toBeNull();
    expect(doc.getElementById('atlas-player-fps')).toBeNull();
    const widgets = doc.getElementById('atlas-player-widgets')!;
    expect(widgets.textContent).toContain('Counter');
    settings.setLocalPlayerViewSettings({ showWidgets: false });
    expect(widgets.childElementCount).toBe(0);
    settings.setLocalPlayerViewSettings({ showWidgets: true });
    expect(widgets.textContent).toContain('Counter');
    expect(widgets.querySelectorAll('.atlas-widget-bar')).toHaveLength(1);
    service.destroy();
    settings.setLocalPlayerViewSettings({ showWidgets: false });
    expect(widgets.textContent).toContain('Counter');
  });

  it('keeps the presented map\'s widgets while the DM browses another map and follows a newly presented one', () => {
    vi.useFakeTimers();
    const settings = new SettingsService(app);
    const store = createStore(() => counterScene('Presented', 3));
    const source = sourceFor(store);
    const service = new PlayerWindowService(app, source.store!, settings);
    const doc = attachFakePlayerWindow(service, source);
    const widgets = doc.getElementById('atlas-player-widgets')!;
    store.setState({ widgetValues: { counter: 4 } });
    expect(widgets.textContent).toBe('4Presented');
    service.holdCurrentFrame();
    // Switching tabs loads the other map, with the same default widget ids, into the same store.
    store.setState({ ...counterScene('Browsed', 9), widgetValues: { counter: 9 } });
    expect(widgets.textContent).toBe('4Presented');
    store.setState({ widgetSettings: { ...store.getState().widgetSettings, globalVisible: false } });
    expect(widgets.textContent).toBe('4Presented');
    const otherView = createStore(() => counterScene('Other view', 7));
    service.presentCanvas(sourceFor(otherView), 'scene-b');
    expect(widgets.textContent).toBe('7Other view');
    otherView.setState({ widgetValues: { counter: 8 } });
    expect(widgets.textContent).toBe('8Other view');
    store.setState({ widgetValues: { counter: 1 } });
    expect(widgets.textContent).toBe('8Other view');
  });

  it('keeps the presented map when the DM switches tabs before the popout has loaded', () => {
    vi.useFakeTimers();
    const settings = new SettingsService(app);
    const store = createStore(() => counterScene('Presented', 3));
    const source = sourceFor(store);
    const service = new PlayerWindowService(app, source.store!, settings);
    const doc = document.implementation.createHTMLDocument();
    Object.defineProperty(doc, 'readyState', { value: 'loading', configurable: true });
    const addEventListener = vi.fn();
    Object.defineProperty(doc.body, 'win', { value: {
      document: doc, closed: false, addEventListener, removeEventListener: vi.fn(), close: vi.fn(),
    } });
    service.attachToView({ contentEl: doc.body, updateSession: vi.fn() } as never, source, 'scene-a');
    service.holdCurrentFrame();
    store.setState(counterScene('Browsed', 9));
    Object.defineProperty(doc, 'readyState', { value: 'complete' });
    const onLoad = addEventListener.mock.calls.find(([type]) => type === 'load')![1] as () => void;
    onLoad();
    expect(doc.getElementById('atlas-player-widgets')?.textContent).toBe('3Presented');
  });

  it('passes the latest settings to every live frame capture', () => {
    vi.useFakeTimers();
    vi.stubGlobal('requestAnimationFrame', vi.fn(() => 1));
    vi.stubGlobal('cancelAnimationFrame', vi.fn());
    const settings = new SettingsService(app);
    const service = new PlayerWindowService(app, createStore(() => ({})) as any, settings);
    const doc = document.implementation.createHTMLDocument();
    const target = doc.createElement('canvas'); target.id = 'atlas-player-canvas'; doc.body.append(target);
    vi.spyOn(target, 'getContext').mockReturnValue({ clearRect: vi.fn(), drawImage: vi.fn() } as any);
    (service as any).playerWindow = { document: doc, closed: false, requestAnimationFrame, cancelAnimationFrame, removeEventListener: vi.fn(), close: vi.fn() };
    const capture = vi.fn();
    (service as any).streamSource = { canvas: document.createElement('canvas'), withPlayerSafeFrame: capture };
    (service as any).startMirroring();
    vi.mocked(requestAnimationFrame).mock.calls.at(-1)![0](40);
    expect(capture).toHaveBeenLastCalledWith(expect.any(Function), settings.getLocalPlayerViewSettings(), undefined);
    settings.setLocalPlayerViewSettings({ showGrid: false, showTokenHP: true });
    const nextFrame = vi.mocked(requestAnimationFrame).mock.calls.at(-1)![0];
    capture.mockClear();
    nextFrame(56);
    expect(capture).toHaveBeenCalledTimes(1);
    expect(capture).toHaveBeenLastCalledWith(expect.any(Function), settings.getLocalPlayerViewSettings(), undefined);
  });
});
