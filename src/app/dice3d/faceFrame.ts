import type { DieGeometry } from './dieGeometry';
import { vCross, vDot, vSub, type Vec3 } from './vectorMath';

/**
 * How far a face reaches into its atlas cell, as a share of the cell: 82 % of
 * the cell across, so the rim stays ground colour and nothing bleeds into the
 * neighbouring cell.
 */
export const FACE_CELL_REACH = 0.41;

export interface FaceFrame {
  center: Vec3;
  right: Vec3;
  up: Vec3;
  /** Largest corner distance in the plane; normalises the face into its cell. */
  reach: number;
}

export function faceFrame(geometry: DieGeometry, face: number): FaceFrame {
  const center = geometry.centers[face]!;
  const up = geometry.ups[face]!;
  const right = vCross(up, geometry.normals[face]!);
  const reach = Math.max(
    ...geometry.faces[face]!.map((vi) => {
      const d = vSub(geometry.vertices[vi]!, center);
      return Math.hypot(vDot(d, right), vDot(d, up));
    }),
  );
  return { center, right, up, reach };
}

/** The face's corners in its atlas cell, in cell pixels, x right and y towards the numeral's top. */
export function faceOutline(geometry: DieGeometry, face: number, cellPx: number): [number, number][] {
  const frame = faceFrame(geometry, face);
  const scale = (FACE_CELL_REACH * cellPx) / frame.reach;
  return geometry.faces[face]!.map((vi) => {
    const d = vSub(geometry.vertices[vi]!, frame.center);
    return [vDot(d, frame.right) * scale, vDot(d, frame.up) * scale];
  });
}
