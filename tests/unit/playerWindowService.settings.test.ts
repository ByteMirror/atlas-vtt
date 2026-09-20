import { afterEach, describe, expect, it, vi } from 'vitest';
import { createStore } from 'zustand/vanilla';
import { SettingsService } from '../../src/app/services/SettingsService';
import { PlayerWindowService } from '../../src/app/services/PlayerWindowService';

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

  it('passes the latest settings to every live frame capture', () => {
    vi.useFakeTimers();
    vi.stubGlobal('requestAnimationFrame', vi.fn(() => 1));
    vi.stubGlobal('cancelAnimationFrame', vi.fn());
    const settings = new SettingsService(app);
    const service = new PlayerWindowService(app, createStore(() => ({})) as any, settings);
    const doc = document.implementation.createHTMLDocument();
    const target = doc.createElement('canvas'); target.id = 'atlas-player-canvas'; doc.body.append(target);
    vi.spyOn(target, 'getContext').mockReturnValue({ clearRect: vi.fn(), drawImage: vi.fn() } as any);
    (service as any).playerWindow = { document: doc, closed: false, removeEventListener: vi.fn(), close: vi.fn() };
    const capture = vi.fn();
    (service as any).streamSource = { canvas: document.createElement('canvas'), withPlayerSafeFrame: capture };
    (service as any).startMirroring();
    vi.mocked(requestAnimationFrame).mock.calls.at(-1)![0](40);
    expect(capture).toHaveBeenLastCalledWith(expect.any(Function), settings.getLocalPlayerViewSettings());
    settings.setLocalPlayerViewSettings({ showGrid: false, showTokenHP: true });
    const nextFrame = vi.mocked(requestAnimationFrame).mock.calls.at(-1)![0];
    nextFrame(80);
    expect(capture).toHaveBeenLastCalledWith(expect.any(Function), settings.getLocalPlayerViewSettings());
  });
});
