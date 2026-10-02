/**
 * A theme may draw around a statblock preview (the Atlas VTT theme grows ivy over its
 * corners). It asks for the room that takes by setting these on `body`; a preview then keeps
 * at least that far from the window's edges, above and below (`block`) and at the sides
 * (`inline`).
 */
export const PREVIEW_GAP_BLOCK = '--atlas-statblock-preview-gap-block';
export const PREVIEW_GAP_INLINE = '--atlas-statblock-preview-gap-inline';

/** More than this and a preview would have no room left on a small window. */
const MAX_GAP = 160;

export interface PreviewEdgeGaps {
  block: number;
  inline: number;
}

/** The gaps a preview keeps to the window's edges in `doc`: `least`, or what the theme asks for when that is more. */
export function previewEdgeGaps(doc: Document, least: number): PreviewEdgeGaps {
  const style = (doc.defaultView ?? window).getComputedStyle(doc.body);
  const gap = (property: string): number => {
    const asked = Number.parseFloat(style.getPropertyValue(property));
    return Number.isFinite(asked) ? Math.min(MAX_GAP, Math.max(least, asked)) : least;
  };
  return { block: gap(PREVIEW_GAP_BLOCK), inline: gap(PREVIEW_GAP_INLINE) };
}
