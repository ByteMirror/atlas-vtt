import type * as React from 'react';
import { useEffect, useRef, useState } from 'react';

/** How far inside the window's left edge the pointer opens the floating sidebar. Everything left of the window counts too. */
const EDGE_INSIDE = 24;
/** How long the pointer rests near the edge before the sidebar shows, so passing by does not open it. */
const OPEN_INTENT_MS = 90;
/** Grace period after the pointer leaves the sidebar, so overshooting does not close it. */
const CLOSE_GRACE_MS = 300;
/** Slack around the sidebar that still counts as on it. */
const PANEL_SLACK = 8;

const TEXT_FIELD = 'input, textarea, [contenteditable]:not([contenteditable="false"])';
const CONTROL = 'button, input, textarea, select, a, [role="button"]';

interface SidebarHoverOptions {
  /** Tracks the pointer only while the sidebar floats. */
  enabled: boolean;
  /** Whether a hover opened the sidebar and a hover may close it again. */
  isHoverPeek: boolean;
  /** Whether the sidebar is shown at all (by hover or on purpose). */
  isShown: boolean;
  containerRef: React.RefObject<HTMLElement | null>;
  panelRef: React.RefObject<HTMLElement | null>;
  open: () => void;
  close: () => void;
}

function contains(rect: DOMRect, x: number, y: number, slack: number): boolean {
  return x >= rect.left - slack && x <= rect.right + slack && y >= rect.top - slack && y <= rect.bottom + slack;
}

/**
 * Hover intent for the floating sidebar, read from the pointer position rather
 * than from a strip element, so the target is generous: the window's left edge,
 * a band inside it and the whole margin outside it (overshooting the edge still
 * counts). Controls in that band, like the sidebar button, never open it.
 * Leaving both the band and the sidebar hides a hover peek after a grace period,
 * unless a field in the sidebar has focus. Returns whether the pointer is near
 * the edge, for the hint.
 */
export function useSidebarHover({
  enabled, isHoverPeek, isShown, containerRef, panelRef, open, close,
}: SidebarHoverOptions): boolean {
  const [isNearEdge, setIsNearEdge] = useState(false);
  const state = useRef({ isHoverPeek, isShown, open, close });
  state.current = { isHoverPeek, isShown, open, close };

  useEffect(() => {
    const container = containerRef.current;
    if (!enabled || !container) return;
    const doc = container.ownerDocument;
    const root = container.parentElement ?? container;
    let openTimer: number | null = null;
    let closeTimer: number | null = null;
    const clear = (timer: number | null): null => { if (timer !== null) window.clearTimeout(timer); return null; };

    const hasFocusedField = (): boolean => {
      const active = doc.activeElement;
      return !!active && !!panelRef.current?.contains(active) && active.matches(TEXT_FIELD);
    };

    const scheduleClose = (): void => {
      if (closeTimer !== null || hasFocusedField()) return;
      closeTimer = window.setTimeout(() => { closeTimer = null; state.current.close(); }, CLOSE_GRACE_MS);
    };

    const onPointerMove = (event: PointerEvent): void => {
      const target = event.target as Element | null;
      // Other layers (menus, dialogs) sit above the asset manager.
      const onManager = !!target && root.contains(target);
      const bounds = container.getBoundingClientRect();
      const nearEdge = onManager
        && event.clientX < bounds.left + EDGE_INSIDE
        && event.clientY >= bounds.top && event.clientY <= bounds.bottom
        && !target.closest(CONTROL);
      setIsNearEdge(nearEdge && !state.current.isShown);

      if (!state.current.isShown) {
        if (nearEdge && openTimer === null) {
          openTimer = window.setTimeout(() => { openTimer = null; state.current.open(); }, OPEN_INTENT_MS);
        } else if (!nearEdge) {
          openTimer = clear(openTimer);
        }
        return;
      }
      if (!state.current.isHoverPeek) return;
      const panel = panelRef.current?.getBoundingClientRect();
      const onPanel = !!panel && contains(panel, event.clientX, event.clientY, PANEL_SLACK);
      if (nearEdge || onPanel) closeTimer = clear(closeTimer);
      else scheduleClose();
    };

    const onLeaveWindow = (event: MouseEvent): void => {
      if (event.relatedTarget) return;
      openTimer = clear(openTimer);
      setIsNearEdge(false);
      if (state.current.isShown && state.current.isHoverPeek) scheduleClose();
    };

    doc.addEventListener('pointermove', onPointerMove);
    doc.addEventListener('mouseout', onLeaveWindow);
    return () => {
      clear(openTimer);
      clear(closeTimer);
      doc.removeEventListener('pointermove', onPointerMove);
      doc.removeEventListener('mouseout', onLeaveWindow);
      setIsNearEdge(false);
    };
  }, [enabled, containerRef, panelRef]);

  return isNearEdge;
}
