import { describe, it, expect } from 'vitest';
import { createHexLayout, hexCellExtent } from '../../src/app/grid/hexGeometry';
import type { AxialCoord } from '../../src/app/grid/hexGeometry';
import { axialKey, hexLattice } from '../../src/app/grid/hexLattice';
import { squareLattice } from '../../src/app/grid/squareLattice';
import { cellLabelsByKey, numberCells } from '../../src/app/grid/cellNumbering';
import type { MapRect } from '../../src/app/grid/cellNumbering';

const SIZE = 100;

function axialOf(key: string): AxialCoord {
  const [q, r] = key.split(',').map(Number);
  return { q: q!, r: r! };
}

describe('numberCells', () => {
  describe('flat-top grid (columns)', () => {
    const layout = createHexLayout('hex-horizontal', SIZE, 0, 0);
    const lattice = hexLattice(layout);
    const { width } = hexCellExtent(layout);
    // Four columns and three whole hexes per column; odd columns sit half a hex lower
    const map: MapRect = { x: 0, y: 0, width: width + 1.5 * (width / 2) * 3, height: 3.5 * SIZE };

    it('numbers column then row, counting each column from its first whole hex', () => {
      const labels = cellLabelsByKey(numberCells(lattice, map, 'column-row'));
      expect(labels.get(axialKey({ q: 0, r: 0 }))).toBe('0101');
      expect(labels.get(axialKey({ q: 0, r: 1 }))).toBe('0102');
      // Column 2 is staggered down half a hex, so its first hex is still row 1
      expect(labels.get(axialKey({ q: 1, r: 0 }))).toBe('0201');
      expect(labels.get(axialKey({ q: 2, r: -1 }))).toBe('0301');
      expect(labels.get(axialKey({ q: 3, r: -1 }))).toBe('0401');
    });

    it('leaves out hexes the map edge cuts in half', () => {
      const hexes = numberCells(lattice, map, 'column-row');
      // The fourth hex of each column would cross the bottom edge
      expect(hexes.filter((hex) => axialOf(hex.key).q === 0)).toHaveLength(3);
      expect(hexes.filter((hex) => axialOf(hex.key).q === 1)).toHaveLength(3);
      for (const hex of hexes) {
        expect(hex.center.x).toBeGreaterThan(map.x + 0.4 * SIZE - 1e-6);
        expect(hex.center.y).toBeLessThan(map.y + map.height - 0.4 * SIZE + 1e-6);
      }
    });

    it('counts sequential numbers in reading order', () => {
      const labels = cellLabelsByKey(numberCells(lattice, map, 'sequential'));
      expect(labels.get(axialKey({ q: 0, r: 0 }))).toBe('1');
      expect(labels.get(axialKey({ q: 1, r: 0 }))).toBe('2');
      expect(labels.get(axialKey({ q: 3, r: -1 }))).toBe('4');
      expect(labels.get(axialKey({ q: 0, r: 1 }))).toBe('5');
    });
  });

  describe('pointy-top grid (rows)', () => {
    const layout = createHexLayout('hex-vertical', SIZE, 0, 0);
    const lattice = hexLattice(layout);
    const { height } = hexCellExtent(layout);
    const map: MapRect = { x: 0, y: 0, width: 4 * SIZE, height: height + 1.5 * (height / 2) };

    it('numbers column then row', () => {
      const labels = cellLabelsByKey(numberCells(lattice, map, 'column-row'));
      expect(labels.get(axialKey({ q: 0, r: 0 }))).toBe('0101');
      expect(labels.get(axialKey({ q: 3, r: 0 }))).toBe('0401');
      // Row 2 is shifted half a hex right, so its first whole hex is q = 0
      expect(labels.get(axialKey({ q: 0, r: 1 }))).toBe('0102');
    });

    it('drops the half hex at the end of the shifted row', () => {
      const hexes = numberCells(lattice, map, 'column-row');
      expect(hexes.filter((hex) => axialOf(hex.key).r === 0)).toHaveLength(4);
      expect(hexes.filter((hex) => axialOf(hex.key).r === 1)).toHaveLength(3);
    });
  });

  it('follows the grid offset', () => {
    const layout = createHexLayout('hex-horizontal', SIZE, -300, -200);
    const lattice = hexLattice(layout);
    const map: MapRect = { x: 0, y: 0, width: 400, height: 400 };
    const hexes = numberCells(lattice, map, 'column-row');
    const first = hexes.find((hex) => hex.label === '0101');
    expect(first).toBeDefined();
    expect(first!.center.x).toBeGreaterThanOrEqual(0.4 * SIZE);
    expect(first!.center.y).toBeGreaterThanOrEqual(0.4 * SIZE);
    expect(first!.center.x).toBeLessThan(0.4 * SIZE + 1.5 * (SIZE / Math.sqrt(3)));
  });

  it('pads labels to the widest number', () => {
    const layout = createHexLayout('hex-vertical', 10, 0, 0);
    const lattice = hexLattice(layout);
    const hexes = numberCells(lattice, { x: 0, y: 0, width: 1200, height: 100 }, 'column-row');
    expect(hexes[0]!.label).toBe('00101');
    expect(hexes.some((hex) => hex.label.startsWith('100'))).toBe(true);
  });

  it('numbers nothing on an empty map', () => {
    const layout = createHexLayout('hex-vertical', SIZE, 0, 0);
    const lattice = hexLattice(layout);
    expect(numberCells(lattice, { x: 0, y: 0, width: 0, height: 0 }, 'sequential')).toEqual([]);
  });
});

describe('square grid', () => {
  it('numbers a one-cell map as a single cell, labelled 0101, centred in the cell', () => {
    const lattice = squareLattice(SIZE, 0, 0);
    const map: MapRect = { x: 0, y: 0, width: SIZE, height: SIZE };
    const cells = numberCells(lattice, map, 'column-row');
    expect(cells).toHaveLength(1);
    expect(cells[0]!.label).toBe('0101');
    expect(cells[0]!.center).toEqual({ x: SIZE / 2, y: SIZE / 2 });
  });

  it('runs column then row across a 3x2 map', () => {
    const lattice = squareLattice(SIZE, 0, 0);
    const map: MapRect = { x: 0, y: 0, width: 3 * SIZE, height: 2 * SIZE };
    const cells = numberCells(lattice, map, 'column-row');
    const labels = cells.map((cell) => cell.label).sort();
    expect(labels).toEqual(['0101', '0102', '0201', '0202', '0301', '0302']);
    const topRight = cells.find((cell) => cell.label === '0301');
    expect(topRight!.center).toEqual({ x: 2.5 * SIZE, y: 0.5 * SIZE });
  });

  it('leaves out a column the map edge cuts in half', () => {
    const lattice = squareLattice(SIZE, 0, 0);
    const map: MapRect = { x: 0, y: 0, width: 2.5 * SIZE, height: SIZE };
    const cells = numberCells(lattice, map, 'column-row');
    expect(cells).toHaveLength(2);
  });

  it('keeps a column that is 90% inside the map', () => {
    const lattice = squareLattice(SIZE, 0, 0);
    const map: MapRect = { x: 0, y: 0, width: 2.9 * SIZE, height: SIZE };
    const cells = numberCells(lattice, map, 'column-row');
    expect(cells).toHaveLength(3);
  });

  it('follows a negative grid offset', () => {
    const lattice = squareLattice(SIZE, -50, -50);
    const map: MapRect = { x: -SIZE, y: -SIZE, width: 4 * SIZE, height: 4 * SIZE };
    const cells = numberCells(lattice, map, 'column-row');
    const first = cells.find((cell) => cell.label === '0101');
    expect(first!.center).toEqual({ x: 0, y: 0 });
  });

  it('counts sequential numbers in reading order', () => {
    const lattice = squareLattice(SIZE, 0, 0);
    const map: MapRect = { x: 0, y: 0, width: 3 * SIZE, height: 2 * SIZE };
    const cells = numberCells(lattice, map, 'sequential');
    const byPosition = new Map(cells.map((cell) => [`${cell.center.x},${cell.center.y}`, cell.label]));
    expect(byPosition.get('50,50')).toBe('1');
    expect(byPosition.get('150,50')).toBe('2');
    expect(byPosition.get('250,50')).toBe('3');
    expect(byPosition.get('50,150')).toBe('4');
  });
});
