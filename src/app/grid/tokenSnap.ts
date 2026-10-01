/**
 * Where a token's centre rests when it snaps to the grid.
 *
 * A token covers `tokenDiameterInCells(size)` cells on a side. An odd footprint
 * (1×1, 3×3) has a middle cell and is centred on it, but an even one (2×2, 4×4) has
 * no middle cell, so its centre belongs on the lines between them. Snapping every
 * token to a cell centre left even footprints straddling four cells.
 *
 * Hex grids keep every token on a hex centre: hexes do not pair up into a larger
 * hex, so an even footprint has no line to rest on.
 */

import { tokenDiameterInCells } from '../pixi/token-renderer/tokenSizing';
import { createHexLayout, isHexGridType, nearestHexCenter, type Point } from './hexGeometry';

/** The grid geometry a token snaps against, as `GridState` and `GridOptions` both provide it. */
export interface SnapGrid {
  type?: string | undefined;
  size: number;
  offsetX?: number;
  offsetY?: number;
}

/**
 * Index of the first cell a footprint of `diameter` cells covers, for a centre `value`
 * cells from the grid origin.
 *
 * A point exactly between two footprints lies on a grid line for an odd diameter and on a
 * cell centre for an even one. An odd footprint takes the cell after the line, the rule
 * tokens have always followed; an even one takes the lower footprint, so a token recorded
 * by the cell it stands in (encounter formations) comes back where it was.
 */
function firstCell(value: number, diameter: number): number {
  const edge = value - diameter / 2;
  return diameter % 2 === 0 ? Math.ceil(edge - 0.5) : Math.round(edge);
}

/** Centre of the nearest square footprint of `diameter` cells, along one axis. */
function snapAxis(value: number, offset: number, size: number, diameter: number): number {
  return (firstCell((value - offset) / size, diameter) + diameter / 2) * size + offset;
}

/**
 * Snap the centre of a token of `sizeInCells` (the stored size multiplier) so its
 * footprint lines up with the grid.
 */
export function snapTokenToGrid(grid: SnapGrid, point: Point, sizeInCells = 1): Point {
  const { type, size, offsetX = 0, offsetY = 0 } = grid;
  if (!Number.isFinite(size) || size <= 0) return { x: point.x, y: point.y };
  if (isHexGridType(type)) {
    return nearestHexCenter(createHexLayout(type, size, offsetX, offsetY), point);
  }
  const diameter = tokenDiameterInCells(sizeInCells);
  return {
    x: snapAxis(point.x, offsetX, size, diameter),
    y: snapAxis(point.y, offsetY, size, diameter),
  };
}

/**
 * Centre a token takes when it is resized from `fromSize` to `toSize`: the cell its
 * footprint starts in stays put, so it grows and shrinks towards its lower right rather
 * than jumping to whichever side of the grid line happens to be nearer.
 *
 * Hex grids keep the token on its hex centre, as `snapTokenToGrid` does.
 */
export function resizeTokenCentre(grid: SnapGrid, point: Point, fromSize: number, toSize: number): Point {
  const { type, size } = grid;
  if (!Number.isFinite(size) || size <= 0 || isHexGridType(type)) return snapTokenToGrid(grid, point, toSize);
  // Growing by n cells moves the centre n/2 cells, which leaves the top-left corner put.
  const grown = ((tokenDiameterInCells(toSize) - tokenDiameterInCells(fromSize)) * size) / 2;
  return snapTokenToGrid(grid, { x: point.x + grown, y: point.y + grown }, toSize);
}
