import { useEffect } from 'react';

/**
 * Writes the width of `element`'s scrollbar gutter to `--atlas-scrollbar-gutter`,
 * which the `atlas-scroll-padding` mixin takes off the inline-end padding.
 * Overlay scrollbars take no space, so their gutter measures 0.
 */
export function useScrollbarGutter(element: HTMLElement | null): void {
  useEffect(() => {
    if (!element) return undefined;
    const update = (): void => {
      const style = getComputedStyle(element);
      const borders = parseFloat(style.borderLeftWidth) + parseFloat(style.borderRightWidth);
      const gutter = Math.max(0, element.offsetWidth - element.clientWidth - borders);
      element.style.setProperty('--atlas-scrollbar-gutter', `${gutter}px`);
    };
    update();
    if (typeof ResizeObserver === 'undefined') return undefined;
    // The border box changes with the window and the zoom level, not with the padding set here.
    const observer = new ResizeObserver(update);
    observer.observe(element, { box: 'border-box' });
    return (): void => {
      observer.disconnect();
      element.style.removeProperty('--atlas-scrollbar-gutter');
    };
  }, [element]);
}
