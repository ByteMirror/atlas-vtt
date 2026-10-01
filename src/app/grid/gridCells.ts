/**
 * A single grid unit, as the polygon that outlines it.
 *
 * Square grids answer with the square containing the point, hex grids with the
 * hex — so a caller that fills one unit per click (fog's cell mode) does not
 * need to know which kind of grid it is painting on.
 *
 * Cells carry a `key` as well as a polygon: a drag crossing the same unit twice
 * must fill it once, and the key is what makes that cheap. The polygon is in
 * world space rather than cell coordinates so a fill stays where it was painted
 * when the grid is realigned afterwards, matching how lasso and rectangle fog
 * behave.
 */

import type { GridState } from '../services/MapPersistence';
import { axialToPixel, createHexLayout, hexVertices, isHexGridType, pixelToAxial } from './hexGeometry';
import type { Point } from './hexGeometry';

export type CellGridGeometry = Pick<GridState, 'type' | 'size' | 'offsetX' | 'offsetY'>;

export interface GridCell {
  /** Identity of the cell within its grid: `col,row` on a square grid, `q,r` on a hex grid. */
  key: string;
  /** The cell's corners in world space, in order, forming a closed outline. */
  polygon: Point[];
}

/** The grid unit containing `point`, or null when the grid has no usable cell size. */
export function gridCellAt(grid: CellGridGeometry | null | undefined, point: Point): GridCell | null {
  if (!grid || !(grid.size > 0)) return null;

  const offsetX = grid.offsetX ?? 0;
  const offsetY = grid.offsetY ?? 0;

  if (isHexGridType(grid.type)) {
    const layout = createHexLayout(grid.type, grid.size, offsetX, offsetY);
    const cell = pixelToAxial(layout, point);
    return {
      key: `${cell.q},${cell.r}`,
      polygon: hexVertices(layout, axialToPixel(layout, cell)),
    };
  }

  // Square grid lines sit at `offset + n * size`, so the containing cell floors there.
  const col = Math.floor((point.x - offsetX) / grid.size);
  const row = Math.floor((point.y - offsetY) / grid.size);
  const left = offsetX + col * grid.size;
  const top = offsetY + row * grid.size;
  const right = left + grid.size;
  const bottom = top + grid.size;

  return {
    key: `${col},${row}`,
    polygon: [
      { x: left, y: top },
      { x: right, y: top },
      { x: right, y: bottom },
      { x: left, y: bottom },
    ],
  };
}
