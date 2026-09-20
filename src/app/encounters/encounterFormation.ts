import { axialToPixel, createHexLayout, pixelToAxial, type HexLayout } from '../grid/hexGeometry';

export type FormationGridType = 'square' | 'hex-horizontal' | 'hex-vertical';

/** Geometry of the grid a formation is measured against. `size` is the square side or hex flat-to-flat width. */
export interface FormationGrid {
  type: FormationGridType;
  size: number;
  offsetX: number;
  offsetY: number;
}

export interface Point {
  x: number;
  y: number;
}

/** Integer cell address. Square grids use q = column, r = row; hex grids use axial coordinates. */
export interface CellCoord {
  q: number;
  r: number;
}

/** Where one token sits relative to the formation's anchor token. */
export interface FormationSlot {
  /** Cell offset from the anchor's cell, in the capture grid's cell space. Exact replay on the same grid type. */
  cell: CellCoord;
  /** World offset from the anchor in units of the capture grid's cell pitch. Used across grid types. */
  offset: Point;
}

export interface EncounterFormation {
  gridType: FormationGridType;
  /** Distance between adjacent cell centres in world pixels at capture time. */
  pitch: number;
}

/** Pitch assumed when no usable grid is present. */
export const FALLBACK_PITCH = 70;

/** Cells searched outward from a contested cell before giving up and overlapping. */
const MAX_COLLISION_SEARCH = 200;

const SQUARE_NEIGHBORS: CellCoord[] = [
  { q: 1, r: 0 }, { q: -1, r: 0 }, { q: 0, r: 1 }, { q: 0, r: -1 },
  { q: 1, r: 1 }, { q: 1, r: -1 }, { q: -1, r: 1 }, { q: -1, r: -1 },
];

const HEX_NEIGHBORS: CellCoord[] = [
  { q: 1, r: 0 }, { q: 1, r: -1 }, { q: 0, r: -1 },
  { q: -1, r: 0 }, { q: -1, r: 1 }, { q: 0, r: 1 },
];

function isFiniteNumber(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value);
}

/**
 * Build a formation grid from loosely typed grid options (e.g. `GridSystem.getOptions()`).
 * Returns null when the grid is disabled or its geometry is unusable.
 */
export function formationGridFromOptions(
  options: { type?: string; size?: number; offsetX?: number; offsetY?: number; enabled?: boolean } | null | undefined,
): FormationGrid | null {
  if (!options || options.enabled === false) return null;
  if (!isFiniteNumber(options.size) || options.size <= 0) return null;
  const type: FormationGridType =
    options.type === 'hex-horizontal' || options.type === 'hex-vertical' ? options.type : 'square';
  return {
    type,
    size: options.size,
    offsetX: isFiniteNumber(options.offsetX) ? options.offsetX : 0,
    offsetY: isFiniteNumber(options.offsetY) ? options.offsetY : 0,
  };
}

function isHex(grid: FormationGrid): boolean {
  return grid.type !== 'square';
}

function hexLayout(grid: FormationGrid): HexLayout {
  const type = grid.type === 'hex-horizontal' ? 'hex-horizontal' : 'hex-vertical';
  return createHexLayout(type, grid.size, grid.offsetX, grid.offsetY);
}

/** Distance between the centres of two adjacent cells. For both grid families this equals `size`. */
export function cellPitch(grid: FormationGrid): number {
  return grid.size;
}

export function worldToCell(grid: FormationGrid, point: Point): CellCoord {
  if (isHex(grid)) {
    return pixelToAxial(hexLayout(grid), point);
  }
  return {
    q: Math.floor((point.x - grid.offsetX) / grid.size),
    r: Math.floor((point.y - grid.offsetY) / grid.size),
  };
}

/** Centre of the given cell in world pixels. */
export function cellToWorld(grid: FormationGrid, cell: CellCoord): Point {
  if (isHex(grid)) {
    return axialToPixel(hexLayout(grid), cell);
  }
  return {
    x: cell.q * grid.size + grid.offsetX + grid.size / 2,
    y: cell.r * grid.size + grid.offsetY + grid.size / 2,
  };
}

function cellKey(cell: CellCoord): string {
  return `${cell.q},${cell.r}`;
}

function addCells(a: CellCoord, b: CellCoord): CellCoord {
  return { q: a.q + b.q, r: a.r + b.r };
}

/** Breadth-first search outward from `start` for the nearest cell not in `occupied`. */
function nearestFreeCell(grid: FormationGrid, start: CellCoord, occupied: Set<string>): CellCoord {
  if (!occupied.has(cellKey(start))) return start;

  const neighbors = isHex(grid) ? HEX_NEIGHBORS : SQUARE_NEIGHBORS;
  const visited = new Set<string>([cellKey(start)]);
  const queue: CellCoord[] = [start];

  while (queue.length > 0 && visited.size < MAX_COLLISION_SEARCH) {
    const current = queue.shift()!;
    for (const delta of neighbors) {
      const next = addCells(current, delta);
      const key = cellKey(next);
      if (visited.has(key)) continue;
      if (!occupied.has(key)) return next;
      visited.add(key);
      queue.push(next);
    }
  }
  return start;
}

/**
 * Record how a group of tokens is arranged relative to the first position (the anchor).
 * Works without a grid by falling back to a nominal pitch.
 */
export function captureFormation(
  positions: Point[],
  grid: FormationGrid | null,
): { formation: EncounterFormation; slots: FormationSlot[] } {
  const anchor = positions[0] ?? { x: 0, y: 0 };
  const pitch = grid ? cellPitch(grid) : FALLBACK_PITCH;
  const anchorCell = grid ? worldToCell(grid, anchor) : null;

  const slots = positions.map((position): FormationSlot => {
    const offset = { x: (position.x - anchor.x) / pitch, y: (position.y - anchor.y) / pitch };
    if (grid && anchorCell) {
      const cell = worldToCell(grid, position);
      return { cell: { q: cell.q - anchorCell.q, r: cell.r - anchorCell.r }, offset };
    }
    return { cell: { q: Math.round(offset.x), r: Math.round(offset.y) }, offset };
  });

  return { formation: { gridType: grid?.type ?? 'square', pitch }, slots };
}

/**
 * Compute world positions that reproduce a captured formation around `anchor` on the target grid.
 *
 * Same grid type: replayed exactly from cell offsets, so the formation survives grid size and offset changes.
 * Different grid type (or an unknown capture grid): replayed from pitch-normalised world offsets and snapped
 * to the nearest cell. Tokens that land on the same cell are pushed to the nearest free cell.
 * No grid: replayed as raw world offsets, preserving the original pixel layout.
 */
export function placeFormation(
  slots: FormationSlot[],
  formation: EncounterFormation,
  anchor: Point,
  grid: FormationGrid | null,
): Point[] {
  const capturePitch = isFiniteNumber(formation.pitch) && formation.pitch > 0 ? formation.pitch : FALLBACK_PITCH;

  if (!grid) {
    return slots.map((slot) => ({
      x: anchor.x + slot.offset.x * capturePitch,
      y: anchor.y + slot.offset.y * capturePitch,
    }));
  }

  const sameGridType = grid.type === formation.gridType;
  const anchorCell = worldToCell(grid, anchor);
  const anchorCenter = cellToWorld(grid, anchorCell);
  const targetPitch = cellPitch(grid);
  const occupied = new Set<string>();

  return slots.map((slot) => {
    const desired = sameGridType
      ? addCells(anchorCell, slot.cell)
      : worldToCell(grid, {
          x: anchorCenter.x + slot.offset.x * targetPitch,
          y: anchorCenter.y + slot.offset.y * targetPitch,
        });
    const cell = nearestFreeCell(grid, desired, occupied);
    occupied.add(cellKey(cell));
    return cellToWorld(grid, cell);
  });
}
