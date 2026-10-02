/**
 * What a Fantasy Statblocks layout asks of the page, read from the layout's own
 * shape rather than from the class names a particular layout happens to use.
 *
 * Fantasy Statblocks flows the blocks into balanced columns and lets a themer
 * lift the header out of them with CSS. Atlas reaches the same result from the
 * structure: a row of nothing but a heading and its subheading is a title stack,
 * so it reads downwards rather than across, and the artwork takes the layout's
 * own image slot. The header spanning the columns follows from the same rule and
 * is expressed in `statblock.scss` — it is whichever block holds the name.
 */

import type React from 'react';
import type { StatblockItem, StatblockLayout, StatblockMonster } from './statblockTypes';

/** More than three columns never fits a surface Atlas shows statblocks on. */
const MAX_COLUMNS = 3;
/**
 * Fantasy Statblocks' own defaults when neither the creature nor the layout
 * names one. A layout's `columns` is a *cap*, not a request: Fantasy Statblocks
 * fits `floor(width / columnWidth)` columns and clamps them to it, and it caps
 * at two even for a layout that says nothing — which the built-in Basic 5e
 * Layout does. Requiring a layout to declare its columns would leave every
 * creature using a stock layout in one column.
 */
const DEFAULT_MAX_COLUMNS = 2;
const DEFAULT_COLUMN_WIDTH = 400;
/** `column-gap` and the card's padding in `statblock.scss`, which the width must cover. */
const COLUMN_GAP = 24;
const CARD_PADDING = 16;
/**
 * The narrowest a column may be before the browser drops one. Layouts declare a
 * generous width (the 5.5e layout asks 380px), but that is the width they would
 * *like*, and holding out for it would leave a DM screen feed single-column on
 * any ordinary screen. Atlas already treats 340px as readable for a whole
 * statblock (`MIN_FEED_WIDTH`), so a column never needs more.
 */
const READABLE_COLUMN_WIDTH = 340;

function someBlock(items: readonly StatblockItem[] | undefined, match: (item: StatblockItem) => boolean): boolean {
  return (items ?? []).some(
    (item) =>
      match(item) ||
      someBlock(item.nested, match) ||
      (item.conditions ?? []).some((condition) => someBlock(condition.nested, match)),
  );
}

/** Whether the layout has an `image` block the token's artwork can take. */
export function hasImageSlot(layout: StatblockLayout): boolean {
  return someBlock(layout.blocks, (item) => item.type === 'image');
}

/**
 * An `inline` block of nothing but the name and its type/alignment line. Those
 * belong one above the other, never side by side.
 */
export function isTitleRow(item: StatblockItem): boolean {
  const nested = item.nested ?? [];
  return (
    item.type === 'inline' &&
    nested.length > 0 &&
    nested.every((child) => child.type === 'heading' || child.type === 'subheading')
  );
}

/**
 * The column rule for the statblock's flow, as CSS custom properties.
 *
 * `columns: <count> <width>` is responsive on its own: the browser drops to
 * fewer columns whenever the surface is too narrow to give each one its width,
 * which is the same `floor(width / columnWidth)` Fantasy Statblocks measures,
 * so a statblock in a 340px feed stays single-column without a media query.
 * Atlas does not honour `forceColumns`, which holds the column count however
 * cramped: the surfaces here are often narrow, and two 170px columns read as
 * neither.
 *
 * `--atlas-sb-max-width` is the width at which the layout gets every column it
 * asks for, so a surface that sizes itself to its content knows when to stop.
 * Returns undefined when the layout asks for one column, which needs no flow.
 */
export function columnStyle(
  layout: StatblockLayout,
  monster: StatblockMonster = {},
): React.CSSProperties | undefined {
  const columns = Math.min(Math.max(Math.floor(declared(monster.columns, layout.columns) ?? DEFAULT_MAX_COLUMNS), 1), MAX_COLUMNS);
  if (columns < 2) return undefined;

  const width = declared(monster.columnWidth, layout.columnWidth) ?? DEFAULT_COLUMN_WIDTH;
  return {
    '--atlas-sb-columns': columns,
    '--atlas-sb-column-width': `${Math.min(width, READABLE_COLUMN_WIDTH)}px`,
    '--atlas-sb-max-width': `${columns * width + (columns - 1) * COLUMN_GAP + 2 * CARD_PADDING}px`,
  } as React.CSSProperties;
}

/**
 * The first positive number among a creature's own override and its layout's
 * setting, as Fantasy Statblocks reads them. A creature may carry either in its
 * frontmatter or its `statblock` fence, written as a number or as `"380px"`.
 */
function declared(...values: readonly unknown[]): number | undefined {
  for (const value of values) {
    const parsed = typeof value === 'string' ? Number(value.replace(/[^\d.]/g, '')) : value;
    if (typeof parsed === 'number' && Number.isFinite(parsed) && parsed > 0) return parsed;
  }
  return undefined;
}
