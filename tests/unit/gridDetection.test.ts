import { describe, it, expect } from 'vitest';
import { detectGridInImage } from '../../src/app/pixi/gridDetection/detectGrid';
import { gridLineSamples } from '../../src/app/pixi/gridDetection/gridTemplate';
import type { GrayImage } from '../../src/app/pixi/gridDetection/grayImage';
import { fftInPlace } from '../../src/app/pixi/gridDetection/fft';
import type { GridType } from '../../src/app/grid/GridSystem';
import { axialToPixel, createHexLayout, hexVertices, isHexGridType } from '../../src/app/grid/hexGeometry';

/** Deterministic pseudo-random numbers so the synthetic maps are reproducible. */
function rng(seed: number): () => number {
  let state = seed;
  return () => {
    state = (state * 1664525 + 1013904223) >>> 0;
    return state / 0x100000000;
  };
}

/** A fake map: textured background, some large blobs, and a thin grid drawn with the real drawers. */
function syntheticMap(gridType: GridType, cellSize: number, offsetX: number, offsetY: number, width: number, height: number): GrayImage {
  const random = rng(7);
  const data = new Float32Array(width * height);
  for (let i = 0; i < data.length; i++) data[i] = 170 + (random() - 0.5) * 40;

  for (let b = 0; b < 12; b++) {
    const cx = random() * width;
    const cy = random() * height;
    const r = 30 + random() * 120;
    const shade = 60 + random() * 120;
    for (let y = Math.max(0, cy - r); y < Math.min(height, cy + r); y++) {
      for (let x = Math.max(0, cx - r); x < Math.min(width, cx + r); x++) {
        if ((x - cx) ** 2 + (y - cy) ** 2 < r * r) data[Math.floor(y) * width + Math.floor(x)] = shade;
      }
    }
  }

  const bounds = { minX: -cellSize, minY: -cellSize, maxX: width + cellSize, maxY: height + cellSize };
  for (const s of gridLineSamples(gridType, cellSize, offsetX, offsetY, bounds, 0.5)) {
    for (let t = -1; t <= 1; t += 0.5) {
      const x = Math.round(s.x + s.nx * t);
      const y = Math.round(s.y + s.ny * t);
      if (x >= 0 && y >= 0 && x < width && y < height) data[y * width + x] = 40;
    }
  }
  return { width, height, data };
}

/** Distance from `point` to the nearest line of the grid described by the detection. */
function distanceToGrid(gridType: GridType, cellSize: number, offsetX: number, offsetY: number, point: { x: number; y: number }): number {
  if (!isHexGridType(gridType)) {
    const wrap = (v: number, o: number): number => {
      const m = (((v - o) % cellSize) + cellSize) % cellSize;
      return Math.min(m, cellSize - m);
    };
    return Math.min(wrap(point.x, offsetX), wrap(point.y, offsetY));
  }
  const layout = createHexLayout(gridType, cellSize, offsetX, offsetY);
  let best = Infinity;
  for (let q = -40; q <= 40; q++) {
    for (let r = -40; r <= 40; r++) {
      for (const v of hexVertices(layout, axialToPixel(layout, { q, r }))) {
        best = Math.min(best, Math.hypot(v.x - point.x, v.y - point.y));
      }
    }
  }
  return best;
}

describe('fft', () => {
  it('matches a direct DFT of a small signal', () => {
    const re = Float32Array.from([1, 2, 3, 4, 0, -1, 2, 5]);
    const im = new Float32Array(8);
    const expected = Array.from(re, (_, k) => {
      let sum = 0;
      for (let t = 0; t < 8; t++) sum += re[t]! * Math.cos((-2 * Math.PI * k * t) / 8);
      return sum;
    });
    fftInPlace(re, im);
    expected.forEach((value, k) => expect(re[k]).toBeCloseTo(value, 3));
  });
});

describe('detectGridInImage', () => {
  it.each<[GridType, number, number, number]>([
    ['square', 64.4, 17.3, 41.8],
    ['hex-vertical', 71.2, 22.5, 9.1],
    ['hex-horizontal', 58.7, 5.4, 30.2],
  ])('recovers a %s grid of size %f from a textured synthetic map', (gridType, cellSize, offsetX, offsetY) => {
    const width = 1400;
    const height = 1000;
    const image = syntheticMap(gridType, cellSize, offsetX, offsetY, width, height);

    const detected = detectGridInImage(image)!;

    expect(detected).not.toBeNull();
    expect(detected.gridType).toBe(gridType);
    expect(Math.abs(detected.cellSize - cellSize) / cellSize).toBeLessThan(0.002);
    expect(detected.confidence).toBeGreaterThan(1.5);

    // Corners of the true grid at the far corners of the map must lie on the detected grid.
    const truthSamples = gridLineSamples(gridType, cellSize, offsetX, offsetY, { minX: 0, minY: 0, maxX: width, maxY: height }, 200);
    for (const s of [truthSamples[0]!, truthSamples[truthSamples.length - 1]!, truthSamples[Math.floor(truthSamples.length / 2)]!]) {
      if (isHexGridType(gridType)) continue;
      expect(distanceToGrid(gridType, detected.cellSize, detected.offsetX, detected.offsetY, s)).toBeLessThan(1);
    }
    if (isHexGridType(gridType)) {
      const truth = createHexLayout(gridType, cellSize, offsetX, offsetY);
      for (const [q, r] of [[2, 2], [14, 5], [6, 11]] as Array<[number, number]>) {
        const corner = hexVertices(truth, axialToPixel(truth, { q, r }))[0]!;
        expect(distanceToGrid(gridType, detected.cellSize, detected.offsetX, detected.offsetY, corner)).toBeLessThan(1);
      }
    }
  }, 30000);

  it('reports no grid on a map without periodic lines', () => {
    const random = rng(3);
    const width = 800;
    const height = 600;
    const data = new Float32Array(width * height);
    for (let i = 0; i < data.length; i++) data[i] = 120 + (random() - 0.5) * 80;
    expect(detectGridInImage({ width, height, data })).toBeNull();
  });
});
