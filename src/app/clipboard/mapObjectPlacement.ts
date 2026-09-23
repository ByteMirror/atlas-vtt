import type { GridState } from '../services/MapPersistence';
import { cellToWorld, formationGridFromOptions, worldToCell, type FormationGrid } from '../encounters/encounterFormation';
import {
  contentCenter,
  occupiedPositions,
  translateMapObjects,
  type CopyableCollections,
  type MapObjectContent,
  type Point,
} from './mapObjectContent';

/** Offset of a duplicate on maps without a grid, in world pixels. */
const UNGRIDDED_STEP = 20;
/** Upper bound on the cascade that keeps copies from landing exactly on existing objects. */
const MAX_CASCADE_STEPS = 50;

/** Grid geometry when tokens snap to it, mirroring the drag behaviour (snapping defaults to on). */
function tokenSnapGrid(grid: GridState | null): FormationGrid | null {
  const geometry = formationGridFromOptions(grid);
  return geometry && (grid?.snapToGrid ?? true) ? geometry : null;
}

function snapToCellCenter(grid: FormationGrid, point: Point): Point {
  return cellToWorld(grid, worldToCell(grid, point));
}

/** One diagonal cell as a lattice vector, so shifted copies stay aligned with the grid. */
export function duplicateStep(grid: GridState | null): Point {
  const geometry = formationGridFromOptions(grid);
  if (!geometry) return { x: UNGRIDDED_STEP, y: UNGRIDDED_STEP };
  const origin = cellToWorld(geometry, { q: 0, r: 0 });
  const next = cellToWorld(geometry, geometry.type === 'square' ? { q: 1, r: 1 } : { q: 0, r: 1 });
  return { x: next.x - origin.x, y: next.y - origin.y };
}

/**
 * Offset that centres the content on `target`. When tokens snap, the offset is adjusted so the
 * first token lands on a cell centre, which keeps the whole group's grid alignment intact.
 */
export function pasteOffset(content: MapObjectContent, target: Point, grid: GridState | null): Point {
  const center = contentCenter(content);
  const offset = { x: target.x - center.x, y: target.y - center.y };
  const geometry = tokenSnapGrid(grid);
  const anchor = content.tokens[0];
  if (!geometry || !anchor) return offset;
  const snapped = snapToCellCenter(geometry, { x: anchor.x + offset.x, y: anchor.y + offset.y });
  return { x: snapped.x - anchor.x, y: snapped.y - anchor.y };
}

function overlapsExisting(content: MapObjectContent, occupied: Set<string>): boolean {
  for (const key of occupiedPositions(content)) {
    if (occupied.has(key)) return true;
  }
  return false;
}

/**
 * Moves the content by `offset` and snaps tokens the way a drag does. While a copy would sit exactly
 * on top of an identical existing object, the copies move one more cell, so repeated pastes and
 * duplicates fan out instead of hiding under each other.
 */
export function placeMapObjects(
  content: MapObjectContent,
  offset: Point,
  grid: GridState | null,
  existing: CopyableCollections,
): MapObjectContent {
  const geometry = tokenSnapGrid(grid);
  const placeToken = geometry ? (point: Point): Point => snapToCellCenter(geometry, point) : undefined;
  const occupied = occupiedPositions(existing);
  const step = duplicateStep(grid);
  let placed = translateMapObjects(content, offset, placeToken);
  for (let i = 1; i <= MAX_CASCADE_STEPS && overlapsExisting(placed, occupied); i++) {
    placed = translateMapObjects(content, { x: offset.x + step.x * i, y: offset.y + step.y * i }, placeToken);
  }
  return placed;
}
