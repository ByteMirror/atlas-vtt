import {
  MOTION_EASE_OUT,
  PANEL_ENTER_FROM,
  PANEL_ENTER_MS,
  PANEL_EXIT_MS,
  PANEL_EXIT_TO,
  prefersReducedMotion,
} from '../utils/motion';

/**
 * Opening and closing motion for panels built with the DOM instead of React, the
 * same as the dialogs' (see dialogMotion.ts). Reduced motion keeps them in place
 * and only fades them.
 */

/** Fades `panel` in as it rises and grows into place, from its `transform-origin`. */
export function animatePanelIn(panel: HTMLElement): void {
  const reduce = prefersReducedMotion(panel);
  panel.animate(
    [
      { opacity: 0, transform: reduce ? 'none' : PANEL_ENTER_FROM },
      { opacity: 1, transform: 'none' },
    ],
    { duration: PANEL_ENTER_MS, easing: MOTION_EASE_OUT },
  );
}

/**
 * Fades `panel` out as it settles back, then removes it and calls `onRemoved`.
 * Clicks pass through it while it leaves, as they would once it is gone.
 */
export function animatePanelOutAndRemove(panel: HTMLElement, onRemoved?: () => void): void {
  panel.addClass('atlas-panel-leaving');
  const reduce = prefersReducedMotion(panel);
  const animation = panel.animate(
    [
      { opacity: 1, transform: 'none' },
      { opacity: 0, transform: reduce ? 'none' : PANEL_EXIT_TO },
    ],
    { duration: PANEL_EXIT_MS, easing: MOTION_EASE_OUT, fill: 'forwards' },
  );
  const remove = (): void => {
    panel.remove();
    onRemoved?.();
  };
  animation.finished.then(remove, remove);
}
