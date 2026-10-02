import type { GridType } from './GridSystem';
import { axialToPixel, createHexLayout, hexCellExtent, isHexGridType, pixelToAxial } from './hexGeometry';
import type { Point } from './hexGeometry';
import { tokenDiameterInCells } from '../pixi/token-renderer/tokenSizing';

export interface GridOffset {
  offsetX: number;
  offsetY: number;
}

function mod(value: number, period: number): number {
  return ((value % period) + period) % period;
}

/** Keeps offsets small without moving the grid: square offsets modulo the cell, hex offsets re-based to the hex containing the origin. */
export function normaliseGridOffset(gridType: GridType, cellSize: number, offsetX: number, offsetY: number): GridOffset {
  if (!isHexGridType(gridType)) return { offsetX: mod(offsetX, cellSize), offsetY: mod(offsetY, cellSize) };
  const layout = createHexLayout(gridType, cellSize, offsetX, offsetY);
  const anchor = axialToPixel(layout, pixelToAxial(layout, { x: 0, y: 0 }));
  const extent = hexCellExtent(layout);
  return { offsetX: anchor.x - extent.width / 2, offsetY: anchor.y - extent.height / 2 };
}

/** Offsets of the grid whose cell `(0, 0)` is centred on `point`. */
export function gridOffsetCenteredAt(gridType: GridType, cellSize: number, point: Point): GridOffset {
  const extent = isHexGridType(gridType)
    ? hexCellExtent(createHexLayout(gridType, cellSize, 0, 0))
    : { width: cellSize, height: cellSize };
  return { offsetX: point.x - extent.width / 2, offsetY: point.y - extent.height / 2 };
}

/**
 * How far a token's centre lies past the centre of its top-left-most cell, along both axes. A token covers
 * whole cells, so on a square grid an even footprint (2×2, 4×4) centres on a grid intersection, half a cell
 * past that cell's centre; an odd one, and every token on a hex grid, centres on a cell.
 */
export function tokenCenterShift(gridType: GridType | undefined, cellSize: number, tokenSize: number): number {
  return !isHexGridType(gridType) && tokenDiameterInCells(tokenSize) % 2 === 0 ? cellSize / 2 : 0;
}

/** Where the centre of a token of `tokenSize` snaps. `snapToCell` snaps a point to the centre of the cell containing it. */
export function snapTokenCenter(
  point: Point,
  tokenSize: number,
  gridType: GridType | undefined,
  cellSize: number,
  snapToCell: (point: Point) => Point,
): Point {
  const shift = tokenCenterShift(gridType, cellSize, tokenSize);
  const cell = snapToCell({ x: point.x - shift, y: point.y - shift });
  return { x: cell.x + shift, y: cell.y + shift };
}

/**
 * Centre of a token resized from `fromSize` to `toSize`. Where tokens snap to a square grid it keeps its
 * top-left corner, so an aligned token stays aligned at its new size; elsewhere it keeps its centre.
 */
export function resizedTokenCenter(
  center: Point,
  fromSize: number,
  toSize: number,
  grid: { type?: GridType | undefined; size: number; snapToGrid?: boolean | undefined } | null | undefined,
): Point {
  if (!grid || !(grid.snapToGrid ?? true) || isHexGridType(grid.type)) return center;
  const shift = ((tokenDiameterInCells(toSize) - tokenDiameterInCells(fromSize)) * grid.size) / 2;
  return { x: center.x + shift, y: center.y + shift };
}
