/**
 * How Atlas presents a Fantasy Statblocks layout.
 *
 * - `atlas`: Atlas' own reading of the layout — one column, the token portrait
 *   floated top right, inline stats as a label-over-value strip. Compact, and
 *   suited to the narrow surfaces statblocks appear on (hover previews).
 * - `source`: the layout as Fantasy Statblocks itself would lay it out — the
 *   column count and column width the layout declares, a full-width header, and
 *   inline stats as ordinary label + value lines. Atlas' colours either way.
 */
export type StatblockPresentation = 'atlas' | 'source';

export const STATBLOCK_PRESENTATIONS: readonly StatblockPresentation[] = ['atlas', 'source'];

export const DEFAULT_STATBLOCK_PRESENTATION: StatblockPresentation = 'source';

export function isStatblockPresentation(value: unknown): value is StatblockPresentation {
  return value === 'atlas' || value === 'source';
}

/** Falls back to the default for anything a newer or older Atlas may have stored. */
export function resolveStatblockPresentation(value: unknown): StatblockPresentation {
  return isStatblockPresentation(value) ? value : DEFAULT_STATBLOCK_PRESENTATION;
}
