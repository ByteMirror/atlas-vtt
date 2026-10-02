import type { Point } from '../types/visionTypes';

/** How a stroke marks an area: painted with a round brush, outlined freehand, or dragged as a rectangle. */
export type StrokeMode = 'brush' | 'lasso' | 'rectangle';

/** The colours a stroke under way is previewed in: light where it paints or reveals, red where it erases or forgets. */
export const STROKE_COLORS = { paint: 0xffffff, erase: 0xff4444 } as const;

/** The area a stroke covers, in world pixels. */
export type StrokeShape =
  | { type: 'brush'; points: Point[]; brushRadius: number }
  | { type: 'lasso'; points: Point[] }
  | { type: 'rectangle'; x: number; y: number; width: number; height: number };

/**
 * One press, drag and release that marks an area of the map, for the tools that paint areas
 * (fog, explored memory). It only keeps the stroke; the tool decides when one begins, what a
 * point snaps to, how it is previewed and what the finished shape does.
 */
export class ShapeStroke {
  mode: StrokeMode = 'brush';
  brushRadius = 50;
  private points: Point[] = [];
  /** The rectangle's first corner, and its opposite one once the pointer has moved. */
  private corner: Point | null = null;
  private opposite: Point | null = null;
  private drawing = false;

  /** A stroke is under way. */
  get active(): boolean {
    return this.drawing;
  }

  begin(point: Point): void {
    this.cancel();
    this.drawing = true;
    if (this.mode === 'rectangle') this.corner = { ...point };
    else this.points = [{ ...point }];
  }

  extend(point: Point): void {
    if (!this.drawing) return;
    if (this.mode === 'rectangle') this.opposite = { ...point };
    else this.points.push({ ...point });
  }

  /**
   * What the stroke covers so far, or null while that is no area: a lasso of fewer than three
   * points, a rectangle whose pointer has not moved or that is empty. Its points are the
   * stroke's own until the stroke ends: read them before it goes on.
   */
  shape(): StrokeShape | null {
    if (!this.drawing) return null;
    if (this.mode === 'brush') return { type: 'brush', points: this.points, brushRadius: this.brushRadius };
    if (this.mode === 'lasso') return this.points.length >= 3 ? { type: 'lasso', points: this.points } : null;
    if (!this.corner || !this.opposite) return null;
    const width = Math.abs(this.opposite.x - this.corner.x);
    const height = Math.abs(this.opposite.y - this.corner.y);
    if (width <= 0 || height <= 0) return null;
    return { type: 'rectangle', x: Math.min(this.corner.x, this.opposite.x), y: Math.min(this.corner.y, this.opposite.y), width, height };
  }

  /** The points of a lasso being drawn, for its outline before it is an area. */
  outline(): readonly Point[] {
    return this.drawing && this.mode === 'lasso' ? this.points : [];
  }

  /** Ends the stroke and hands over what it covers (`shape`). */
  finish(): StrokeShape | null {
    const shape = this.shape();
    this.cancel();
    return shape;
  }

  /** Drops the stroke. */
  cancel(): void {
    this.drawing = false;
    this.points = [];
    this.corner = null;
    this.opposite = null;
  }
}
