import { describe, expect, it } from 'vitest';
import { ShapeStroke } from '../../src/app/tools/shapeStroke';

describe('ShapeStroke', () => {
  it('is a brush of 50 px until the tool says otherwise, and no stroke until one begins', () => {
    const stroke = new ShapeStroke();
    expect(stroke.mode).toBe('brush');
    expect(stroke.brushRadius).toBe(50);
    expect(stroke.active).toBe(false);
    expect(stroke.shape()).toBeNull();
    expect(stroke.finish()).toBeNull();
  });

  it('paints with the brush from the first press: a single point is a stroke', () => {
    const stroke = new ShapeStroke();
    stroke.brushRadius = 20;
    stroke.begin({ x: 10, y: 10 });
    expect(stroke.active).toBe(true);
    expect(stroke.shape()).toEqual({ type: 'brush', points: [{ x: 10, y: 10 }], brushRadius: 20 });
    stroke.extend({ x: 30, y: 10 });
    expect(stroke.finish()).toEqual({ type: 'brush', points: [{ x: 10, y: 10 }, { x: 30, y: 10 }], brushRadius: 20 });
    expect(stroke.active).toBe(false);
  });

  it('outlines a lasso, which is an area from its third point', () => {
    const stroke = new ShapeStroke();
    stroke.mode = 'lasso';
    stroke.begin({ x: 0, y: 0 });
    stroke.extend({ x: 40, y: 0 });
    expect(stroke.shape()).toBeNull();
    expect(stroke.outline()).toEqual([{ x: 0, y: 0 }, { x: 40, y: 0 }]);
    stroke.extend({ x: 40, y: 40 });
    expect(stroke.finish()).toEqual({ type: 'lasso', points: [{ x: 0, y: 0 }, { x: 40, y: 0 }, { x: 40, y: 40 }] });
    expect(stroke.outline()).toEqual([]);
  });

  it('spans a rectangle between the press and the pointer, whichever way it is dragged', () => {
    const stroke = new ShapeStroke();
    stroke.mode = 'rectangle';
    stroke.begin({ x: 100, y: 80 });
    expect(stroke.shape()).toBeNull();
    stroke.extend({ x: 160, y: 20 });
    stroke.extend({ x: 40, y: 50 });
    expect(stroke.finish()).toEqual({ type: 'rectangle', x: 40, y: 50, width: 60, height: 30 });
  });

  it('is no area as a rectangle without width or height, or one that never moved', () => {
    const stroke = new ShapeStroke();
    stroke.mode = 'rectangle';
    stroke.begin({ x: 100, y: 80 });
    expect(stroke.finish()).toBeNull();
    stroke.begin({ x: 100, y: 80 });
    stroke.extend({ x: 100, y: 200 });
    expect(stroke.finish()).toBeNull();
  });

  it('leaves nothing of a cancelled stroke, and ignores points while none is under way', () => {
    const stroke = new ShapeStroke();
    stroke.begin({ x: 10, y: 10 });
    stroke.extend({ x: 30, y: 10 });
    stroke.cancel();
    expect(stroke.active).toBe(false);
    stroke.extend({ x: 50, y: 10 });
    expect(stroke.finish()).toBeNull();
    stroke.begin({ x: 1, y: 1 });
    expect(stroke.finish()).toEqual({ type: 'brush', points: [{ x: 1, y: 1 }], brushRadius: 50 });
  });

  it('does not keep the points it was given: a caller may reuse them', () => {
    const stroke = new ShapeStroke();
    const point = { x: 10, y: 10 };
    stroke.begin(point);
    point.x = 99;
    expect(stroke.finish()).toEqual({ type: 'brush', points: [{ x: 10, y: 10 }], brushRadius: 50 });
  });
});
