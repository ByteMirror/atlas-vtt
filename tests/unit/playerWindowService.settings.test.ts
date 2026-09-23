import { afterEach, describe, expect, it, vi } from 'vitest';
import { createStore } from 'zustand/vanilla';
import { SettingsService } from '../../src/app/services/SettingsService';
import { PlayerWindowService } from '../../src/app/services/PlayerWindowService';

vi.mock('../../src/app/atlas-view', () => ({ AtlasView: class {}, ATLAS_VIEW_TYPE: 'atlas-vtt' }));

const app = { vault: { adapter: { exists: async () => true, write: async () => {} } } } as any;
afterEach(() => { PlayerWindowService.getInstance()?.destroy(); vi.useRealTimers(); vi.unstubAllGlobals(); });

describe('live player settings', () => {
  it('updates widgets immediately and releases the settings listener on close', () => {
    vi.useFakeTimers();
    const settings = new SettingsService(app);
    const store = createStore(() => ({ widgetSettings: { globalVisible: true, position: 'top', widgets: {
      counter: { id: 'counter', type: 'counter', icon: 'shield', label: 'Counter', value: 3, visible: true, visibleToPlayers: true, order: 0 },
    } } }));
    const service = new PlayerWindowService(app, store as any, settings);
    const doc = document.implementation.createHTMLDocument();
    const popout = { document: doc, closed: false, addEventListener: vi.fn(), removeEventListener: vi.fn(), close: vi.fn() };
    Object.defineProperty(doc, 'readyState', { value: 'complete' });
    (service as any).playerWindow = popout;
    (service as any).setupPlayerWindow();
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
    const counter = (label: string, value: number) => ({ widgetValues: {}, widgetSettings: { globalVisible: true, position: 'top', widgets: {
      counter: { id: 'counter', type: 'counter', icon: 'shield', label, value, visible: true, visibleToPlayers: true, order: 0 },
    } } });
    const store = createStore(() => counter('Presented', 3));
    const service = new PlayerWindowService(app, store as any, settings);
    const doc = document.implementation.createHTMLDocument();
    Object.defineProperty(doc, 'readyState', { value: 'complete' });
    (service as any).playerWindow = { document: doc, closed: false, addEventListener: vi.fn(), removeEventListener: vi.fn(), close: vi.fn() };
    (service as any).setupPlayerWindow();
    const widgets = doc.getElementById('atlas-player-widgets')!;
    store.setState({ widgetValues: { counter: 4 } });
    expect(widgets.textContent).toBe('4Presented');
    service.holdCurrentFrame();
    // Switching tabs loads the other map, with the same default widget ids, into the same store.
    store.setState({ ...counter('Browsed', 9), widgetValues: { counter: 9 } });
    expect(widgets.textContent).toBe('4Presented');
    store.setState({ widgetSettings: { ...store.getState().widgetSettings, globalVisible: false } });
    expect(widgets.textContent).toBe('4Presented');
    const otherView = createStore(() => counter('Other view', 7));
    service.presentCanvas({ canvas: document.createElement('canvas'), store: otherView as any, withPlayerSafeFrame: vi.fn() }, 'scene-b');
    expect(widgets.textContent).toBe('7Other view');
    otherView.setState({ widgetValues: { counter: 8 } });
    expect(widgets.textContent).toBe('8Other view');
    store.setState({ widgetValues: { counter: 1 } });
    expect(widgets.textContent).toBe('8Other view');
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
    expect(capture).toHaveBeenLastCalledWith(expect.any(Function), settings.getLocalPlayerViewSettings());
    settings.setLocalPlayerViewSettings({ showGrid: false, showTokenHP: true });
    const nextFrame = vi.mocked(requestAnimationFrame).mock.calls.at(-1)![0];
    capture.mockClear();
    nextFrame(56);
    expect(capture).toHaveBeenCalledTimes(1);
    expect(capture).toHaveBeenLastCalledWith(expect.any(Function), settings.getLocalPlayerViewSettings());
  });
});
