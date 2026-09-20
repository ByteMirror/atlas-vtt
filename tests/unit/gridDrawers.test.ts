import { describe, it, expect } from 'vitest';
import { drawSquareGrid } from '../../src/app/grid/squareGridDrawer';
import { drawHexGrid } from '../../src/app/grid/hexGridDrawer';
import { axialToPixel, createHexLayout, hexCircumradius, hexVertices } from '../../src/app/grid/hexGeometry';
import type { GridBounds } from '../../src/app/grid/gridLineStyle';

interface Segment {
  x1: number;
  y1: number;
  x2: number;
  y2: number;
}

/** Records straight segments and polygons issued through the PIXI Graphics API. */
function createRecorder(): { graphics: any; segments: Segment[]; polygons: number[][] } {
  const segments: Segment[] = [];
  const polygons: number[][] = [];
  let cursor = { x: 0, y: 0 };
  const graphics = {
    moveTo(x: number, y: number) {
      cursor = { x, y };
      return graphics;
    },
    lineTo(x: number, y: number) {
      segments.push({ x1: cursor.x, y1: cursor.y, x2: x, y2: y });
      cursor = { x, y };
      return graphics;
    },
    poly(points: number[]) {
      polygons.push(points);
      return graphics;
    },
  };
  return { graphics, segments, polygons };
}

const key = (x: number, y: number): string => `${x.toFixed(3)},${y.toFixed(3)}`;
const edgeKey = (s: Segment): string => [key(s.x1, s.y1), key(s.x2, s.y2)].sort().join('|');

describe('drawSquareGrid', () => {
  it('draws one full-length line per grid position inside the bounds', () => {
    const { graphics, segments } = createRecorder();
    const bounds: GridBounds = { minX: 0, minY: 0, maxX: 210, maxY: 140 };

    drawSquareGrid(graphics, bounds, 70, 0, 0, 'solid');

    const verticals = segments.filter((s) => s.x1 === s.x2).map((s) => s.x1).sort((a, b) => a - b);
    const horizontals = segments.filter((s) => s.y1 === s.y2).map((s) => s.y1).sort((a, b) => a - b);
    expect(verticals).toEqual([0, 70, 140, 210]);
    expect(horizontals).toEqual([0, 70, 140]);
    expect(segments.every((s) => s.x1 === s.x2 ? s.y1 === 0 && s.y2 === 140 : s.x1 === 0 && s.x2 === 210)).toBe(true);
  });

  it('draws one four-armed marker per intersection for the dotted style', () => {
    const { graphics, segments, polygons } = createRecorder();
    drawSquareGrid(graphics, { minX: 0, minY: 0, maxX: 210, maxY: 140 }, 70, 0, 0, 'dotted', 2);

    expect(segments).toHaveLength(0);
    expect(polygons).toHaveLength(4 * 3);
    for (const polygon of polygons) {
      expect(polygon).toHaveLength(12 * 2);
    }
  });

  it('honours the grid offset', () => {
    const { graphics, segments } = createRecorder();
    drawSquareGrid(graphics, { minX: 0, minY: 0, maxX: 200, maxY: 200 }, 70, 15, -20, 'solid');

    const verticals = segments.filter((s) => s.x1 === s.x2).map((s) => s.x1);
    const horizontals = segments.filter((s) => s.y1 === s.y2).map((s) => s.y1);
    expect(verticals).toEqual([15, 85, 155]);
    expect(horizontals).toEqual([50, 120, 190]);
  });
});

describe('drawHexGrid', () => {
  it.each(['hex-vertical', 'hex-horizontal'] as const)('draws every hex edge exactly once (%s)', (type) => {
    const size = 70;
    const layout = createHexLayout(type, size, 12, -7);
    const radius = hexCircumradius(size);
    const bounds: GridBounds = { minX: -50, minY: -50, maxX: 400, maxY: 400 };
    const { graphics, segments } = createRecorder();

    drawHexGrid(graphics, bounds, layout, 'solid');

    // Every emitted segment is one hex edge (length = circumradius) and none is repeated.
    const keys = new Set<string>();
    for (const s of segments) {
      expect(Math.hypot(s.x2 - s.x1, s.y2 - s.y1)).toBeCloseTo(radius, 6);
      const k = edgeKey(s);
      expect(keys.has(k)).toBe(false);
      keys.add(k);
    }

    // Every hex whose center lies inside the bounds has all six of its edges present.
    for (let q = -6; q <= 6; q++) {
      for (let r = -6; r <= 6; r++) {
        const center = axialToPixel(layout, { q, r });
        if (center.x < bounds.minX || center.x > bounds.maxX || center.y < bounds.minY || center.y > bounds.maxY) continue;
        const vertices = hexVertices(layout, center).map((v) => ({ x: v.x - bounds.minX, y: v.y - bounds.minY }));
        for (let i = 0; i < 6; i++) {
          const a = vertices[i]!;
          const b = vertices[(i + 1) % 6]!;
          expect(keys.has(edgeKey({ x1: a.x, y1: a.y, x2: b.x, y2: b.y }))).toBe(true);
        }
      }
    }
  });

  it.each(['hex-vertical', 'hex-horizontal'] as const)('draws one three-armed marker per vertex for the dotted style (%s)', (type) => {
    const layout = createHexLayout(type, 70, 5, -3);
    const solid = createRecorder();
    const dotted = createRecorder();
    const bounds: GridBounds = { minX: 0, minY: 0, maxX: 300, maxY: 300 };

    drawHexGrid(solid.graphics, bounds, layout, 'solid');
    drawHexGrid(dotted.graphics, bounds, layout, 'dotted', 2);

    const inside = (x: number, y: number): boolean => x >= 0 && x <= 300 && y >= 0 && y <= 300;
    const vertexKeys = new Set(
      solid.segments
        .flatMap((s) => [[s.x1, s.y1], [s.x2, s.y2]])
        .filter(([x, y]) => inside(x!, y!))
        .map(([x, y]) => key(x!, y!)),
    );

    // A marker polygon lists two tip corners per arm plus one inner corner; the
    // tip corners of three arms at 120° average out to the vertex itself.
    const markerKeys = new Set<string>();
    for (const polygon of dotted.polygons) {
      expect(polygon).toHaveLength(9 * 2);
      const tips = [0, 1, 3, 4, 6, 7];
      const cx = tips.reduce((sum, i) => sum + polygon[i * 2]!, 0) / tips.length;
      const cy = tips.reduce((sum, i) => sum + polygon[i * 2 + 1]!, 0) / tips.length;
      if (inside(cx, cy)) markerKeys.add(key(cx, cy));
    }

    expect(dotted.segments).toHaveLength(0);
    expect(markerKeys).toEqual(vertexKeys);
  });
});
