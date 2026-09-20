import { describe, expect, it, vi } from 'vitest';
import { applyNavigationMode, bindViewportNavigation } from '../../src/app/pixi/viewportNavigation';
import { SettingsService } from '../../src/app/services/SettingsService';

function createMockApp() {
  return {
    vault: {
      adapter: {
        exists: async () => false,
        read: async () => '{}',
        write: async () => undefined,
        mkdir: async () => undefined,
      },
    },
  } as any;
}

function createViewport() {
  return { wheel: vi.fn() };
}

describe('applyNavigationMode', () => {
  it('lets the wheel zoom in mouse mode', () => {
    const viewport = createViewport();
    applyNavigationMode(viewport as any, 'mouse');
    expect(viewport.wheel).toHaveBeenCalledWith({ wheelZoom: true, trackpadPinch: false });
  });

  it('leaves plain scroll to the drag plugin and zooms on pinch in trackpad mode', () => {
    const viewport = createViewport();
    applyNavigationMode(viewport as any, 'trackpad');
    expect(viewport.wheel).toHaveBeenCalledWith({ wheelZoom: false, trackpadPinch: true });
  });
});

describe('bindViewportNavigation', () => {
  it('applies the stored mode immediately and follows later changes', () => {
    const settings = new SettingsService(createMockApp());
    settings.setNavigationSettings({ inputMode: 'mouse' });
    const viewport = createViewport();

    const unbind = bindViewportNavigation(viewport as any, settings);
    expect(viewport.wheel).toHaveBeenLastCalledWith({ wheelZoom: true, trackpadPinch: false });

    settings.setNavigationSettings({ inputMode: 'trackpad' });
    expect(viewport.wheel).toHaveBeenLastCalledWith({ wheelZoom: false, trackpadPinch: true });

    unbind();
    settings.setNavigationSettings({ inputMode: 'mouse' });
    expect(viewport.wheel).toHaveBeenCalledTimes(2);
  });

  it('ignores settings changes that do not alter the navigation mode', () => {
    const settings = new SettingsService(createMockApp());
    const viewport = createViewport();

    bindViewportNavigation(viewport as any, settings);
    settings.setLocalPlayerViewSettings({ showGrid: false });

    expect(viewport.wheel).toHaveBeenCalledTimes(1);
  });
});
