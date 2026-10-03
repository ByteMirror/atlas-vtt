/**
 * The numerals a face carries, and where.
 *
 * Every body but the d4 writes one number in the middle of each face and is
 * read on the face lying on top. A d4 has no top face: it lies on one and
 * points a tip up. So it is numbered like the real one, at the corners: each
 * face carries three numbers, head first towards its corners, and the three
 * faces around a corner agree on it. The number at the tip is the roll.
 */

import type { DieGeometry } from './dieGeometry';
import { faceOutline } from './faceFrame';

type Point = readonly [number, number];

export interface NumeralMark {
  value: number;
  /** The numeral's ink centre in the face's cell: cell pixels from the face centre, y up. */
  at: Point;
  /** Where the numeral's head points in the cell, as a unit vector. */
  up: Point;
  /** The room it may fill, as an outline around `at` in the numeral's own frame (x right, y towards its head). */
  room: Point[];
}

/** How far from the face centre towards its corner a d4's numeral sits. */
const CORNER_MARK_AT = 0.45;

function midpoint(a: Point, b: Point): Point {
  return [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2];
}

/** `point` in the frame of the numeral at `at`: x to its right, y towards its head (`up`). */
function inNumeralFrame(point: Point, at: Point, up: Point): Point {
  const dx = point[0] - at[0];
  const dy = point[1] - at[1];
  return [dx * up[1] - dy * up[0], dx * up[0] + dy * up[1]];
}

/** The numerals of face `face`, in the order of its corners on the d4. */
export function faceMarks(geometry: DieGeometry, face: number, cellPx: number): NumeralMark[] {
  const outline = faceOutline(geometry, face, cellPx);
  if (geometry.sides !== 4) return [{ value: geometry.values[face]!, at: [0, 0], up: [0, 1], room: outline }];

  return geometry.faces[face]!.map((vertex, i) => {
    const corner = outline[i]!;
    const next = outline[(i + 1) % outline.length]!;
    const previous = outline[(i + outline.length - 1) % outline.length]!;
    const reach = Math.hypot(corner[0], corner[1]);
    const up: Point = [corner[0] / reach, corner[1] / reach];
    const at: Point = [corner[0] * CORNER_MARK_AT, corner[1] * CORNER_MARK_AT];
    // Its third of the face: the kite between the corner, the middles of its two edges and the centre.
    const kite: Point[] = [corner, midpoint(corner, next), [0, 0], midpoint(corner, previous)];
    // With this corner as the tip, the die lies on the one face that does not touch it.
    const lyingDown = geometry.faces.findIndex((other) => !other.includes(vertex));
    return {
      value: geometry.values[lyingDown]!,
      at,
      up,
      room: kite.map((point) => inNumeralFrame(point, at, up)),
    };
  });
}
