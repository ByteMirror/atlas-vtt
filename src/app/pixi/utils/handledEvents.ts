import type { FederatedPointerEvent } from 'pixi.js';

/**
 * Tracks pointer events already claimed by the viewport-level dispatch, so
 * later viewport listeners (marquee selection, note pin tool) can skip them.
 *
 * PIXI v8 pools and reuses FederatedPointerEvent objects, so the dispatcher
 * must call `resetHandled` at the start of every new pointer event.
 */
const handledEvents = new WeakSet<FederatedPointerEvent>();

export function markHandled(event: FederatedPointerEvent): void {
  handledEvents.add(event);
}

export function isHandled(event: FederatedPointerEvent): boolean {
  return handledEvents.has(event);
}

export function resetHandled(event: FederatedPointerEvent): void {
  handledEvents.delete(event);
}
