/**
 * Shows a semi-transparent brush circle at the pointer position in world space.
 * White for paint, red-tinted for erase. Only visible in brush mode.
 */
import * as PIXI from 'pixi.js';

const PAINT_COLOR = 0xffffff;
const ERASE_COLOR = 0xff4444;
const CURSOR_ALPHA = 0.4;
const CURSOR_LINE_WIDTH = 2;

export class FogCursorPreview {
  private graphics: PIXI.Graphics;
  private _brushRadius = 50;
  private _isErasing = false;

  constructor() {
    this.graphics = new PIXI.Graphics();
    this.graphics.eventMode = 'none';
    this.graphics.visible = false;
    this.graphics.zIndex = 9999;
    this.redraw();
  }

  // ── Public API ──────────────────────────────────────────────────────

  getDisplayObject(): PIXI.Graphics {
    return this.graphics;
  }

  show(isErasing: boolean): void {
    this._isErasing = isErasing;
    this.graphics.visible = true;
    this.redraw();
  }

  hide(): void {
    this.graphics.visible = false;
  }

  setBrushRadius(radius: number): void {
    if (this._brushRadius === radius) return;
    this._brushRadius = radius;
    this.redraw();
  }

  updatePosition(worldX: number, worldY: number): void {
    this.graphics.position.set(worldX, worldY);
  }

  destroy(): void {
    if (!this.graphics.destroyed) {
      this.graphics.destroy();
    }
  }

  // ── Internals ───────────────────────────────────────────────────────

  private redraw(): void {
    this.graphics.clear();
    const color = this._isErasing ? ERASE_COLOR : PAINT_COLOR;

    this.graphics.circle(0, 0, this._brushRadius);
    this.graphics.stroke({ width: CURSOR_LINE_WIDTH, color, alpha: CURSOR_ALPHA });
  }
}
