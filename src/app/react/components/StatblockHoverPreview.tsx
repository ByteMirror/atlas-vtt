import React, { useEffect, useState, useCallback, useRef, useMemo, useLayoutEffect } from 'react';
import { createPortal } from 'react-dom';
import { TFile, App } from 'obsidian';
import FantasyStatblock from './FantasyStatblock';
import type { TokenVitals } from '../../services/statblockVitalsSync';
import './statblock-hover-preview.scss';

export interface StatblockHoverPreviewProps {
  /** Vault path of the linked statblock note */
  notePath: string | null;
  /** Enables click-to-roll on dice notation inside the statblock */
  app?: App | null | undefined;
  /** Token/entry whose HP and stress the statblock should mirror */
  vitals?: TokenVitals | null;
  /** Whether the preview is visible */
  isVisible: boolean;
  /** Whether the preview is in closing animation state */
  isClosing: boolean;
  /** Position to render the preview (viewport coordinates) */
  position: { x: number; y: number } | null;
  /** Optional: anchor element rect for smart positioning */
  anchorRect?: DOMRect | null | undefined;
  /** Optional: preferred side ('left' | 'right') */
  preferredSide?: 'left' | 'right' | undefined;
}

const VIEWPORT_PADDING = 16;
// Small, because the preview box now hugs the statblock card itself.
const ANCHOR_GAP = 12;

function isSameRect(a: DOMRect | null, b: DOMRect | null): boolean {
  if (!a && !b) return true;
  if (!a || !b) return false;

  return a.top === b.top
    && a.left === b.left
    && a.width === b.width
    && a.height === b.height;
}

function isSamePoint(
  a: { x: number; y: number } | null,
  b: { x: number; y: number } | null,
): boolean {
  if (!a && !b) return true;
  if (!a || !b) return false;
  return a.x === b.x && a.y === b.y;
}

/**
 * Calculates smart preview position to center on anchor while avoiding viewport cutoff.
 * Uses actual measured content height for precise positioning.
 */
function calculatePreviewPosition(
  anchorRect: DOMRect | null | undefined,
  position: { x: number; y: number } | null,
  contentHeight: number,
  contentWidth: number,
  preferredSide: 'left' | 'right' = 'left'
): React.CSSProperties {
  const viewportHeight = window.innerHeight;
  const viewportWidth = window.innerWidth;

  /** Vertical placement is the same whichever side the preview ends up on. */
  const verticalFor = (centerY: number): React.CSSProperties => {
    const maxTop = viewportHeight - contentHeight - VIEWPORT_PADDING;
    const top = Math.max(VIEWPORT_PADDING, Math.min(centerY - contentHeight / 2, maxTop));
    return { top, maxHeight: viewportHeight - top - VIEWPORT_PADDING };
  };

  // If we have an anchor rect (e.g., initiative card), position relative to it
  if (anchorRect) {
    const vertical = verticalFor(anchorRect.top + anchorRect.height / 2);

    const fitsLeft = anchorRect.left - ANCHOR_GAP - contentWidth >= VIEWPORT_PADDING;
    const fitsRight =
      anchorRect.right + ANCHOR_GAP + contentWidth <= viewportWidth - VIEWPORT_PADDING;
    const useLeft = preferredSide === 'left' ? fitsLeft || !fitsRight : !fitsRight && fitsLeft;

    if (!useLeft) {
      return { left: anchorRect.right + ANCHOR_GAP, ...vertical };
    }

    // Clamp so the preview cannot be pushed off the left edge when neither
    // side has room for it.
    const maxRight = viewportWidth - contentWidth - VIEWPORT_PADDING;
    return {
      right: Math.min(viewportWidth - anchorRect.left + ANCHOR_GAP, Math.max(0, maxRight)),
      ...vertical,
    };
  }

  // Fallback: position near cursor/point
  if (position) {
    const vertical = verticalFor(position.y);

    let left = position.x + 15;
    if (left + contentWidth > viewportWidth - VIEWPORT_PADDING) {
      left = position.x - contentWidth - 15;
    }
    left = Math.max(VIEWPORT_PADDING, Math.min(left, viewportWidth - contentWidth - VIEWPORT_PADDING));

    return { left, ...vertical };
  }

  return {};
}

/**
 * Shared statblock hover preview. Rendering is delegated to the
 * Fantasy Statblocks plugin; this component only handles positioning.
 */
export function StatblockHoverPreview({
  notePath,
  app,
  vitals,
  isVisible,
  isClosing,
  position,
  anchorRect,
  preferredSide = 'left',
}: StatblockHoverPreviewProps): React.ReactPortal | null {
  const containerRef = useRef<HTMLDivElement>(null);
  const [measured, setMeasured] = useState<{ width: number; height: number }>({
    width: 0,
    height: 0,
  });

  const updateMeasured = useCallback((width: number, height: number): void => {
    const next = { width: Math.ceil(width), height: Math.ceil(height) };
    setMeasured((prev) =>
      prev.width === next.width && prev.height === next.height ? prev : next,
    );
  }, []);

  // Measure content after render, and again whenever the size changes —
  // Fantasy Statblocks mounts asynchronously, so the first measurement is of
  // an empty box.
  useLayoutEffect(() => {
    if (!containerRef.current || (!isVisible && !isClosing)) {
      return;
    }

    const container = containerRef.current;
    const measure = (entries?: ResizeObserverEntry[]): void => {
      const observed = entries?.[0]?.contentRect;
      updateMeasured(
        Math.max(observed?.width ?? 0, container.offsetWidth),
        Math.max(observed?.height ?? 0, container.scrollHeight),
      );
    };
    measure();

    if (typeof ResizeObserver !== 'undefined') {
      const observer = new ResizeObserver((entries) => measure(entries));
      observer.observe(container);
      return () => observer.disconnect();
    }

    return;
  }, [isVisible, isClosing, notePath, updateMeasured]);

  const positionStyles = useMemo(() => {
    if (!isVisible && !isClosing) return {};
    // Fall back to rough defaults until the statblock has actually rendered.
    const height = measured.height > 0 ? measured.height : 400;
    const width = measured.width > 0 ? measured.width : 450;
    return calculatePreviewPosition(anchorRect, position, height, width, preferredSide);
  }, [anchorRect, position, preferredSide, isVisible, isClosing, measured]);

  if ((!isVisible && !isClosing) || !notePath) {
    return null;
  }

  const className = `statblock-hover-preview ${isClosing ? 'statblock-hover-preview--closing' : ''}`;

  return createPortal(
    <div ref={containerRef} className={className} style={positionStyles}>
      {app && (
        <FantasyStatblock notePath={notePath} app={app} tokens={vitals ? [vitals] : []} />
      )}
    </div>,
    document.body
  );
}

/**
 * Props for the useStatblockHoverPreview hook
 */
export interface UseStatblockHoverPreviewOptions {
  /** Obsidian app instance for file access */
  app: App | null;
}

/**
 * State returned by useStatblockHoverPreview hook
 */
export interface StatblockHoverPreviewState<TEntry> {
  /** Whether the preview is currently visible */
  isVisible: boolean;
  /** Whether the preview is in closing animation */
  isClosing: boolean;
  /** Vault path of the statblock note to preview */
  notePath: string | null;
  /** The statblock file */
  statblockFile: TFile | null;
  /** The current hovered entry (whatever the caller previews: a token, an initiative entry, ...) */
  hoveredEntry: TEntry | null;
  /** The anchor rect for positioning */
  anchorRect: DOMRect | null;
  /** Position point for positioning */
  position: { x: number; y: number } | null;
}

/**
 * Actions returned by useStatblockHoverPreview hook
 */
export interface StatblockHoverPreviewActions<TEntry> {
  /** Show preview for an entry with a statblock path */
  showPreview: (entry: TEntry, statblockPath: string, anchorElement?: HTMLElement, position?: { x: number; y: number }) => void;
  /** Close the preview with animation */
  closePreview: () => void;
  /** Clear all state immediately (no animation) */
  clearPreview: () => void;
}

/**
 * Hook for managing statblock hover preview state.
 * Handles CMD+hover logic and animation states.
 */
export function useStatblockHoverPreview<TEntry>(
  options: UseStatblockHoverPreviewOptions
): [StatblockHoverPreviewState<TEntry>, StatblockHoverPreviewActions<TEntry>] {
  const { app } = options;

  const [hoveredEntry, setHoveredEntry] = useState<TEntry | null>(null);
  const [anchorRect, setAnchorRect] = useState<DOMRect | null>(null);
  const [position, setPosition] = useState<{ x: number; y: number } | null>(null);
  const [notePath, setNotePath] = useState<string | null>(null);
  const [statblockFile, setStatblockFile] = useState<TFile | null>(null);
  const [isClosing, setIsClosing] = useState(false);

  const closeTimeoutRef = useRef<number | null>(null);

  const isVisible = hoveredEntry !== null && notePath !== null;

  const showPreview = useCallback((
    entry: TEntry,
    statblockPath: string,
    anchorElement?: HTMLElement,
    positionPoint?: { x: number; y: number }
  ): void => {
    if (closeTimeoutRef.current) {
      window.clearTimeout(closeTimeoutRef.current);
      closeTimeoutRef.current = null;
    }

    setIsClosing(false);

    const nextAnchorRect = anchorElement ? anchorElement.getBoundingClientRect() : null;
    setAnchorRect((prev) => (isSameRect(prev, nextAnchorRect) ? prev : nextAnchorRect));

    const nextPosition = positionPoint || null;
    setPosition((prev) => (isSamePoint(prev, nextPosition) ? prev : nextPosition));

    setHoveredEntry(entry);
    setNotePath(statblockPath);
    const file = app?.vault.getAbstractFileByPath(statblockPath);
    setStatblockFile(file instanceof TFile ? file : null);
  }, [app]);

  const closePreview = useCallback((): void => {
    if (!hoveredEntry) return;

    setIsClosing(true);
    closeTimeoutRef.current = window.setTimeout(() => {
      setHoveredEntry(null);
      setNotePath(null);
      setStatblockFile(null);
      setAnchorRect(null);
      setPosition(null);
      setIsClosing(false);
    }, 150); // Match animation duration
  }, [hoveredEntry]);

  const clearPreview = useCallback((): void => {
    if (closeTimeoutRef.current) {
      window.clearTimeout(closeTimeoutRef.current);
      closeTimeoutRef.current = null;
    }
    setHoveredEntry(null);
    setNotePath(null);
    setStatblockFile(null);
    setAnchorRect(null);
    setPosition(null);
    setIsClosing(false);
  }, []);

  useEffect(() => {
    return () => {
      if (closeTimeoutRef.current) {
        window.clearTimeout(closeTimeoutRef.current);
      }
    };
  }, []);

  // Listen for CMD/Ctrl key release to close preview
  useEffect(() => {
    const handleKeyUp = (e: KeyboardEvent): void => {
      if (e.key === 'Meta' || e.key === 'Control') {
        closePreview();
      }
    };

    window.addEventListener('keyup', handleKeyUp);
    return () => window.removeEventListener('keyup', handleKeyUp);
  }, [closePreview]);

  const state: StatblockHoverPreviewState<TEntry> = {
    isVisible,
    isClosing,
    notePath,
    statblockFile,
    hoveredEntry,
    anchorRect,
    position,
  };

  const actions: StatblockHoverPreviewActions<TEntry> = {
    showPreview,
    closePreview,
    clearPreview,
  };

  return [state, actions];
}

export default StatblockHoverPreview;
