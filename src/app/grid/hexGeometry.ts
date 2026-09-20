/**
 * Hexagonal grid geometry.
 *
 * Conventions follow Foundry VTT and Owlbear Rodeo:
 * - `size` is the flat-to-flat distance of a hex (the width of a pointy-top hex,
 *   the height of a flat-top hex). A 70px hex map therefore uses size 70 just
 *   like a 70px square map, and a size-1 token fits the hex's inscribed circle.
 * - Cells are addressed with axial coordinates (q, r); cube rounding is used to
 *   resolve pixel positions to cells (see redblobgames.com/grids/hexagons).
 * - The grid origin (offsetX, offsetY) is the top-left corner of the bounding
 *   box of hex (0, 0), so a hex map whose first hex is flush with the image
 *   corner aligns at offset (0, 0).
 */

export type HexOrientation = 'pointy' | 'flat';
export type HexGridType = 'hex-horizontal' | 'hex-vertical';

export interface Point {
  x: number;
  y: number;
}

export interface AxialCoord {
  q: number;
  r: number;
}

export interface HexLayout {
  orientation: HexOrientation;
  /** Flat-to-flat distance in pixels. */
  size: number;
  /** Top-left corner of hex (0, 0)'s bounding box. */
  originX: number;
  originY: number;
}

const SQRT3 = Math.sqrt(3);

export function isHexGridType(type: string | undefined): type is HexGridType {
  return type === 'hex-horizontal' || type === 'hex-vertical';
}

/** `hex-horizontal` is flat-top (columns), `hex-vertical` is pointy-top (rows). */
export function hexOrientationForGridType(type: HexGridType): HexOrientation {
  return type === 'hex-horizontal' ? 'flat' : 'pointy';
}

export function createHexLayout(type: HexGridType, size: number, originX: number, originY: number): HexLayout {
  return { orientation: hexOrientationForGridType(type), size, originX, originY };
}

/** Distance from hex center to any vertex. */
export function hexCircumradius(size: number): number {
  return size / SQRT3;
}

/** Bounding box of a single hex. */
export function hexCellExtent(layout: HexLayout): { width: number; height: number } {
  const diameter = 2 * hexCircumradius(layout.size);
  return layout.orientation === 'pointy'
    ? { width: layout.size, height: diameter }
    : { width: diameter, height: layout.size };
}

/** Pixel center of hex (0, 0). */
export function hexOriginCenter(layout: HexLayout): Point {
  const { width, height } = hexCellExtent(layout);
  return { x: layout.originX + width / 2, y: layout.originY + height / 2 };
}

export function axialToPixel(layout: HexLayout, hex: AxialCoord): Point {
  const radius = hexCircumradius(layout.size);
  const origin = hexOriginCenter(layout);
  if (layout.orientation === 'pointy') {
    return {
      x: origin.x + layout.size * (hex.q + hex.r / 2),
      y: origin.y + 1.5 * radius * hex.r,
    };
  }
  return {
    x: origin.x + 1.5 * radius * hex.q,
    y: origin.y + layout.size * (hex.r + hex.q / 2),
  };
}

/** Fractional axial coordinates of a pixel position (not rounded). */
export function pixelToFractionalAxial(layout: HexLayout, point: Point): AxialCoord {
  const radius = hexCircumradius(layout.size);
  const origin = hexOriginCenter(layout);
  const dx = point.x - origin.x;
  const dy = point.y - origin.y;
  if (layout.orientation === 'pointy') {
    return {
      q: ((SQRT3 / 3) * dx - dy / 3) / radius,
      r: ((2 / 3) * dy) / radius,
    };
  }
  return {
    q: ((2 / 3) * dx) / radius,
    r: (-dx / 3 + (SQRT3 / 3) * dy) / radius,
  };
}

/** Rounds fractional axial coordinates to the containing hex using cube rounding. */
export function axialRound(fractional: AxialCoord): AxialCoord {
  const fs = -fractional.q - fractional.r;
  let q = Math.round(fractional.q);
  let r = Math.round(fractional.r);
  const s = Math.round(fs);

  const qDiff = Math.abs(q - fractional.q);
  const rDiff = Math.abs(r - fractional.r);
  const sDiff = Math.abs(s - fs);

  if (qDiff > rDiff && qDiff > sDiff) {
    q = -r - s;
  } else if (rDiff > sDiff) {
    r = -q - s;
  }
  // Normalise -0 so coordinates compare cleanly
  return { q: q + 0, r: r + 0 };
}

export function pixelToAxial(layout: HexLayout, point: Point): AxialCoord {
  return axialRound(pixelToFractionalAxial(layout, point));
}

/** Number of hex steps between two cells. */
export function axialDistance(a: AxialCoord, b: AxialCoord): number {
  const dq = a.q - b.q;
  const dr = a.r - b.r;
  return (Math.abs(dq) + Math.abs(dr) + Math.abs(dq + dr)) / 2;
}

export function nearestHexCenter(layout: HexLayout, point: Point): Point {
  return axialToPixel(layout, pixelToAxial(layout, point));
}

/** The six vertices of the hex centered at `center`, in clockwise order. */
export function hexVertices(layout: HexLayout, center: Point): Point[] {
  const radius = hexCircumradius(layout.size);
  const startAngle = layout.orientation === 'pointy' ? -Math.PI / 2 : 0;
  const vertices: Point[] = [];
  for (let i = 0; i < 6; i++) {
    const angle = startAngle + (Math.PI / 3) * i;
    vertices.push({
      x: center.x + radius * Math.cos(angle),
      y: center.y + radius * Math.sin(angle),
    });
  }
  return vertices;
}
