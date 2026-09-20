/**
 * Shared token sizing derived from the grid cell size.
 *
 * A size-1 token fills one cell minus a stroke inset on each side. On hex grids
 * the cell size is the flat-to-flat distance, so the same formula fits the
 * hex's inscribed circle. Larger tokens span (2n - 1) cells so they stay
 * centered on a cell.
 */

const REFERENCE_CELL_SIZE = 70;
const REFERENCE_STROKE_WIDTH = 4;

/** Stroke inset in pixels, proportional to the grid size (4px at a 70px cell). */
export function computeTokenStrokeWidth(gridSize: number): number {
  return Math.max(1, Math.round((gridSize * REFERENCE_STROKE_WIDTH) / REFERENCE_CELL_SIZE));
}

/** Diameter in cells covered by a token of the given size multiplier. */
export function tokenDiameterInCells(sizeInCells: number): number {
  return 2 * sizeInCells - 1;
}

/** Token sprite diameter in pixels for a token covering `sizeInCells` cells. */
export function computeTokenPixelSize(gridSize: number, sizeInCells: number): number {
  const strokeWidth = computeTokenStrokeWidth(gridSize);
  return (gridSize - 2 * strokeWidth) * tokenDiameterInCells(sizeInCells);
}
