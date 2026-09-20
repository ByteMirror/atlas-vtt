import { describe, it, expect } from 'vitest';
import {
  captureFormation,
  placeFormation,
  cellToWorld,
  worldToCell,
  cellPitch,
  formationGridFromOptions,
  FALLBACK_PITCH,
  type FormationGrid,
  type Point,
} from '../encounterFormation';

const square = (size: number, offsetX = 0, offsetY = 0): FormationGrid => ({ type: 'square', size, offsetX, offsetY });
const hexV = (size: number, offsetX = 0, offsetY = 0): FormationGrid => ({ type: 'hex-vertical', size, offsetX, offsetY });
const hexH = (size: number, offsetX = 0, offsetY = 0): FormationGrid => ({ type: 'hex-horizontal', size, offsetX, offsetY });

function centers(grid: FormationGrid, cells: Array<[number, number]>): Point[] {
  return cells.map(([q, r]) => cellToWorld(grid, { q, r }));
}

function relativeCells(grid: FormationGrid, points: Point[]): Array<[number, number]> {
  const anchor = worldToCell(grid, points[0]!);
  return points.map((p) => {
    const c = worldToCell(grid, p);
    return [c.q - anchor.q, c.r - anchor.r];
  });
}

function distinctCells(grid: FormationGrid, points: Point[]): boolean {
  const keys = points.map((p) => {
    const c = worldToCell(grid, p);
    return `${c.q},${c.r}`;
  });
  return new Set(keys).size === keys.length;
}

const L_SHAPE: Array<[number, number]> = [[0, 0], [1, 0], [2, 0], [0, 1], [0, 2]];

describe('cell conversions', () => {
  it('round-trips square cells, including negative indices and offsets', () => {
    const grid = square(70, 13, -5);
    for (const [q, r] of [[0, 0], [-3, 2], [5, -7], [-1, -1]] as Array<[number, number]>) {
      expect(worldToCell(grid, cellToWorld(grid, { q, r }))).toEqual({ q, r });
    }
  });

  it('round-trips hex cells for both orientations', () => {
    for (const grid of [hexV(40, 7, 9), hexH(40, -12, 3)]) {
      for (const [q, r] of [[0, 0], [-3, 2], [4, -6], [-2, -2]] as Array<[number, number]>) {
        expect(worldToCell(grid, cellToWorld(grid, { q, r }))).toEqual({ q, r });
      }
    }
  });

  it('uses the centre-to-centre distance as pitch', () => {
    expect(cellPitch(square(70))).toBe(70);
    expect(cellPitch(hexV(40))).toBe(40);
    expect(cellPitch(hexH(40))).toBe(40);
  });
});

describe('formationGridFromOptions', () => {
  it('rejects disabled or degenerate grids', () => {
    expect(formationGridFromOptions(null)).toBeNull();
    expect(formationGridFromOptions({ size: 70, enabled: false })).toBeNull();
    expect(formationGridFromOptions({ size: 0 })).toBeNull();
    expect(formationGridFromOptions({ size: Number.NaN })).toBeNull();
  });

  it('defaults unknown types to square and fills missing offsets', () => {
    expect(formationGridFromOptions({ type: 'weird', size: 50 })).toEqual({ type: 'square', size: 50, offsetX: 0, offsetY: 0 });
    expect(formationGridFromOptions({ type: 'hex-vertical', size: 50, offsetX: 3 })).toEqual({ type: 'hex-vertical', size: 50, offsetX: 3, offsetY: 0 });
  });
});

describe('same grid type replay', () => {
  it('reproduces a square formation exactly on a square grid with a different size and offset', () => {
    const source = square(70, 0, 0);
    const target = square(100, 33, 17);
    const { formation, slots } = captureFormation(centers(source, L_SHAPE), source);

    const placed = placeFormation(slots, formation, { x: 1000, y: 800 }, target);

    expect(relativeCells(target, placed)).toEqual(L_SHAPE);
    expect(distinctCells(target, placed)).toBe(true);
    placed.forEach((p) => expect(p).toEqual(cellToWorld(target, worldToCell(target, p))));
  });

  it('reproduces a hex formation exactly on a hex grid of the same orientation', () => {
    const source = hexV(40, 5, 5);
    const target = hexV(60, -20, 11);
    const cells: Array<[number, number]> = [[0, 0], [1, 0], [0, 1], [-1, 1], [2, -1]];
    const { formation, slots } = captureFormation(centers(source, cells), source);

    const placed = placeFormation(slots, formation, { x: 500, y: 500 }, target);

    expect(relativeCells(target, placed)).toEqual(cells);
  });

  it('keeps tokens that were not snapped to cell centres in their nearest cells', () => {
    const grid = square(70);
    const jittered = centers(grid, L_SHAPE).map((p) => ({ x: p.x + 9, y: p.y - 11 }));
    const { formation, slots } = captureFormation(jittered, grid);

    const placed = placeFormation(slots, formation, { x: 0, y: 0 }, grid);

    expect(relativeCells(grid, placed)).toEqual(L_SHAPE);
  });
});

describe('cross grid type replay', () => {
  it('places every token on a distinct hex when a square formation is spawned on a hex grid', () => {
    const source = square(70);
    const target = hexV(40);
    const block: Array<[number, number]> = [[0, 0], [1, 0], [2, 0], [0, 1], [1, 1], [2, 1], [0, 2], [1, 2], [2, 2]];
    const { formation, slots } = captureFormation(centers(source, block), source);

    const placed = placeFormation(slots, formation, { x: 300, y: 300 }, target);

    expect(placed).toHaveLength(block.length);
    expect(distinctCells(target, placed)).toBe(true);
    placed.forEach((p) => expect(p).toEqual(cellToWorld(target, worldToCell(target, p))));
  });

  it('places every token on a distinct square when a hex formation is spawned on a square grid', () => {
    const source = hexH(40);
    const target = square(70);
    const ring: Array<[number, number]> = [[0, 0], [1, 0], [1, -1], [0, -1], [-1, 0], [-1, 1], [0, 1]];
    const { formation, slots } = captureFormation(centers(source, ring), source);

    const placed = placeFormation(slots, formation, { x: 300, y: 300 }, target);

    expect(distinctCells(target, placed)).toBe(true);
  });

  it('keeps neighbouring tokens roughly one cell apart across grid types', () => {
    const source = square(70);
    const target = hexV(40);
    const pair: Array<[number, number]> = [[0, 0], [1, 0]];
    const { formation, slots } = captureFormation(centers(source, pair), source);

    const [a, b] = placeFormation(slots, formation, { x: 0, y: 0 }, target);
    const distance = Math.hypot(b!.x - a!.x, b!.y - a!.y);

    expect(distance).toBeCloseTo(cellPitch(target), 5);
  });
});

describe('edge cases', () => {
  it('preserves raw pixel offsets when no grid is available at either end', () => {
    const positions: Point[] = [{ x: 10, y: 10 }, { x: 95, y: -30 }, { x: -40, y: 120 }];
    const { formation, slots } = captureFormation(positions, null);

    expect(formation.pitch).toBe(FALLBACK_PITCH);
    const placed = placeFormation(slots, formation, { x: 500, y: 500 }, null);
    placed.forEach((p, i) => {
      expect(p.x).toBeCloseTo(500 + positions[i]!.x - positions[0]!.x);
      expect(p.y).toBeCloseTo(500 + positions[i]!.y - positions[0]!.y);
    });
  });

  it('falls back to the nominal pitch when a stored pitch is invalid', () => {
    const { slots } = captureFormation([{ x: 0, y: 0 }, { x: 70, y: 0 }], null);
    const placed = placeFormation(slots, { gridType: 'square', pitch: Number.NaN }, { x: 0, y: 0 }, null);
    expect(placed[1]!.x).toBeCloseTo(70);
  });

  it('resolves collisions when several tokens share a cell', () => {
    const grid = square(70);
    const stacked: Point[] = [{ x: 35, y: 35 }, { x: 36, y: 34 }, { x: 34, y: 36 }];
    const { formation, slots } = captureFormation(stacked, grid);

    const placed = placeFormation(slots, formation, { x: 35, y: 35 }, grid);

    expect(distinctCells(grid, placed)).toBe(true);
  });

  it('handles an empty selection', () => {
    const { formation, slots } = captureFormation([], square(70));
    expect(slots).toEqual([]);
    expect(placeFormation(slots, formation, { x: 0, y: 0 }, square(70))).toEqual([]);
  });
});
