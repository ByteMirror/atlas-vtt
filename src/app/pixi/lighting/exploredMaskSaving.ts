/**
 * Encodes the explored memory as a PNG data URL for the map file, at the memory's own size: a
 * mask saved smaller comes back with its edges spread, and mending that on every load wore the
 * memory away, a quarter texel with each save and restore. At its own size what is restored is
 * what was saved, texel for texel.
 */
export function saveExploredMask(source: HTMLCanvasElement): string {
  return source.toDataURL('image/png');
}
