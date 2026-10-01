import React, { useLayoutEffect, useRef, useState } from 'react';
import { observeResize } from '../../../utils/observeResize';
import { FEED_GAP, feedLayout, placeInFeeds } from './feedLayout';

interface StatblockFeedsProps {
  children: React.ReactNode;
}

function sameNumbers(a: readonly number[], b: readonly number[]): boolean {
  return a.length === b.length && a.every((value, index) => value === b[index]);
}

/**
 * Lays its children out as feeds beside each other, masonry style. It measures the pane and
 * every child and places them itself, so each child keeps one parent whatever feed it lands in:
 * a statblock is never remounted (and loaded again) when it changes feed.
 */
export function StatblockFeeds({ children }: StatblockFeedsProps): React.JSX.Element {
  const paneRef = useRef<HTMLDivElement>(null);
  const [paneWidth, setPaneWidth] = useState(0);
  const [heights, setHeights] = useState<number[] | null>(null);

  const items = React.Children.toArray(children);
  const itemCount = items.length;
  const { count, width } = feedLayout(paneWidth, itemCount);
  const { placements, height } = placeInFeeds(items.map((_, index) => heights?.[index] ?? 0), count);

  useLayoutEffect(() => {
    const pane = paneRef.current;
    if (!pane) return undefined;

    const measure = (): void => {
      // Layout sizes ignore the DM screen's entrance animation, which scales the whole panel.
      setPaneWidth(pane.clientWidth);
      const feedItems = pane.querySelectorAll<HTMLElement>(':scope > .atlas-dm-statblock-feed-item');
      const next = Array.from(feedItems, (item) => item.offsetHeight);
      setHeights((current) => (current && sameNumbers(current, next) ? current : next));
    };
    measure();
    return observeResize([pane, ...pane.children], measure);
  }, [itemCount]);

  return (
    <div
      ref={paneRef}
      className="atlas-dm-statblock-feeds"
      data-measured={heights !== null}
      style={{ height: `${height}px` }}
    >
      {items.map((item, index) => {
        const { feed, top } = placements[index] ?? { feed: 0, top: 0 };
        return (
          <div
            key={React.isValidElement(item) ? item.key : index}
            className="atlas-dm-statblock-feed-item"
            style={{
              width: `${width}px`,
              left: `${feed * (width + FEED_GAP)}px`,
              top: `${top}px`,
            }}
          >
            {item}
          </div>
        );
      })}
    </div>
  );
}
