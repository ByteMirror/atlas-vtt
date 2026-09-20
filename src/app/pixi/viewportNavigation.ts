import type { Viewport } from 'pixi-viewport';
import type { NavigationInputMode, SettingsService } from '../services/SettingsService';

/** The subset of the viewport API needed to switch navigation modes. */
export type NavigableViewport = Pick<Viewport, 'wheel'>;

/**
 * Reconfigures the viewport's `wheel` plugin for the given input mode.
 *
 * The `drag` plugin is installed with its default `wheel: true`, which pans
 * on plain wheel events whenever the `wheel` plugin does not claim them for
 * zooming. So `mouse` mode (wheel always zooms) and `trackpad` mode
 * (scroll pans, Ctrl/Cmd + wheel i.e. pinch zooms) only differ in how the
 * `wheel` plugin is configured.
 */
export function applyNavigationMode(viewport: NavigableViewport, mode: NavigationInputMode): void {
  if (mode === 'trackpad') {
    viewport.wheel({ wheelZoom: false, trackpadPinch: true });
  } else {
    viewport.wheel({ wheelZoom: true, trackpadPinch: false });
  }
}

/**
 * Applies the current navigation mode and keeps the viewport in sync with
 * later settings changes. Returns an unsubscribe function.
 */
export function bindViewportNavigation(viewport: NavigableViewport, settingsService: SettingsService): () => void {
  let currentMode = settingsService.getNavigationSettings().inputMode;
  applyNavigationMode(viewport, currentMode);

  return settingsService.onChange((settings) => {
    if (settings.navigation.inputMode === currentMode) return;
    currentMode = settings.navigation.inputMode;
    applyNavigationMode(viewport, currentMode);
  });
}
