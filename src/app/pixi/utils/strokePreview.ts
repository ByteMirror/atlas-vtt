import type { Graphics } from 'pixi.js';
import type { ShapeStroke } from '../../tools/shapeStroke';

/**
 * Draws the area a lasso or rectangle stroke marks so far into `g`, outlined and, unless the
 * caller shows the area itself (`filled` false), faintly filled; a brush stroke has no outline
 * of its own, and nothing is drawn for it.
 */
export function drawStrokeArea(g: Graphics, stroke: ShapeStroke, color: number, lineWidth = 2, filled = true): void {
  g.clear();
  if (stroke.mode === 'lasso') {
    const points = stroke.outline();
    if (points.length < 2) return;
    g.poly(points.flatMap((point) => [point.x, point.y]), true);
  } else {
    const shape = stroke.shape();
    if (shape?.type !== 'rectangle') return;
    g.rect(shape.x, shape.y, shape.width, shape.height);
  }
  g.stroke({ width: lineWidth, color, alpha: 0.6 });
  if (filled) g.fill({ color, alpha: 0.15 });
}
