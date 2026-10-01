/**
 * Operation-based fog of war data model.
 *
 * Each user action (brush stroke, lasso fill, rectangle, grid cells) is stored as an
 * individual record in `state.objects.fog`.  A `FogCanvasCompositor`
 * replays them in timestamp order onto a half-resolution HTML Canvas 2D,
 * which is displayed as a PIXI Sprite.
 */

// ── Base ────────────────────────────────────────────────────────────────

export interface FogOperationBase {
  id: string;
  kind: 'fog';
  timestamp: number;
  /** `true` ⇢ erase (destination-out), `false` ⇢ paint (source-over) */
  isErasing: boolean;
  /** Drag offset from original position (default 0) */
  offsetX?: number;
  offsetY?: number;
}

// ── Concrete operation types ────────────────────────────────────────────

export interface FogBrushStroke extends FogOperationBase {
  type: 'brush';
  points: Array<{ x: number; y: number }>;
  brushRadius: number;
}

export interface FogLassoFill extends FogOperationBase {
  type: 'lasso';
  points: Array<{ x: number; y: number }>;
}

export interface FogRectangleFill extends FogOperationBase {
  type: 'rectangle';
  x: number;
  y: number;
  width: number;
  height: number;
}

/**
 * Whole grid units filled in one gesture — a square on a square grid, a hex on
 * a hex grid. Each unit keeps its own world-space polygon, so one operation
 * covers a drag across several units and the fill survives a later realignment
 * of the grid it was painted against.
 */
export interface FogCellFill extends FogOperationBase {
  type: 'cells';
  cells: Array<Array<{ x: number; y: number }>>;
}

/** Discriminated union of all fog operation types */
export type FogOperation = FogBrushStroke | FogLassoFill | FogRectangleFill | FogCellFill;

/** Distributive Omit that preserves the discriminated union */
type DistributiveOmit<T, K extends keyof T> = T extends unknown ? Omit<T, K> : never;

/** Input type for creating a fog operation (without auto-generated fields) */
export type FogOperationInput = DistributiveOmit<FogOperation, 'id' | 'kind' | 'timestamp'>;

// ── Helper ──────────────────────────────────────────────────────────────

export interface FogBounds {
  x: number;
  y: number;
  width: number;
  height: number;
}
