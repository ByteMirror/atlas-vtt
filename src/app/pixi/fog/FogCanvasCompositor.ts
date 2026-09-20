/**
 * Composites FogOperation[] onto an HTML Canvas 2D surface.
 *
 * Each operation is painted in timestamp order. Brush strokes interpolate
 * circles along the point path; lasso fills render a closed polygon; rectangle
 * fills use fillRect.  Erasing is achieved via `destination-out` composite
 * mode (Canvas 2D, not PIXI — avoids PixiJS v8 erase-blend bug #11377).
 */
import type { FogBounds, FogOperation } from '../../types/fogTypes';
import { renderOperation } from './fogRenderUtils';

export class FogCanvasCompositor {
  private canvas: HTMLCanvasElement;
  private ctx: CanvasRenderingContext2D;
  private bounds: FogBounds;
  private scale: number;

  constructor(bounds: FogBounds, scale = 0.5) {
    this.bounds = bounds;
    this.scale = scale;
    this.canvas = createEl('canvas');
    this.canvas.width = Math.max(1, Math.round(bounds.width * scale));
    this.canvas.height = Math.max(1, Math.round(bounds.height * scale));

    const ctx = this.canvas.getContext('2d', { willReadFrequently: false, alpha: true });
    if (!ctx) throw new Error('Failed to get 2D context for fog compositor');
    this.ctx = ctx;
  }

  // ── Public API ──────────────────────────────────────────────────────

  /** Full re-render from a set of operations (e.g. after undo/redo or map load). */
  compositeAll(ops: FogOperation[]): void {
    this.ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);
    const sorted = [...ops].sort((a, b) => a.timestamp - b.timestamp);
    for (const op of sorted) {
      renderOperation(this.ctx, op, this.bounds, this.scale, op.offsetX ?? 0, op.offsetY ?? 0);
    }
  }

  /** Append a single operation (for live drawing preview). */
  compositeIncremental(op: FogOperation): void {
    renderOperation(this.ctx, op, this.bounds, this.scale, op.offsetX ?? 0, op.offsetY ?? 0);
  }

  /** Recreate canvas when map/bounds change. */
  updateBounds(bounds: FogBounds): void {
    this.bounds = bounds;
    this.canvas.width = Math.max(1, Math.round(bounds.width * this.scale));
    this.canvas.height = Math.max(1, Math.round(bounds.height * this.scale));
  }

  /** The underlying HTMLCanvasElement for PIXI texture creation. */
  getCanvas(): HTMLCanvasElement {
    return this.canvas;
  }

  getBounds(): FogBounds {
    return this.bounds;
  }

  destroy(): void {
    this.canvas.width = 1;
    this.canvas.height = 1;
  }
}
