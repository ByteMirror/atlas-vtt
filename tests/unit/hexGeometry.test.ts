import { describe, it, expect } from 'vitest';
import {
  axialDistance,
  axialRound,
  axialToPixel,
  createHexLayout,
  hexCellExtent,
  hexCircumradius,
  hexOriginCenter,
  hexVertices,
  nearestHexCenter,
  pixelToAxial,
} from '../../src/app/grid/hexGeometry';
import type { HexLayout } from '../../src/app/grid/hexGeometry';

const SIZE = 70;
const pointy: HexLayout = createHexLayout('hex-vertical', SIZE, 0, 0);
const flat: HexLayout = createHexLayout('hex-horizontal', SIZE, 0, 0);

describe('hex size convention', () => {
  it('treats size as the flat-to-flat distance like Foundry VTT and Owlbear Rodeo', () => {
    expect(hexCircumradius(SIZE)).toBeCloseTo(SIZE / Math.sqrt(3));
    expect(hexCellExtent(pointy).width).toBeCloseTo(SIZE);
    expect(hexCellExtent(pointy).height).toBeCloseTo((2 * SIZE) / Math.sqrt(3));
    expect(hexCellExtent(flat).height).toBeCloseTo(SIZE);
    expect(hexCellExtent(flat).width).toBeCloseTo((2 * SIZE) / Math.sqrt(3));
  });

  it('places hex (0,0) flush with the grid origin', () => {
    const layout = createHexLayout('hex-vertical', SIZE, 100, 200);
    const center = hexOriginCenter(layout);
    const extent = hexCellExtent(layout);
    expect(center).toEqual({ x: 100 + extent.width / 2, y: 200 + extent.height / 2 });
    expect(axialToPixel(layout, { q: 0, r: 0 })).toEqual(center);
  });
});

describe('axial <-> pixel', () => {
  it.each([pointy, flat])('round-trips hex centers ($orientation)', (layout) => {
    for (let q = -4; q <= 4; q++) {
      for (let r = -4; r <= 4; r++) {
        expect(pixelToAxial(layout, axialToPixel(layout, { q, r }))).toEqual({ q, r });
      }
    }
  });

  it('spaces pointy neighbours by size horizontally and 1.5 radius vertically', () => {
    const origin = axialToPixel(pointy, { q: 0, r: 0 });
    const right = axialToPixel(pointy, { q: 1, r: 0 });
    const below = axialToPixel(pointy, { q: 0, r: 1 });
    expect(right.x - origin.x).toBeCloseTo(SIZE);
    expect(right.y - origin.y).toBeCloseTo(0);
    expect(below.y - origin.y).toBeCloseTo(1.5 * hexCircumradius(SIZE));
    expect(below.x - origin.x).toBeCloseTo(SIZE / 2);
  });

  it('spaces flat neighbours by size vertically and 1.5 radius horizontally', () => {
    const origin = axialToPixel(flat, { q: 0, r: 0 });
    const right = axialToPixel(flat, { q: 1, r: 0 });
    const below = axialToPixel(flat, { q: 0, r: 1 });
    expect(below.y - origin.y).toBeCloseTo(SIZE);
    expect(below.x - origin.x).toBeCloseTo(0);
    expect(right.x - origin.x).toBeCloseTo(1.5 * hexCircumradius(SIZE));
    expect(right.y - origin.y).toBeCloseTo(SIZE / 2);
  });

  it('uses cube rounding so points near an edge resolve to the closest center', () => {
    expect(axialRound({ q: 0.4, r: 0.4 })).toEqual({ q: 0, r: 1 });
    expect(axialRound({ q: 0.6, r: -0.3 })).toEqual({ q: 0, r: 0 });
    expect(axialRound({ q: 0.8, r: -0.3 })).toEqual({ q: 1, r: 0 });

    const center = axialToPixel(pointy, { q: 2, r: -1 });
    const radius = hexCircumradius(SIZE);
    const justInside = { x: center.x, y: center.y - radius * 0.95 };
    expect(nearestHexCenter(pointy, justInside)).toEqual(center);
  });
});

describe('distance and vertices', () => {
  it('counts hex steps', () => {
    expect(axialDistance({ q: 0, r: 0 }, { q: 0, r: 0 })).toBe(0);
    expect(axialDistance({ q: 0, r: 0 }, { q: 1, r: 0 })).toBe(1);
    expect(axialDistance({ q: 0, r: 0 }, { q: 1, r: -1 })).toBe(1);
    expect(axialDistance({ q: 0, r: 0 }, { q: 2, r: 1 })).toBe(3);
    expect(axialDistance({ q: -2, r: 3 }, { q: 1, r: -1 })).toBe(4);
  });

  it('returns six vertices at the circumradius with the correct top vertex', () => {
    const center = { x: 0, y: 0 };
    const radius = hexCircumradius(SIZE);

    const pointyVertices = hexVertices(pointy, center);
    expect(pointyVertices).toHaveLength(6);
    expect(pointyVertices[0]!.x).toBeCloseTo(0);
    expect(pointyVertices[0]!.y).toBeCloseTo(-radius);

    const flatVertices = hexVertices(flat, center);
    expect(flatVertices[0]!.x).toBeCloseTo(radius);
    expect(flatVertices[0]!.y).toBeCloseTo(0);

    for (const vertex of [...pointyVertices, ...flatVertices]) {
      expect(Math.hypot(vertex.x, vertex.y)).toBeCloseTo(radius);
    }
  });
});
