import { describe, it, expect } from 'vitest';
import { pathLengthInCells, type GridGeometry } from '../../src/app/grid/gridDistance';
import { axialToPixel, createHexLayout } from '../../src/app/grid/hexGeometry';

const square: GridGeometry = { type: 'square', size: 70, offsetX: 0, offsetY: 0 };
const cell = (col: number, row: number): { x: number; y: number } => ({ x: 35 + col * 70, y: 35 + row * 70 });

describe('pathLengthInCells on square grids', () => {
  it('counts straight moves in cells', () => {
    expect(pathLengthInCells(square, [cell(0, 0), cell(4, 0)], 'equidistant')).toBe(4);
  });

  it('counts every diagonal as 1 under the equidistant rule', () => {
    expect(pathLengthInCells(square, [cell(0, 0), cell(3, 3)], 'equidistant')).toBe(3);
    expect(pathLengthInCells(square, [cell(0, 0), cell(4, 2)], 'equidistant')).toBe(4);
  });

  it('alternates diagonals between 1 and 2', () => {
    expect(pathLengthInCells(square, [cell(0, 0), cell(1, 1)], 'alternating')).toBe(1);
    expect(pathLengthInCells(square, [cell(0, 0), cell(2, 2)], 'alternating')).toBe(3);
    expect(pathLengthInCells(square, [cell(0, 0), cell(3, 3)], 'alternating')).toBe(4);
    expect(pathLengthInCells(square, [cell(0, 0), cell(4, 2)], 'alternating')).toBe(5);
  });

  it('carries the alternating count across waypoints', () => {
    expect(pathLengthInCells(square, [cell(0, 0), cell(1, 1), cell(2, 2)], 'alternating')).toBe(3);
  });

  it('measures the straight line under the euclidean rule', () => {
    expect(pathLengthInCells(square, [cell(0, 0), cell(3, 4)], 'euclidean')).toBeCloseTo(5);
  });

  it('adds up the segments of a path', () => {
    expect(pathLengthInCells(square, [cell(0, 0), cell(3, 0), cell(3, 2)], 'equidistant')).toBe(5);
  });

  it('is zero for a single point', () => {
    expect(pathLengthInCells(square, [cell(2, 2)], 'equidistant')).toBe(0);
  });
});

describe('pathLengthInCells on hex grids', () => {
  const hex: GridGeometry = { type: 'hex-vertical', size: 60, offsetX: 0, offsetY: 0 };
  const layout = createHexLayout('hex-vertical', 60, 0, 0);

  it('counts hex steps and ignores the diagonal rule', () => {
    const points = [axialToPixel(layout, { q: 0, r: 0 }), axialToPixel(layout, { q: 3, r: -1 })];
    expect(pathLengthInCells(hex, points, 'equidistant')).toBe(3);
    expect(pathLengthInCells(hex, points, 'alternating')).toBe(3);
  });

  it('adds up steps across waypoints', () => {
    const points = [{ q: 0, r: 0 }, { q: 2, r: 0 }, { q: 2, r: 2 }].map(hexCell => axialToPixel(layout, hexCell));
    expect(pathLengthInCells(hex, points, 'euclidean')).toBe(4);
  });
});
