/**
 * Scrolls `container`, and nothing else, until `element` shows: with its top at the container's
 * (`start`), or no farther than it takes (`nearest`). `scrollIntoView` scrolls every ancestor
 * that can scroll, the map view around a panel included.
 */
export function scrollWithin(container: HTMLElement, element: Element, block: 'start' | 'nearest'): void {
  const box = container.getBoundingClientRect();
  const rect = element.getBoundingClientRect();
  const fromTop = rect.top - box.top;
  const pastBottom = rect.bottom - box.bottom;
  if (block === 'start' || fromTop < 0) container.scrollTop += fromTop;
  // Never so far that the element's top leaves the container
  else if (pastBottom > 0) container.scrollTop += Math.min(pastBottom, fromTop);
}
