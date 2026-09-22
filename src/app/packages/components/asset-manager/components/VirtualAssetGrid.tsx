import React, { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { useVirtualizer } from '@tanstack/react-virtual';
import type { AnyAsset } from '../types';

/** Must match the `minmax()` lower bound of `.atlas-asset-grid` in `_grid-and-folders.scss`. */
const CARD_MIN_WIDTH = 132;
/** Name row, paddings and inner gap below the square artwork; rows are measured once rendered. */
const CARD_EXTRA_HEIGHT = 44;
const OVERSCAN_ROWS = 2;

interface GridMetrics {
  columns: number;
  gap: number;
  cardWidth: number;
}

function measureGrid(element: HTMLElement): GridMetrics {
  const width = element.clientWidth;
  const gap = parseFloat(getComputedStyle(element).columnGap) || 0;
  const columns = Math.max(1, Math.floor((width + gap) / (CARD_MIN_WIDTH + gap)));
  return { columns, gap, cardWidth: Math.max(0, (width - gap * (columns - 1)) / columns) };
}

function sameMetrics(a: GridMetrics, b: GridMetrics): boolean {
  return a.columns === b.columns && a.gap === b.gap && a.cardWidth === b.cardWidth;
}

/** Column count and card size of the grid, following the container's width. */
function useGridMetrics(ref: React.RefObject<HTMLElement | null>): GridMetrics {
  const [metrics, setMetrics] = useState<GridMetrics>({ columns: 1, gap: 0, cardWidth: CARD_MIN_WIDTH });
  useLayoutEffect(() => {
    const element = ref.current;
    if (!element) return;
    const update = (): void => {
      setMetrics((previous) => {
        const next = measureGrid(element);
        return sameMetrics(previous, next) ? previous : next;
      });
    };
    update();
    if (typeof ResizeObserver === 'undefined') return;
    const observer = new ResizeObserver(update);
    observer.observe(element);
    return () => observer.disconnect();
  }, [ref]);
  return metrics;
}

export interface VirtualAssetGridProps {
  assets: AnyAsset[];
  /**
   * The scrolling ancestor; the grid may sit below other content inside it.
   * Passed as state rather than a ref because an ancestor's ref is attached
   * only after this component's layout effects have run.
   */
  scrollElement: HTMLElement | null;
  renderCard: (asset: AnyAsset) => React.ReactNode;
  onBackgroundClick: (event: React.MouseEvent) => void;
}

/**
 * Asset grid that only mounts the rows in and around the viewport, so the
 * cost of the library stays flat however many assets it holds.
 */
export function VirtualAssetGrid({ assets, scrollElement, renderCard, onBackgroundClick }: VirtualAssetGridProps): React.JSX.Element {
  const containerRef = useRef<HTMLDivElement>(null);
  const { columns, gap, cardWidth } = useGridMetrics(containerRef);
  const rowCount = Math.ceil(assets.length / columns);

  const virtualizer = useVirtualizer({
    count: rowCount,
    getScrollElement: () => scrollElement,
    estimateSize: () => cardWidth + CARD_EXTRA_HEIGHT,
    overscan: OVERSCAN_ROWS,
    gap,
    scrollMargin: containerRef.current?.offsetTop ?? 0,
  });

  // Row heights change with the column count; drop the measurements taken for the old layout.
  useEffect(() => {
    virtualizer.measure();
  }, [columns, virtualizer]);

  const rowStyle = (start: number): React.CSSProperties => ({
    transform: `translateY(${start - virtualizer.options.scrollMargin}px)`,
    '--atlas-grid-columns': columns,
  } as React.CSSProperties);

  return (
    <div
      ref={containerRef}
      className="atlas-asset-grid-virtual"
      style={{ height: virtualizer.getTotalSize() }}
      onClick={onBackgroundClick}
    >
      {virtualizer.getVirtualItems().map((row) => (
        <div
          key={row.key}
          data-index={row.index}
          ref={virtualizer.measureElement}
          className="atlas-asset-grid atlas-asset-grid-row"
          style={rowStyle(row.start)}
          onClick={onBackgroundClick}
        >
          {assets.slice(row.index * columns, (row.index + 1) * columns).map(renderCard)}
        </div>
      ))}
    </div>
  );
}
