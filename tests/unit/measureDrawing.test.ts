import { describe, expect, it } from 'vitest';
import { Graphics, type Circle } from 'pixi.js';
import { drawMeasureCircle } from '../../src/app/pixi/utils/measureDrawing';

function circleRadii(graphics: Graphics): number[] {
  return graphics.context.instructions.flatMap((instruction) =>
    instruction.action === 'texture'
      ? []
      : instruction.data.path.shapePath.shapePrimitives
        .filter(({ shape }) => shape.type === 'circle')
        .map(({ shape }) => (shape as Circle).radius),
  );
}

describe('drawMeasureCircle', () => {
  // Canvas 2D (the renderer without WebGL) throws on a negative arc radius, which stops the map from rendering.
  it('draws no negative radius before the pointer has moved', () => {
    const graphics = new Graphics();
    drawMeasureCircle(graphics, 0xff0000, { x: 10, y: 10 }, 0);
    expect(Math.min(...circleRadii(graphics))).toBeGreaterThanOrEqual(0);
  });

  it('insets the highlight ring by one pixel', () => {
    const graphics = new Graphics();
    drawMeasureCircle(graphics, 0xff0000, { x: 0, y: 0 }, 50);
    expect(circleRadii(graphics)).toEqual([50, 50, 49]);
  });
});
