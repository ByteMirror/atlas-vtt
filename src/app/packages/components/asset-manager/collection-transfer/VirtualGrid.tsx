import React, { useLayoutEffect, useRef, useState } from 'react';
import { useVirtualizer } from '@tanstack/react-virtual';
import { useTransferScroller } from './transferScroll';

interface VirtualGridProps<T> {
  items: readonly T[];
  /** The narrowest a column gets; the grid fits as many columns as the width allows. */
  minColumnWidth: number;
  rowHeight: number;
  rowGap: number;
  columnGap: number;
  className: string;
  itemKey: (item: T) => string;
  renderItem: (item: T) => React.ReactNode;
}

const OVERSCAN_ROWS = 4;

/** Distance from the top of the scroll content to `element`. */
function offsetWithin(element: HTMLElement, scroller: HTMLElement): number {
  return element.getBoundingClientRect().top - scroller.getBoundingClientRect().top + scroller.scrollTop;
}

/**
 * A grid of equal cells inside the dialog's scrolling pane that mounts only
 * the rows in and around view, so its cost stays flat however many items a
 * collection holds. It scrolls with the pane rather than on its own.
 */
export function VirtualGrid<T>({
  items, minColumnWidth, rowHeight, rowGap, columnGap, className, itemKey, renderItem,
}: VirtualGridProps<T>): React.JSX.Element {
  const scroller = useTransferScroller();
  const ref = useRef<HTMLDivElement>(null);
  const [width, setWidth] = useState(0);
  const [offset, setOffset] = useState(0);

  // Follows the grid's width, and its position as content above it grows or shrinks.
  useLayoutEffect(() => {
    const element = ref.current;
    if (!element) return undefined;
    const measure = (): void => {
      setWidth(element.clientWidth);
      if (scroller) setOffset(offsetWithin(element, scroller));
    };
    measure();
    if (typeof ResizeObserver === 'undefined') return undefined;
    const observer = new ResizeObserver(measure);
    observer.observe(element);
    for (const child of Array.from(scroller?.children ?? [])) observer.observe(child);
    return (): void => observer.disconnect();
  }, [scroller]);

  const columns = Math.max(1, Math.floor((width + columnGap) / (minColumnWidth + columnGap)));
  const virtualizer = useVirtualizer({
    count: Math.ceil(items.length / columns),
    getScrollElement: () => scroller,
    estimateSize: () => rowHeight,
    gap: rowGap,
    overscan: OVERSCAN_ROWS,
    scrollMargin: offset,
  });

  return (
    <div ref={ref} className={`atlas-transfer-vgrid ${className}`} role="list" style={{ height: virtualizer.getTotalSize() }}>
      {virtualizer.getVirtualItems().map((row) => (
        <div
          key={row.key}
          className="atlas-transfer-vgrid__row"
          role="presentation"
          style={{
            height: rowHeight,
            columnGap,
            gridTemplateColumns: `repeat(${columns}, minmax(0, 1fr))`,
            transform: `translateY(${row.start - offset}px)`,
          }}
        >
          {items.slice(row.index * columns, (row.index + 1) * columns).map((item) => (
            <React.Fragment key={itemKey(item)}>{renderItem(item)}</React.Fragment>
          ))}
        </div>
      ))}
    </div>
  );
}
