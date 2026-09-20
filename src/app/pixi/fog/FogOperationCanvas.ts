/**
 * Renders a single fog paint operation (with erases applied) to its own
 * HTML Canvas.  Used to create per-operation PIXI Sprites that can be
 * individually selected, dragged, and deleted.
 */
import type { FogBounds, FogOperation } from '../../types/fogTypes';
import { renderOperation, calculateOperationBounds } from './fogRenderUtils';

const PADDING = 10;

export class FogOperationCanvas {
  private canvas: HTMLCanvasElement;
  private ctx: CanvasRenderingContext2D;
  private worldBounds: FogBounds;
  private scale: number;

  constructor(
    private paintOp: FogOperation,
    eraseOps: FogOperation[],
    scale = 0.5
  ) {
    this.scale = scale;

    // Calculate world-space bounds for this paint operation
    const raw = calculateOperationBounds(paintOp);
    this.worldBounds = {
      x: raw.x - PADDING,
      y: raw.y - PADDING,
      width: raw.width + PADDING * 2,
      height: raw.height + PADDING * 2,
    };

    // Create canvas at scaled resolution
    this.canvas = createEl('canvas');
    this.canvas.width = Math.max(1, Math.round(this.worldBounds.width * scale));
    this.canvas.height = Math.max(1, Math.round(this.worldBounds.height * scale));

    const ctx = this.canvas.getContext('2d', { willReadFrequently: false, alpha: true });
    if (!ctx) throw new Error('Failed to get 2D context for FogOperationCanvas');
    this.ctx = ctx;

    this.render(eraseOps);
  }

  getCanvas(): HTMLCanvasElement {
    return this.canvas;
  }

  getWorldBounds(): FogBounds {
    return this.worldBounds;
  }

  destroy(): void {
    this.canvas.width = 1;
    this.canvas.height = 1;
  }

  // ── Internals ──────────────────────────────────────────────────────

  private render(eraseOps: FogOperation[]): void {
    this.ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);

    const ox = this.paintOp.offsetX ?? 0;
    const oy = this.paintOp.offsetY ?? 0;

    // 1. Draw the paint operation (source-over)
    renderOperation(this.ctx, this.paintOp, this.worldBounds, this.scale, ox, oy);

    // 2. Apply erase operations in timestamp order (destination-out)
    const sorted = [...eraseOps]
      .filter((e) => e.isErasing && e.timestamp > this.paintOp.timestamp)
      .sort((a, b) => a.timestamp - b.timestamp);

    for (const eraseOp of sorted) {
      const eOx = eraseOp.offsetX ?? 0;
      const eOy = eraseOp.offsetY ?? 0;
      // renderOperation already sets destination-out for isErasing ops
      renderOperation(this.ctx, eraseOp, this.worldBounds, this.scale, eOx, eOy);
    }
  }
}
