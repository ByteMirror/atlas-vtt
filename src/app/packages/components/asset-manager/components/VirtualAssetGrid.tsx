import React, { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { useVirtualizer } from '@tanstack/react-virtual';
import { AnimatePresence, motion } from 'framer-motion';
import type { AnyAsset } from '../types';
import { useGridMetrics } from './useGridMetrics';
import { cellTransform, enterTransition, exitingCell, hiddenCell, moveTransition } from './gridMotion';

/** Name row, paddings and inner gap below the square artwork, until a card has been measured. */
const CARD_EXTRA_HEIGHT = 44;
/**
 * The measured height below the artwork per asset type, kept across mounts so a
 * grid shown again (another tab, folder or search) lays its rows out right from
 * its first frame instead of shifting them once a card is measured.
 */
const cardExtraHeights = new Map<AnyAsset['type'], number>();
const OVERSCAN_ROWS = 2;
const CELL_CLASS = 'atlas-asset-grid-cell';

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
  /** Animates the first cards in, for a grid that mounts into content already on screen. */
  appear?: boolean;
}

/**
 * Asset grid that only mounts the rows in and around the viewport, so the
 * cost of the library stays flat however many assets it holds.
 *
 * Every card is a direct child placed by its own transform, so a card keeps
 * its element when the order changes and can glide to its new cell. Cards
 * that mount because the list changed fade in; cards that mount because the
 * user scrolled appear as they are.
 */
export function VirtualAssetGrid({
  assets, scrollElement, renderCard, onBackgroundClick, appear = false,
}: VirtualAssetGridProps): React.JSX.Element {
  const containerRef = useRef<HTMLDivElement>(null);
  const { columns, gap, cardWidth } = useGridMetrics(containerRef);
  const assetType = assets[0]?.type;
  const [extraHeight, setExtraHeight] = useState(() => (assetType && cardExtraHeights.get(assetType)) ?? CARD_EXTRA_HEIGHT);
  const rowHeight = cardWidth + extraHeight;
  const rowPitch = rowHeight + gap;

  const virtualizer = useVirtualizer({
    count: Math.ceil(assets.length / columns),
    getScrollElement: () => scrollElement,
    estimateSize: () => rowHeight,
    overscan: OVERSCAN_ROWS,
    gap,
    scrollMargin: containerRef.current?.offsetTop ?? 0,
  });

  // Every row is as tall as a card; drop the sizes computed for the previous height.
  useEffect(() => {
    virtualizer.measure();
  }, [rowHeight, virtualizer]);

  const rows = virtualizer.getVirtualItems();
  const scrollMargin = virtualizer.options.scrollMargin;

  const listKey = useMemo(() => assets.map((asset) => asset.id).join('\n'), [assets]);
  const settledListKey = useRef<string | null>(appear ? null : listKey);
  const shownIds = useRef<ReadonlySet<string>>(new Set());
  const listChanged = settledListKey.current !== listKey;
  const firstVisibleRow = rowPitch > 0 ? Math.floor(((virtualizer.scrollOffset ?? 0) - scrollMargin) / rowPitch) : 0;

  const visibleAssets = rows.flatMap((row) =>
    assets.slice(row.index * columns, (row.index + 1) * columns).map((asset, column) => ({
      asset, column, row: row.index, y: row.start - scrollMargin,
    })),
  );

  useEffect(() => {
    shownIds.current = new Set(visibleAssets.map(({ asset }) => asset.id));
    // A list is settled once it has been on screen; the first render has no scroll element yet.
    if (visibleAssets.length > 0 || assets.length === 0) settledListKey.current = listKey;
  });

  // Cards of one type share a height; measure it once one is on screen.
  const hasCards = visibleAssets.length > 0;
  useLayoutEffect(() => {
    const card = containerRef.current?.querySelector<HTMLElement>(`.${CELL_CLASS}`);
    if (!card?.offsetHeight || !assetType) return;
    const measured = card.offsetHeight - cardWidth;
    cardExtraHeights.set(assetType, measured);
    setExtraHeight(measured);
  }, [cardWidth, hasCards, assetType]);

  return (
    <div
      ref={containerRef}
      className="atlas-asset-grid-virtual"
      style={{ height: virtualizer.getTotalSize() }}
      onClick={onBackgroundClick}
    >
      <AnimatePresence>
        {visibleAssets.map(({ asset, column, row, y }) => {
          const x = column * (cardWidth + gap);
          const entering = listChanged && !shownIds.current.has(asset.id);
          return (
            <motion.div
              key={asset.id}
              className={CELL_CLASS}
              style={{ width: cardWidth }}
              initial={entering ? hiddenCell(x, y) : false}
              animate={{ opacity: 1, transform: cellTransform(x, y) }}
              exit={exitingCell(x, y)}
              transition={entering ? enterTransition(row - firstVisibleRow + column) : moveTransition(listChanged)}
            >
              {renderCard(asset)}
            </motion.div>
          );
        })}
      </AnimatePresence>
    </div>
  );
}
