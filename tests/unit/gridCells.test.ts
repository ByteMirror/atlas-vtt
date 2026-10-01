import { describe, it, expect } from 'vitest';
import { gridCellAt, type CellGridGeometry } from '../../src/app/grid/gridCells';
import { hexCircumradius, type Point } from '../../src/app/grid/hexGeometry';

// ── helpers ──────────────────────────────────────────────────────────────

const SQUARE: CellGridGeometry = { type: 'square', size: 70, offsetX: 0, offsetY: 0 };
const POINTY: CellGridGeometry = { type: 'hex-vertical', size: 70, offsetX: 0, offsetY: 0 };
const FLAT: CellGridGeometry = { type: 'hex-horizontal', size: 70, offsetX: 0, offsetY: 0 };

/** Ray casting, independent of the production implementation. */
function polygonContains(polygon: Point[], point: Point): boolean {
  let inside = false;
  for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i++) {
    const a = polygon[i]!;
    const b = polygon[j]!;
    if ((a.y > point.y) !== (b.y > point.y) &&
        point.x < ((b.x - a.x) * (point.y - a.y)) / (b.y - a.y) + a.x) {
      inside = !inside;
    }
  }
  return inside;
}

function centroid(polygon: Point[]): Point {
  return {
    x: polygon.reduce((sum, p) => sum + p.x, 0) / polygon.length,
    y: polygon.reduce((sum, p) => sum + p.y, 0) / polygon.length,
  };
}

/** A spread of points that lands in many different cells, none of them on a cell edge. */
function scatter(): Point[] {
  const points: Point[] = [];
  for (let i = -3; i <= 3; i++) {
    for (let j = -3; j <= 3; j++) {
      points.push({ x: i * 37.3 + 11.7, y: j * 41.1 - 5.3 });
    }
  }
  return points;
}

// ── Square grids ─────────────────────────────────────────────────────────

describe('gridCellAt – square grids', () => {
  it('returns the four corners of the containing cell', () => {
    const cell = gridCellAt(SQUARE, { x: 10, y: 10 });
    expect(cell?.key).toBe('0,0');
    expect(cell?.polygon).toEqual([
      { x: 0, y: 0 },
      { x: 70, y: 0 },
      { x: 70, y: 70 },
      { x: 0, y: 70 },
    ]);
  });

  it('gives neighbouring points in one cell the same key and polygon', () => {
    const a = gridCellAt(SQUARE, { x: 1, y: 1 });
    const b = gridCellAt(SQUARE, { x: 69, y: 69 });
    expect(a?.key).toBe(b?.key);
    expect(a?.polygon).toEqual(b?.polygon);
  });

  it('moves to the next cell across a grid line', () => {
    expect(gridCellAt(SQUARE, { x: 71, y: 10 })?.key).toBe('1,0');
    expect(gridCellAt(SQUARE, { x: 10, y: 141 })?.key).toBe('0,2');
  });

  it('floors below the origin rather than truncating toward it', () => {
    const cell = gridCellAt(SQUARE, { x: -10, y: -10 });
    expect(cell?.key).toBe('-1,-1');
    expect(cell?.polygon[0]).toEqual({ x: -70, y: -70 });
  });

  it('follows the grid offset', () => {
    const offset: CellGridGeometry = { ...SQUARE, offsetX: 25, offsetY: 15 };
    const cell = gridCellAt(offset, { x: 30, y: 20 });
    expect(cell?.key).toBe('0,0');
    expect(cell?.polygon[0]).toEqual({ x: 25, y: 15 });
  });
});

// ── Hex grids ────────────────────────────────────────────────────────────

describe('gridCellAt – hex grids', () => {
  it.each([
    ['pointy-top', POINTY],
    ['flat-top', FLAT],
  ])('returns a six-sided cell on a %s grid', (_name, grid) => {
    const cell = gridCellAt(grid, { x: 30, y: 40 });
    expect(cell?.polygon).toHaveLength(6);
  });

  it('places every vertex one circumradius from the hex centre', () => {
    const cell = gridCellAt(POINTY, { x: 30, y: 40 })!;
    const centre = centroid(cell.polygon);
    const radius = hexCircumradius(70);
    for (const vertex of cell.polygon) {
      expect(Math.hypot(vertex.x - centre.x, vertex.y - centre.y)).toBeCloseTo(radius, 6);
    }
  });

  it('gives two points in one hex the same key and polygon', () => {
    const centre = centroid(gridCellAt(POINTY, { x: 30, y: 40 })!.polygon);
    const a = gridCellAt(POINTY, centre)!;
    const b = gridCellAt(POINTY, { x: centre.x + 5, y: centre.y - 5 })!;
    expect(a.key).toBe(b.key);
    expect(a.polygon).toEqual(b.polygon);
  });

  it('gives a neighbouring hex a different key', () => {
    const cell = gridCellAt(POINTY, { x: 30, y: 40 })!;
    const centre = centroid(cell.polygon);
    // One full flat-to-flat step sideways is the next hex in the same row.
    const neighbour = gridCellAt(POINTY, { x: centre.x + 70, y: centre.y })!;
    expect(neighbour.key).not.toBe(cell.key);
  });
});

// ── The property that matters for filling ────────────────────────────────

describe('gridCellAt – the returned cell contains the point', () => {
  it.each([
    ['square', SQUARE],
    ['pointy-top hex', POINTY],
    ['flat-top hex', FLAT],
    ['offset square', { ...SQUARE, offsetX: 18, offsetY: -9 } as CellGridGeometry],
    ['offset pointy-top hex', { ...POINTY, offsetX: 18, offsetY: -9 } as CellGridGeometry],
    ['offset flat-top hex', { ...FLAT, offsetX: 18, offsetY: -9 } as CellGridGeometry],
  ])('holds across a %s grid', (_name, grid) => {
    for (const point of scatter()) {
      const cell = gridCellAt(grid, point);
      expect(cell).not.toBeNull();
      expect(polygonContains(cell!.polygon, point)).toBe(true);
    }
  });

  it('never gives two different points in one cell different polygons', () => {
    const byKey = new Map<string, string>();
    for (const point of scatter()) {
      const cell = gridCellAt(POINTY, point)!;
      const shape = JSON.stringify(cell.polygon.map((p) => [p.x.toFixed(6), p.y.toFixed(6)]));
      const seen = byKey.get(cell.key);
      if (seen === undefined) byKey.set(cell.key, shape);
      else expect(shape).toBe(seen);
    }
    expect(byKey.size).toBeGreaterThan(1);
  });
});

// ── Grids with no usable geometry ────────────────────────────────────────

describe('gridCellAt – no usable grid', () => {
  it('returns null without a grid', () => {
    expect(gridCellAt(null, { x: 10, y: 10 })).toBeNull();
    expect(gridCellAt(undefined, { x: 10, y: 10 })).toBeNull();
  });

  it('returns null for a non-positive cell size', () => {
    expect(gridCellAt({ ...SQUARE, size: 0 }, { x: 10, y: 10 })).toBeNull();
    expect(gridCellAt({ ...POINTY, size: -70 }, { x: 10, y: 10 })).toBeNull();
  });

  it('treats a grid with no type as square', () => {
    const cell = gridCellAt({ size: 70, offsetX: 0, offsetY: 0 }, { x: 10, y: 10 });
    expect(cell?.polygon).toHaveLength(4);
  });
});
