import { describe, it, expect } from 'vitest';
import { gridOffsetCenteredAt, normaliseGridOffset, resizedTokenCenter, snapTokenCenter } from '../../src/app/grid/gridPlacement';
import { createHexLayout, hexCellExtent, nearestHexCenter } from '../../src/app/grid/hexGeometry';
import type { HexGridType } from '../../src/app/grid/hexGeometry';
import { freehandCellSize, FREEHAND_CELL_SCREEN_SIZE } from '../../src/app/pixi/FreehandGridPreview';

const HEX_TYPES: HexGridType[] = ['hex-vertical', 'hex-horizontal'];

describe('gridOffsetCenteredAt', () => {
  it('puts square grid lines half a cell around the point', () => {
    expect(gridOffsetCenteredAt('square', 80, { x: 500, y: 300 })).toEqual({ offsetX: 460, offsetY: 260 });
  });

  it.each(HEX_TYPES)('centres a %s hex on the point', (type) => {
    const point = { x: 431.5, y: 287.25 };
    const { offsetX, offsetY } = gridOffsetCenteredAt(type, 64, point);
    const center = nearestHexCenter(createHexLayout(type, 64, offsetX, offsetY), point);
    expect(center.x).toBeCloseTo(point.x, 9);
    expect(center.y).toBeCloseTo(point.y, 9);
  });
});

describe('normaliseGridOffset', () => {
  it('wraps square offsets into one cell', () => {
    const normalised = normaliseGridOffset('square', 80, 460, -30);
    expect(normalised.offsetX).toBeCloseTo(60, 9);
    expect(normalised.offsetY).toBeCloseTo(50, 9);
  });

  it.each(HEX_TYPES)('keeps every %s hex centre in place', (type) => {
    const size = 57;
    const point = { x: 812.3, y: 604.9 };
    const centred = gridOffsetCenteredAt(type, size, point);
    const { offsetX, offsetY } = normaliseGridOffset(type, size, centred.offsetX, centred.offsetY);
    const layout = createHexLayout(type, size, offsetX, offsetY);
    const extent = hexCellExtent(layout);

    const center = nearestHexCenter(layout, point);
    expect(center.x).toBeCloseTo(point.x, 9);
    expect(center.y).toBeCloseTo(point.y, 9);
    // Hex (0, 0) now contains the world origin.
    expect(Math.abs(offsetX + extent.width / 2)).toBeLessThanOrEqual(extent.width);
    expect(Math.abs(offsetY + extent.height / 2)).toBeLessThanOrEqual(extent.height);
  });
});

describe('freehandCellSize', () => {
  it('turns the fixed on-screen preview cell into world units at the current zoom', () => {
    expect(freehandCellSize(1)).toBe(FREEHAND_CELL_SCREEN_SIZE);
    expect(freehandCellSize(2)).toBe(FREEHAND_CELL_SCREEN_SIZE / 2);
    expect(freehandCellSize(0.5)).toBe(FREEHAND_CELL_SCREEN_SIZE * 2);
  });
});

describe('snapTokenCenter', () => {
  const CELL = 70;
  const toCell = (point: { x: number; y: number }): { x: number; y: number } => ({
    x: Math.floor((point.x - 5) / CELL) * CELL + 5 + CELL / 2,
    y: Math.floor((point.y - 5) / CELL) * CELL + 5 + CELL / 2,
  });

  it.each([1, 2, 3])('centres an odd footprint (size %s) on a cell centre', (size) => {
    expect(snapTokenCenter({ x: 150, y: 90 }, size, 'square', CELL, toCell)).toEqual({ x: 180, y: 110 });
  });

  it.each([1.5, 2.5])('centres an even footprint (size %s) on the nearest grid intersection', (size) => {
    expect(snapTokenCenter({ x: 150, y: 90 }, size, 'square', CELL, toCell)).toEqual({ x: 145, y: 75 });
    expect(snapTokenCenter({ x: 190, y: 130 }, size, 'square', CELL, toCell)).toEqual({ x: 215, y: 145 });
  });

  it.each(HEX_TYPES)('centres every footprint on a hex on %s grids', (type) => {
    const layout = createHexLayout(type, 64, 0, 0);
    const toHex = (point: { x: number; y: number }): { x: number; y: number } => nearestHexCenter(layout, point);
    const point = { x: 200, y: 150 };
    expect(snapTokenCenter(point, 1.5, type, 64, toHex)).toEqual(toHex(point));
  });
});

describe('resizedTokenCenter', () => {
  const grid = { type: 'square' as const, size: 70, snapToGrid: true };

  it('keeps the top-left corner, so a Medium token grown to Large moves onto the intersection', () => {
    expect(resizedTokenCenter({ x: 35, y: 35 }, 1, 1.5, grid)).toEqual({ x: 70, y: 70 });
    expect(resizedTokenCenter({ x: 70, y: 70 }, 1.5, 2.5, grid)).toEqual({ x: 140, y: 140 });
    expect(resizedTokenCenter({ x: 140, y: 140 }, 2.5, 1, grid)).toEqual({ x: 35, y: 35 });
  });

  it('keeps the centre without snapping and on hex grids', () => {
    expect(resizedTokenCenter({ x: 35, y: 35 }, 1, 1.5, { ...grid, snapToGrid: false })).toEqual({ x: 35, y: 35 });
    expect(resizedTokenCenter({ x: 35, y: 35 }, 1, 1.5, { ...grid, type: 'hex-vertical' })).toEqual({ x: 35, y: 35 });
    expect(resizedTokenCenter({ x: 35, y: 35 }, 1, 1.5, null)).toEqual({ x: 35, y: 35 });
  });
});
