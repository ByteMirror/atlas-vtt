import type * as React from 'react';
import { useLayoutEffect, useState } from 'react';

/** The narrowest a card gets; the grid fits as many columns as this allows. */
const CARD_MIN_WIDTH = 132;

export interface GridMetrics {
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
export function useGridMetrics(ref: React.RefObject<HTMLElement | null>): GridMetrics {
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
