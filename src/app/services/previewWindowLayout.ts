import type { PreviewWindowLayout } from '../stores/pinnedNotePreviewSlice';

/** Where a preview window currently sits and how large it is. */
export function readPreviewWindowLayout(element: HTMLElement): PreviewWindowLayout {
  return {
    left: element.offsetLeft,
    top: element.offsetTop,
    width: element.offsetWidth,
    height: element.offsetHeight,
  };
}

/**
 * Restores a saved layout. A window that has shrunk since it was saved pulls
 * the preview back inside, so it can never reopen out of reach.
 */
export function applyPreviewWindowLayout(element: HTMLElement, layout: PreviewWindowLayout): void {
  const width = Math.min(layout.width, window.innerWidth);
  const height = Math.min(layout.height, window.innerHeight);
  element.style.width = `${width}px`;
  element.style.height = `${height}px`;
  element.style.left = `${clamp(layout.left, 0, window.innerWidth - width)}px`;
  element.style.top = `${clamp(layout.top, 0, window.innerHeight - height)}px`;
}

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(value, max));
}
