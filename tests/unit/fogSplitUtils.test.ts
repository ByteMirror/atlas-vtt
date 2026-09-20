import { describe, it, expect } from 'vitest';
import {
  labelComponents,
  componentToPolygon,
  simplifyPolygon,
} from '../../src/app/pixi/fog/fogSplitUtils';

// ── helpers ──────────────────────────────────────────────────────────────

/** Create a synthetic ImageData-like object from a 2-D alpha mask. */
function makeImageData(alphaGrid: number[][]): ImageData {
  const height = alphaGrid.length;
  const width = alphaGrid[0]!.length;
  const data = new Uint8ClampedArray(width * height * 4);

  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const idx = (y * width + x) * 4;
      const a = alphaGrid[y]![x]!;
      data[idx] = 0;     // R
      data[idx + 1] = 0; // G
      data[idx + 2] = 0; // B
      data[idx + 3] = a; // A
    }
  }

  return { data, width, height, colorSpace: 'srgb' } as ImageData;
}

// ── simplifyPolygon ──────────────────────────────────────────────────────

describe('simplifyPolygon', () => {
  it('returns all points when count <= 3', () => {
    const tri = [
      { x: 0, y: 0 },
      { x: 10, y: 0 },
      { x: 5, y: 10 },
    ];
    expect(simplifyPolygon(tri, 1)).toEqual(tri);
  });

  it('removes collinear points', () => {
    const pts = [
      { x: 0, y: 0 },
      { x: 5, y: 0 },
      { x: 10, y: 0 },
      { x: 15, y: 0 },
    ];
    const simplified = simplifyPolygon(pts, 0.1);
    // Ramer-Douglas-Peucker should reduce to just endpoints
    expect(simplified).toEqual([
      { x: 0, y: 0 },
      { x: 15, y: 0 },
    ]);
  });

  it('keeps points that deviate beyond tolerance', () => {
    const pts = [
      { x: 0, y: 0 },
      { x: 5, y: 20 },
      { x: 10, y: 0 },
    ];
    const simplified = simplifyPolygon(pts, 1);
    // The middle point deviates significantly — must be kept
    expect(simplified.length).toBe(3);
  });

  it('large tolerance collapses everything to endpoints', () => {
    const pts = [
      { x: 0, y: 0 },
      { x: 5, y: 3 },
      { x: 10, y: 1 },
      { x: 20, y: 0 },
    ];
    const simplified = simplifyPolygon(pts, 100);
    expect(simplified).toEqual([
      { x: 0, y: 0 },
      { x: 20, y: 0 },
    ]);
  });
});

// ── labelComponents ──────────────────────────────────────────────────────

describe('labelComponents', () => {
  it('finds one component for a solid block', () => {
    // 3x3 fully opaque
    const grid = [
      [255, 255, 255],
      [255, 255, 255],
      [255, 255, 255],
    ];
    const { components } = labelComponents(makeImageData(grid), 3, 3);
    expect(components).toHaveLength(1);
    expect(components[0]).toMatchObject({
      label: 0,
      minX: 0,
      minY: 0,
      maxX: 2,
      maxY: 2,
      pixelCount: 9,
    });
  });

  it('finds zero components for a fully transparent image', () => {
    const grid = [
      [0, 0, 0],
      [0, 0, 0],
    ];
    const { components } = labelComponents(makeImageData(grid), 3, 2);
    expect(components).toHaveLength(0);
  });

  it('finds two separate components', () => {
    // Two islands separated by transparent column
    const grid = [
      [255, 0, 255],
      [255, 0, 255],
    ];
    const { components } = labelComponents(makeImageData(grid), 3, 2);
    expect(components).toHaveLength(2);
  });

  it('treats diagonally adjacent pixels as connected (8-connectivity)', () => {
    // Diagonal line — should be ONE component thanks to 8-connectivity
    const grid = [
      [255, 0, 0],
      [0, 255, 0],
      [0, 0, 255],
    ];
    const { components } = labelComponents(makeImageData(grid), 3, 3);
    expect(components).toHaveLength(1);
  });

  it('respects alpha threshold (alpha < 10 is transparent)', () => {
    const grid = [
      [9, 255],  // first pixel below threshold
      [255, 9],
    ];
    const { components } = labelComponents(makeImageData(grid), 2, 2);
    // The two opaque pixels are diagonally adjacent → 1 component
    expect(components).toHaveLength(1);
  });
});

// ── componentToPolygon ───────────────────────────────────────────────────

describe('componentToPolygon', () => {
  it('converts a rectangular component to a polygon in world coords', () => {
    // 20x20 image with a solid 16x16 block (big enough to survive simplification)
    const size = 20;
    const grid: number[][] = [];
    for (let y = 0; y < size; y++) {
      const row: number[] = [];
      for (let x = 0; x < size; x++) {
        row.push(x >= 2 && x <= 17 && y >= 2 && y <= 17 ? 255 : 0);
      }
      grid.push(row);
    }

    const imageData = makeImageData(grid);
    const { labels, components } = labelComponents(imageData, size, size);
    expect(components).toHaveLength(1);

    const canvasBounds = { x: 100, y: 200, width: size, height: size };
    const polygon = componentToPolygon(labels, components[0]!, size, canvasBounds, 1);

    // Large block should produce a valid polygon (>= 3 vertices)
    expect(polygon.length).toBeGreaterThanOrEqual(3);
    // All coords should be offset by canvasBounds origin
    for (const p of polygon) {
      expect(p.x).toBeGreaterThanOrEqual(100);
      expect(p.y).toBeGreaterThanOrEqual(200);
    }
  });

  it('applies scale correctly', () => {
    // 2x2 solid block, scale = 0.5 → world coords are doubled
    const grid = [
      [255, 255],
      [255, 255],
    ];
    const imageData = makeImageData(grid);
    const { labels, components } = labelComponents(imageData, 2, 2);
    const canvasBounds = { x: 0, y: 0, width: 2, height: 2 };
    const polygon = componentToPolygon(labels, components[0]!, 2, canvasBounds, 0.5);

    // At scale 0.5, pixel 0 → world 0, pixel 2 → world 4
    const maxX = Math.max(...polygon.map((p) => p.x));
    expect(maxX).toBeCloseTo(4, 0);
  });
});
