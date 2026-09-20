import { describe, it, expect } from 'vitest';
import { calculateHexAlignment, detectHexOrientation, hexSizeFromEdge } from '../../src/app/pixi/hexAlignmentMath';
import type { MeasurementPair } from '../../src/app/pixi/gridAlignmentMath';
import { axialToPixel, createHexLayout, hexVertices } from '../../src/app/grid/hexGeometry';
import type { HexGridType, HexLayout, Point } from '../../src/app/grid/hexGeometry';

/** Edge between corner `corner` and the next corner of hex (q, r), with deterministic click noise. */
function edgeOf(layout: HexLayout, q: number, r: number, corner: number, noise: number): MeasurementPair {
  const vertices = hexVertices(layout, axialToPixel(layout, { q, r }));
  const a = vertices[corner]!;
  const b = vertices[(corner + 1) % 6]!;
  return {
    a: { x: a.x + noise, y: a.y - noise * 0.6 },
    b: { x: b.x - noise * 0.8, y: b.y + noise },
  };
}

/** Distance from `point` to the nearest corner of the lattice described by `layout`. */
function distanceToNearestCorner(layout: HexLayout, point: Point): number {
  let best = Infinity;
  for (let q = -30; q <= 30; q++) {
    for (let r = -30; r <= 30; r++) {
      for (const v of hexVertices(layout, axialToPixel(layout, { q, r }))) {
        best = Math.min(best, Math.hypot(v.x - point.x, v.y - point.y));
      }
    }
  }
  return best;
}

function resultLayout(type: HexGridType, result: { cellSize: number; offsetX: number; offsetY: number }): HexLayout {
  return createHexLayout(type, result.cellSize, result.offsetX, result.offsetY);
}

describe('hex edge measurements', () => {
  it('derives the flat-to-flat size from an edge length', () => {
    expect(hexSizeFromEdge({ a: { x: 0, y: 0 }, b: { x: 0, y: 40 } })).toBeCloseTo(40 * Math.sqrt(3));
    expect(hexSizeFromEdge({ a: { x: 0, y: 0 }, b: { x: 0.2, y: 0 } })).toBe(0);
  });

  it('detects orientation from edge angles', () => {
    const pointy = createHexLayout('hex-vertical', 70, 0, 0);
    const flat = createHexLayout('hex-horizontal', 70, 0, 0);
    const pointyEdges = [0, 1, 2].map((c) => edgeOf(pointy, 2, -1, c, 0));
    const flatEdges = [0, 1, 2].map((c) => edgeOf(flat, 2, -1, c, 0));

    expect(detectHexOrientation(pointyEdges, 'hex-horizontal')).toBe('hex-vertical');
    expect(detectHexOrientation(flatEdges, 'hex-vertical')).toBe('hex-horizontal');
  });
});

describe('calculateHexAlignment', () => {
  it('recovers the lattice exactly from a single edge (quick mode)', () => {
    const truth = createHexLayout('hex-horizontal', 91.4, 33, -12);
    const edge = edgeOf(truth, 4, 2, 3, 0);

    const result = calculateHexAlignment([edge], 'hex-horizontal')!;

    expect(result.gridType).toBe('hex-horizontal');
    expect(result.cellSize).toBeCloseTo(91.4, 1);
    const fitted = resultLayout('hex-horizontal', result);
    expect(distanceToNearestCorner(fitted, edge.a)).toBeLessThan(0.05);
    expect(distanceToNearestCorner(fitted, edge.b)).toBeLessThan(0.05);
  });

  it.each<HexGridType>(['hex-vertical', 'hex-horizontal'])(
    'fuses four noisy far-apart edges into a sub-percent size and switches to the detected orientation (%s)',
    (type) => {
      const truth = createHexLayout(type, 73.3, 12.5, -8.2);
      const wrongType: HexGridType = type === 'hex-vertical' ? 'hex-horizontal' : 'hex-vertical';
      const pairs = [
        edgeOf(truth, -12, -9, 0, 1.5),
        edgeOf(truth, 11, -10, 2, -1.2),
        edgeOf(truth, -10, 12, 4, 1.0),
        edgeOf(truth, 13, 10, 1, -1.4),
      ];

      const result = calculateHexAlignment(pairs, wrongType)!;

      expect(result.gridType).toBe(type);
      expect(Math.abs(result.cellSize - 73.3) / 73.3).toBeLessThan(0.005);
      expect(result.maxResidual).toBeLessThan(4);

      // Corners far from every measurement must still land on the fitted lattice.
      const fitted = resultLayout(type, result);
      for (const [q, r] of [[0, 0], [15, -3], [-14, 14], [6, 12]] as Array<[number, number]>) {
        const trueCorner = hexVertices(truth, axialToPixel(truth, { q, r }))[2]!;
        expect(distanceToNearestCorner(fitted, trueCorner)).toBeLessThan(3);
      }
    },
  );

  it('reports a large residual when one edge does not belong to the same lattice', () => {
    const truth = createHexLayout('hex-vertical', 70, 0, 0);
    const pairs = [edgeOf(truth, 0, 0, 0, 0), edgeOf(truth, 8, -3, 1, 0)];
    pairs[1] = { a: { x: pairs[1]!.a.x + 18, y: pairs[1]!.a.y }, b: { x: pairs[1]!.b.x + 18, y: pairs[1]!.b.y + 9 } };

    const result = calculateHexAlignment(pairs, 'hex-vertical')!;

    expect(result.maxResidual).toBeGreaterThan(3);
  });
});
