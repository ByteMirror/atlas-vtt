import React, { useLayoutEffect, useRef } from 'react';
import { useVirtualizer } from '@tanstack/react-virtual';
import { useGridMetrics } from '../components/useGridMetrics';
import { TokenPreviewCard } from './TokenPreviewCard';
import type { CreatorMode, TokenPreview, TokenPreviewPatch } from './types';

/** The narrowest a preview card gets. */
const CARD_MIN_WIDTH = 196;
/** A token card's height until its row has been measured. */
const ROW_ESTIMATE = 340;
const OVERSCAN_ROWS = 2;

interface PreviewGridProps {
  previews: readonly TokenPreview[];
  mode: CreatorMode;
  /** The element that scrolls the grid. Passed as state, since a ref of an ancestor is set only after this grid's layout effects. */
  scrollElement: HTMLElement | null;
  onChange: (id: string, patch: TokenPreviewPatch) => void;
  onToggleSelected: (id: string) => void;
  onRemove: (id: string) => void;
}

/**
 * The token creator's previews. Only the rows in and around the view are
 * mounted, so an import of thousands of images stays as quick to show and to
 * scroll as one of a few. Cards of newly added previews animate in; cards
 * scrolled into view show as they are.
 */
export function PreviewGrid({ previews, mode, scrollElement, onChange, onToggleSelected, onRemove }: PreviewGridProps): React.JSX.Element {
  const gridRef = useRef<HTMLDivElement>(null);
  const { columns, gap } = useGridMetrics(gridRef, CARD_MIN_WIDTH);
  const virtualizer = useVirtualizer({
    count: Math.ceil(previews.length / columns),
    getScrollElement: () => scrollElement,
    estimateSize: () => ROW_ESTIMATE,
    overscan: OVERSCAN_ROWS,
    gap,
    scrollMargin: gridRef.current?.offsetTop ?? 0,
  });

  const rows = virtualizer.getVirtualItems();
  // Each card's entrance is decided when it first mounts, so its props stay the same afterwards.
  // Previews count as listed once the grid shows rows: before that there is nothing to scroll to.
  const listed = useRef<ReadonlySet<string>>(new Set());
  const entrances = useRef(new Map<string, number | null>());
  const showsRows = rows.length > 0;
  useLayoutEffect(() => {
    if (!showsRows) return;
    listed.current = new Set(previews.map((preview) => preview.id));
    for (const id of entrances.current.keys()) if (!listed.current.has(id)) entrances.current.delete(id);
  }, [previews, showsRows]);
  let entering = 0;
  const enterIndexOf = (id: string): number | null => {
    let enterIndex = entrances.current.get(id);
    if (enterIndex === undefined) {
      enterIndex = listed.current.has(id) ? null : entering++;
      entrances.current.set(id, enterIndex);
    }
    return enterIndex;
  };

  return (
    <div
      ref={gridRef}
      className="atlas-token-creator__grid"
      style={{ '--atlas-grid-columns': columns, height: virtualizer.getTotalSize() } as React.CSSProperties}
    >
      {rows.map((row) => (
        <div
          key={row.key}
          ref={virtualizer.measureElement}
          data-index={row.index}
          className="atlas-token-creator__grid-row"
          style={{ transform: `translateY(${row.start - virtualizer.options.scrollMargin}px)` }}
        >
          {previews.slice(row.index * columns, (row.index + 1) * columns).map((preview) => (
            <TokenPreviewCard
              key={preview.id}
              preview={preview}
              mode={mode}
              enterIndex={enterIndexOf(preview.id)}
              onChange={onChange}
              onToggleSelected={onToggleSelected}
              onRemove={onRemove}
            />
          ))}
        </div>
      ))}
    </div>
  );
}
