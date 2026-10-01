import type { Point } from './hexGeometry';

/**
 * How cells are numbered. `column-row` is the hexcrawl convention ("0304" is
 * column 3, row 4); `sequential` counts 1, 2, 3 in reading order.
 */
export type CellNumberFormat = 'column-row' | 'sequential';

export function isCellNumberFormat(value: unknown): value is CellNumberFormat {
  return value === 'column-row' || value === 'sequential';
}

/** How a grid shows its cell numbers; a grid without numbers has none. */
export interface CellNumberStyle {
  format: CellNumberFormat;
  /** 0 to 1, separate from the grid lines' opacity. */
  opacity: number;
}

export const DEFAULT_CELL_NUMBER_OPACITY = 0.8;

/** The cell number style a grid's settings ask for, or undefined when numbers are off. */
export function cellNumberStyleOfGrid(
  grid: { hexNumbers?: CellNumberFormat | undefined; hexNumberOpacity?: number | undefined } | null | undefined,
): CellNumberStyle | undefined {
  if (!grid || !isCellNumberFormat(grid.hexNumbers)) return undefined;
  return { format: grid.hexNumbers, opacity: grid.hexNumberOpacity ?? DEFAULT_CELL_NUMBER_OPACITY };
}

/** The map image in world space. */
export interface MapRect {
  x: number;
  y: number;
  width: number;
  height: number;
}

/** A cell on a lattice, identified by its lattice-specific key and 0-based row/column. */
export interface PlacedCell {
  /** Identifies the cell on the lattice; the lattice decides its spelling. */
  key: string;
  center: Point;
  /** 0-based, counted from the first cell of the map. */
  row: number;
  column: number;
}

/** A grid's cell geometry: how big its cells are and which ones fall on a given map. */
export interface CellLattice {
  /** Flat-to-flat distance for hexes, side length for squares, in world pixels. */
  size: number;
  /** The cells of the map, each with its 0-based row and column. */
  cellsOnMap(map: MapRect): PlacedCell[];
}

export interface NumberedCell {
  key: string;
  center: Point;
  label: string;
}

/**
 * A cell is on the map when its centre lies at least this share of the cell
 * size inside every edge, so cells the map edge cuts in half get no number and
 * every line of cells starts counting at its first whole cell.
 */
export const EDGE_MARGIN = 0.4;
export const EPSILON = 1e-6;

function padded(value: number, digits: number): string {
  return String(value).padStart(digits, '0');
}

/** Numbers every cell of the lattice on the map; cells the map edge cuts off get no number. */
export function numberCells(lattice: CellLattice, map: MapRect, format: CellNumberFormat): NumberedCell[] {
  if (!(lattice.size > 0) || !(map.width > 0) || !(map.height > 0)) return [];
  const cells = lattice.cellsOnMap(map);

  if (format === 'sequential') {
    const readingOrder = [...cells].sort((a, b) => a.row - b.row || a.column - b.column);
    return readingOrder.map((cell, index) => ({
      key: cell.key,
      center: cell.center,
      label: String(index + 1),
    }));
  }

  const columns = cells.reduce((most, cell) => Math.max(most, cell.column + 1), 0);
  const rows = cells.reduce((most, cell) => Math.max(most, cell.row + 1), 0);
  const columnDigits = Math.max(2, String(columns).length);
  const rowDigits = Math.max(2, String(rows).length);
  return cells.map((cell) => ({
    key: cell.key,
    center: cell.center,
    label: padded(cell.column + 1, columnDigits) + padded(cell.row + 1, rowDigits),
  }));
}

/** Numbered cells by their lattice key, for looking up a single cell's number. */
export function cellLabelsByKey(cells: readonly NumberedCell[]): Map<string, string> {
  return new Map(cells.map((cell) => [cell.key, cell.label]));
}

/** Where a cell's number sits: just below the top of the cell, clear of tokens and pins at its centre. */
export function cellNumberAnchor(size: number, center: Point): Point {
  return { x: center.x, y: center.y - 0.37 * size };
}

/** Font size of cell numbers in world pixels. */
export function cellNumberFontSize(size: number): number {
  return 0.16 * size;
}
