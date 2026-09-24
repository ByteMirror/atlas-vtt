import { useEffect } from 'react';

/** How long the scrollbar stays after the last scroll before it fades. */
const IDLE_MS = 800;

/**
 * Marks `element` with `data-scrolling` while it scrolls and a moment after,
 * which the `atlas-scrollbar-while-scrolling` mixin shows the scrollbar for.
 * The attribute is set on the element directly, so scrolling never re-renders.
 */
export function useScrollActivity(element: HTMLElement | null): void {
  useEffect(() => {
    if (!element) return undefined;
    let timer: number | undefined;
    const onScroll = (): void => {
      element.setAttribute('data-scrolling', '');
      window.clearTimeout(timer);
      timer = window.setTimeout(() => element.removeAttribute('data-scrolling'), IDLE_MS);
    };
    element.addEventListener('scroll', onScroll, { passive: true });
    return (): void => {
      element.removeEventListener('scroll', onScroll);
      window.clearTimeout(timer);
      element.removeAttribute('data-scrolling');
    };
  }, [element]);
}
