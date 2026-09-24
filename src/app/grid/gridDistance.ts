/**
 * Grid distance along a path, in cells.
 *
 * Hex grids count hex steps. Square grids split every segment into straight
 * and diagonal cells and price the diagonals with the collection's
 * `DiagonalRule`. The alternating rule counts diagonals over the whole path,
 * so a path with waypoints costs the same as one straight move.
 */

import type { DiagonalRule } from '../types/collectionSettingsTypes';
import type { GridOptions } from './GridSystem';
import { axialDistance, createHexLayout, isHexGridType, pixelToAxial, type Point } from './hexGeometry';

export type GridGeometry = Pick<GridOptions, 'type' | 'size' | 'offsetX' | 'offsetY'>;

/** Length in cells of the path through `points`. */
export function pathLengthInCells(grid: GridGeometry, points: readonly Point[], diagonalRule: DiagonalRule): number {
  if (isHexGridType(grid.type)) {
    const layout = createHexLayout(grid.type, grid.size, grid.offsetX ?? 0, grid.offsetY ?? 0);
    const cells = points.map(point => pixelToAxial(layout, point));
    let steps = 0;
    for (let i = 1; i < cells.length; i++) steps += axialDistance(cells[i - 1]!, cells[i]!);
    return steps;
  }

  let straight = 0;
  let diagonal = 0;
  let euclidean = 0;
  for (let i = 1; i < points.length; i++) {
    const dx = Math.abs(points[i]!.x - points[i - 1]!.x) / grid.size;
    const dy = Math.abs(points[i]!.y - points[i - 1]!.y) / grid.size;
    straight += Math.abs(dx - dy);
    diagonal += Math.min(dx, dy);
    euclidean += Math.hypot(dx, dy);
  }

  switch (diagonalRule) {
    case 'euclidean':
      return euclidean;
    case 'alternating':
      return straight + diagonal + Math.floor(diagonal / 2);
    case 'equidistant':
      return straight + diagonal;
  }
}
