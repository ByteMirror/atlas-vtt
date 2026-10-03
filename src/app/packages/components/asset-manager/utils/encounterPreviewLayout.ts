import type * as React from 'react';

/** The most token portraits an encounter card shows. */
export const ENCOUNTER_PREVIEW_COUNT = 3;

/** Layout of up to three overlapping portraits inside an encounter card. */
export function encounterPreviewStyle(index: number, total: number): React.CSSProperties {
  if (total <= 1) {
    return { width: '62%', height: '62%', top: '19%', left: '19%' };
  }
  if (total === 2) {
    return index === 0
      ? { width: '48%', height: '48%', top: '26%', left: '6%' }
      : { width: '48%', height: '48%', top: '26%', right: '6%' };
  }
  if (index === 0) return { width: '44%', height: '44%', top: '8%', left: '28%' };
  if (index === 1) return { width: '44%', height: '44%', top: '44%', left: '8%' };
  return { width: '44%', height: '44%', top: '44%', right: '8%' };
}
