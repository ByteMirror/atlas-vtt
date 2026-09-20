import { describe, it, expect } from 'vitest';
import { GridSystem } from '../../src/app/grid/GridSystem';
import type { GridType } from '../../src/app/grid/GridSystem';
import { axialToPixel, createHexLayout, hexCircumradius } from '../../src/app/grid/hexGeometry';

// Create a thin fake object that has only the .options field
function makeFakeGrid(size = 70, type: GridType = 'square', offsetX = 0, offsetY = 0) {
  const fake: any = { options: { type, size, offsetX, offsetY } };
  // Bind prototype methods to this fake object so `this` works
  fake.getHexLayout = (GridSystem.prototype as any).getHexLayout.bind(fake);
  fake.snapToGrid = GridSystem.prototype.snapToGrid.bind(fake);
  fake.snapToCellCenter = GridSystem.prototype.snapToCellCenter.bind(fake);
  return fake;
}

describe('Grid snapping helpers', () => {
  it('snapToGrid floors to cell origin', () => {
    const grid = makeFakeGrid(70);
    const res = grid.snapToGrid(123, 99);
    expect(res).toEqual({ x: 70, y: 70 });
  });

  it('snapToCellCenter returns centre of nearest cell', () => {
    const grid = makeFakeGrid(70);
    const res = grid.snapToCellCenter(123, 99);
    expect(res).toEqual({ x: 70 + 35, y: 70 + 35 });
  });

  it.each<GridType>(['hex-vertical', 'hex-horizontal'])('snapToCellCenter snaps to hex centers (%s)', (type) => {
    const grid = makeFakeGrid(70, type, 10, 20);
    const layout = createHexLayout(type, 70, 10, 20);
    const target = axialToPixel(layout, { q: 3, r: -2 });
    const radius = hexCircumradius(70);

    // A point well inside the hex snaps to its center, not to a square lattice.
    const snapped = grid.snapToCellCenter(target.x + radius * 0.4, target.y - radius * 0.3);
    expect(snapped.x).toBeCloseTo(target.x);
    expect(snapped.y).toBeCloseTo(target.y);
  });
});
