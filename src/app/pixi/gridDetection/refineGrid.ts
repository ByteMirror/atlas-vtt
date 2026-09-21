/**
 * Precise cell size and offset for a grid hypothesis: the lattice search gets
 * within a few pixels, the lattice fit makes it sub-pixel and reports how much of
 * the grid the map's lines support.
 */

import type { GridType } from '../../grid/GridSystem';
import { axialToPixel, createHexLayout, hexCellExtent, isHexGridType, pixelToAxial } from '../../grid/hexGeometry';
import type { GrayImage } from './grayImage';
import type { LatticeCandidate } from './edgeProfile';
import { fitLattice } from './latticeFit';
import { searchLattice } from './latticeSearch';

export interface RefinedGrid {
  gridType: GridType;
  cellSize: number;
  offsetX: number;
  offsetY: number;
  /** Share of the grid's edges that sit on a line of the map, corrected for chance (0–1). */
  support: number;
}

function mod(value: number, period: number): number {
  return ((value % period) + period) % period;
}

/** Keep offsets small: square offsets modulo the cell, hex offsets re-based to the hex containing the origin. */
function normaliseOffset(gridType: GridType, candidate: LatticeCandidate): LatticeCandidate {
  const { cellSize } = candidate;
  if (!isHexGridType(gridType)) return { cellSize, offsetX: mod(candidate.offsetX, cellSize), offsetY: mod(candidate.offsetY, cellSize) };
  const layout = createHexLayout(gridType, cellSize, candidate.offsetX, candidate.offsetY);
  const anchor = axialToPixel(layout, pixelToAxial(layout, { x: 0, y: 0 }));
  const extent = hexCellExtent(layout);
  return { cellSize, offsetX: anchor.x - extent.width / 2, offsetY: anchor.y - extent.height / 2 };
}

export function refineGrid(image: GrayImage, gridType: GridType, roughCellSize: number): RefinedGrid | null {
  const found = searchLattice(image, gridType, roughCellSize);
  if (!found) return null;
  const fit = fitLattice(image, gridType, found);
  return { gridType, ...normaliseOffset(gridType, fit.candidate), support: fit.support };
}
