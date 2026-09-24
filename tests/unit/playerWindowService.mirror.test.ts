import { afterEach, describe, expect, it, vi } from 'vitest';
import { createStore } from 'zustand/vanilla';
import { SettingsService } from '../../src/app/services/SettingsService';
import { PlayerWindowService } from '../../src/app/services/PlayerWindowService';

vi.mock('../../src/app/atlas-view', () => ({ AtlasView: class {}, ATLAS_VIEW_TYPE: 'atlas-vtt' }));

const app = { vault: { adapter: { exists: async () => true, write: async () => {} } } } as any;
afterEach(() => { PlayerWindowService.getInstance()?.destroy(); vi.unstubAllGlobals(); vi.restoreAllMocks(); });

/** A service mirroring into a fake popout; `nextFrame` runs the popout's pending animation frame. */
function mirror(getRenderedFrames?: () => number): { capture: ReturnType<typeof vi.fn>; nextFrame: () => void; settings: SettingsService; service: PlayerWindowService } {
  vi.stubGlobal('requestAnimationFrame', vi.fn(() => 1));
  vi.stubGlobal('cancelAnimationFrame', vi.fn());
  const settings = new SettingsService(app);
  const service = new PlayerWindowService(app, createStore(() => ({})) as any, settings);
  const doc = document.implementation.createHTMLDocument();
  // setupPlayerWindow creates the target canvas; jsdom has no 2D context
  vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue({ clearRect: vi.fn(), drawImage: vi.fn() } as any);
  Object.defineProperty(doc, 'readyState', { value: 'complete' });
  (service as any).playerWindow = {
    document: doc, closed: false, requestAnimationFrame, cancelAnimationFrame,
    addEventListener: vi.fn(), removeEventListener: vi.fn(), close: vi.fn(),
  };
  const capture = vi.fn();
  (service as any).streamSource = { canvas: document.createElement('canvas'), withPlayerSafeFrame: capture, getRenderedFrames };
  (service as any).setupPlayerWindow();
  const nextFrame = (): void => vi.mocked(requestAnimationFrame).mock.calls.at(-1)![0](0);
  return { capture, nextFrame, settings, service };
}

describe('player window mirroring', () => {
  it('copies a live frame only after the DM canvas rendered a new one', () => {
    let frames = 1;
    const { capture, nextFrame } = mirror(() => frames);
    expect(capture).toHaveBeenCalledTimes(1);

    nextFrame();
    nextFrame();
    expect(capture).toHaveBeenCalledTimes(1);

    frames = 2;
    nextFrame();
    expect(capture).toHaveBeenCalledTimes(2);
  });

  it('copies again when player view settings change, even without a new DM frame', () => {
    const { capture, nextFrame, settings } = mirror(() => 1);
    capture.mockClear();

    settings.setLocalPlayerViewSettings({ showGrid: false });
    nextFrame();

    expect(capture).toHaveBeenCalled();
  });

  it('drops a closing view but keeps showing its last frame', () => {
    const { capture, nextFrame, service } = mirror(() => 1);
    const source = (service as any).streamSource;
    source.store = createStore(() => ({}));

    service.releaseSource(source.store);
    nextFrame();

    expect((service as any).streamSource.store).toBeUndefined();
    expect(service.isWindowOpen()).toBe(true);
    expect(capture).toHaveBeenCalledTimes(1);
  });

  it('copies every frame for sources that do not report renders', () => {
    const { capture, nextFrame } = mirror();
    nextFrame();
    nextFrame();
    expect(capture).toHaveBeenCalledTimes(3);
  });
});
