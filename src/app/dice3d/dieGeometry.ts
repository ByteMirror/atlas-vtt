/**
 * The dice bodies as pure math: vertices, faces, numbers.
 *
 * Convention: "up" is +Y and the camera looks **down** on the table. The rolled
 * face is the one whose normal points to +Y, and the top of its numeral points
 * to −Z so the number reads upright on screen. The d4 is the exception: its
 * rolled face lies on the table (see `restingQuaternion`).
 */

import {
  qAxisAngle,
  qFromRows,
  qMul,
  qNormalize,
  vAdd,
  vCross,
  vDot,
  vLength,
  vNormalize,
  vScale,
  vSub,
  type Quat,
  type Vec3,
} from './vectorMath';

export type DieSides = 4 | 6 | 8 | 10 | 12 | 20;

export interface DieGeometry {
  sides: DieSides;
  /** Vertices, scaled to a circumradius of about 1. */
  vertices: Vec3[];
  /** Faces as vertex indices, counter-clockwise seen from outside. */
  faces: number[][];
  /** The number each face stands for; opposite faces add up to n+1. What is printed where: `faceMarks`. */
  values: number[];
  normals: Vec3[];
  centers: Vec3[];
  /** The "up" of the numeral in the face plane; makes the target orientation unique. */
  ups: Vec3[];
}

const PHI = (1 + Math.sqrt(5)) / 2;

/** Any unit vector perpendicular to `n`. */
function perpendicular(n: Vec3): Vec3 {
  const pick: Vec3 = Math.abs(n[0]) < 0.9 ? [1, 0, 0] : [0, 1, 0];
  return vNormalize(vCross(n, pick));
}

/**
 * The faces of the convex hull, from the vertices alone, without a table.
 *
 * Hand-listed face normals failed silently: twelve of the d20's were vertex
 * directions, and since three points always share a plane the result still
 * looked like a die. So: **every plane through three vertices that keeps all
 * others on its inner side is a face** (the support-plane definition of the
 * hull). It holds for all six bodies, the d10's kites included, and leaves
 * nothing to mistype; the cubic cost over at most twenty vertices runs once.
 */
function hullFaces(vertices: Vec3[]): number[][] {
  const EPS = 1e-6;
  const found: { normal: Vec3; indices: number[] }[] = [];
  const n = vertices.length;

  for (let i = 0; i < n; i++) {
    for (let j = i + 1; j < n; j++) {
      for (let k = j + 1; k < n; k++) {
        const raw = vCross(vSub(vertices[j]!, vertices[i]!), vSub(vertices[k]!, vertices[i]!));
        if (vLength(raw) < EPS) continue;

        let normal = vNormalize(raw);
        let offset = vDot(normal, vertices[i]!);
        // Point outwards; a plane through the centre cannot be a face of a
        // body that encloses it.
        if (offset < 0) {
          normal = vScale(normal, -1);
          offset = -offset;
        }
        if (offset < EPS) continue;
        if (!vertices.every((v) => vDot(normal, v) <= offset + EPS)) continue;
        if (found.some((f) => vDot(f.normal, normal) > 0.9999)) continue;

        found.push({
          normal,
          indices: vertices
            .map((v, index) => ({ v, index }))
            .filter(({ v }) => Math.abs(vDot(normal, v) - offset) < EPS)
            .map(({ index }) => index),
        });
      }
    }
  }

  // Order around the face's own normal: only then is it a polygon, not a star.
  return found.map(({ normal, indices }) => {
    const e1 = perpendicular(normal);
    const e2 = vCross(normal, e1);
    return [...indices].sort(
      (a, b) =>
        Math.atan2(vDot(vertices[a]!, e2), vDot(vertices[a]!, e1)) -
        Math.atan2(vDot(vertices[b]!, e2), vDot(vertices[b]!, e1)),
    );
  });
}

/** Newell's face normal; also copes with the slightly skewed kites of the d10. */
function newellNormal(vertices: Vec3[], face: number[]): Vec3 {
  let x = 0;
  let y = 0;
  let z = 0;
  for (let i = 0; i < face.length; i++) {
    const a = vertices[face[i]!]!;
    const b = vertices[face[(i + 1) % face.length]!]!;
    x += (a[1] - b[1]) * (a[2] + b[2]);
    y += (a[2] - b[2]) * (a[0] + b[0]);
    z += (a[0] - b[0]) * (a[1] + b[1]);
  }
  return vNormalize([x, y, z]);
}

function faceCenter(vertices: Vec3[], face: number[]): Vec3 {
  let c: Vec3 = [0, 0, 0];
  for (const i of face) c = vAdd(c, vertices[i]!);
  return vScale(c, 1 / face.length);
}

/**
 * Only the vertices; the hull finds the faces. Every body is scaled to a
 * circumradius of 1, so a d6 does not dwarf a d20 beside it.
 */
function solidVertices(sides: DieSides): Vec3[] {
  switch (sides) {
    case 4: {
      // Four alternating corners of the cube are the tetrahedron.
      const s = 1 / Math.sqrt(3);
      return [
        [s, s, s],
        [s, -s, -s],
        [-s, s, -s],
        [-s, -s, s],
      ];
    }
    case 6: {
      const s = 1 / Math.sqrt(3);
      const vertices: Vec3[] = [];
      for (let i = 0; i < 8; i++)
        vertices.push([(i & 1 ? 1 : -1) * s, (i & 2 ? 1 : -1) * s, (i & 4 ? 1 : -1) * s]);
      return vertices;
    }
    case 8:
      return [
        [1, 0, 0],
        [-1, 0, 0],
        [0, 1, 0],
        [0, -1, 0],
        [0, 0, 1],
        [0, 0, -1],
      ];
    case 10: {
      // Pentagonal trapezohedron: an equatorial ring of alternating height and
      // two apexes. The apex height is not free; it follows from the kites
      // being planar: c = h·(1+cos 36°)/(1−cos 36°). `h` alone sets the shape:
      // at 0.12 the body is as stout as a real d10, at 0.35 it would be a
      // spindle.
      const h = 0.12;
      const c = (h * (1 + Math.cos(Math.PI / 5))) / (1 - Math.cos(Math.PI / 5));
      const vertices: Vec3[] = [
        [0, 0, c],
        [0, 0, -c],
      ];
      for (let j = 0; j < 10; j++) {
        const a = (j * Math.PI) / 5;
        vertices.push([Math.cos(a), Math.sin(a), j % 2 === 0 ? h : -h]);
      }
      const scale = 1 / Math.max(...vertices.map(vLength));
      return vertices.map((v) => vScale(v, scale));
    }
    case 12: {
      const vertices: Vec3[] = [];
      for (const x of [1, -1])
        for (const y of [1, -1]) for (const z of [1, -1]) vertices.push(vNormalize([x, y, z]));
      for (const a of [1 / PHI, -1 / PHI])
        for (const b of [PHI, -PHI]) {
          vertices.push(vNormalize([0, a, b]));
          vertices.push(vNormalize([a, b, 0]));
          vertices.push(vNormalize([b, 0, a]));
        }
      return vertices;
    }
    case 20: {
      const vertices: Vec3[] = [];
      for (const a of [1, -1])
        for (const b of [PHI, -PHI]) {
          vertices.push(vNormalize([0, a, b]));
          vertices.push(vNormalize([a, b, 0]));
          vertices.push(vNormalize([b, 0, a]));
        }
      return vertices;
    }
  }
}

/**
 * Numbers placed so opposite faces add up to n+1, the convention of real dice.
 * The d4 has no opposite faces and simply counts through.
 */
function assignValues(normals: Vec3[]): number[] {
  const n = normals.length;
  const values = new Array<number>(n).fill(0);
  if (n === 4) return [1, 2, 3, 4];
  let next = 1;
  for (let i = 0; i < n; i++) {
    if (values[i] !== 0) continue;
    const opposite = normals.findIndex((m, j) => j !== i && vDot(normals[i]!, m) < -0.999);
    values[i] = next;
    values[opposite] = n + 1 - next;
    next++;
  }
  return values;
}

const geometryCache = new Map<DieSides, DieGeometry>();

export function dieGeometry(sides: DieSides): DieGeometry {
  const cached = geometryCache.get(sides);
  if (cached !== undefined) return cached;

  const vertices = solidVertices(sides);
  const faces = hullFaces(vertices);
  if (faces.length !== sides) {
    throw new Error(`d${sides}: the hull found ${faces.length} faces`);
  }
  // Secure the winding: every face counter-clockwise seen from outside.
  for (const face of faces) {
    if (vDot(newellNormal(vertices, face), faceCenter(vertices, face)) < 0) face.reverse();
  }
  const normals = faces.map((f) => newellNormal(vertices, f));
  const centers = faces.map((f) => faceCenter(vertices, f));
  const ups = faces.map((f, i): Vec3 => {
    // Where the numeral's head points. With an even vertex count, towards the
    // middle of an edge: the first vertex stood the d6's five on its corner.
    const center = centers[i]!;
    const distances = f.map((vi) => vLength(vSub(vertices[vi]!, center)));
    const spread = Math.max(...distances) - Math.min(...distances);

    let towards: Vec3;
    if (spread > 1e-6) {
      // The d10's kite: the tip farthest from the centre, as on real dice.
      towards = vertices[f[distances.indexOf(Math.max(...distances))]!]!;
    } else if (f.length % 2 === 0) {
      towards = vScale(vAdd(vertices[f[0]!]!, vertices[f[1]!]!), 0.5);
    } else {
      towards = vertices[f[0]!]!;
    }

    const normal = normals[i]!;
    const raw = vSub(towards, center);
    const inPlane = vSub(raw, vScale(normal, vDot(raw, normal)));
    return vNormalize(inPlane);
  });

  const geometry: DieGeometry = {
    sides,
    vertices,
    faces,
    values: assignValues(normals),
    normals,
    centers,
    ups,
  };
  geometryCache.set(sides, geometry);
  return geometry;
}

/**
 * The orientation in which face `face` **lies on top** and its numeral reads
 * upright from above (head towards −Z). This is where the roll ends.
 */
export function faceQuaternion(geometry: DieGeometry, face: number): Quat {
  const n = geometry.normals[face]!;
  const u = geometry.ups[face]!;
  const t = vCross(u, n);
  // Stays right-handed: right → +X, normal → +Y, numeral up → −Z.
  return qFromRows(t, n, vScale(u, -1));
}

export function faceIndexForValue(geometry: DieGeometry, value: number): number {
  return geometry.values.indexOf(value);
}

/**
 * How high the centre of a die lies above the table when the die lies on a
 * face, as a share of its radius: a third on the d4, four fifths on the d20.
 */
export function lyingHeight(geometry: DieGeometry): number {
  return vDot(geometry.centers[0]!, geometry.normals[0]!);
}

/** How far a resting die may be turned on the table, either way: enough to show its sides, not enough to tip the number. */
export const REST_YAW = 0.3;

/**
 * How the die **comes to rest**: lying on a face, as a body on a table does,
 * and turned by `yaw` about the vertical. The rolled face lies on top.
 *
 * The d4 has no face on top: it lies **on** the rolled face and points its tip
 * up, with one face turned to the viewer. The roll is the number at the tip
 * (`faceMarks`).
 *
 * The dice once came to rest tilted, a share of the way to the next face, so
 * that the body would not flatten to a polygon seen from above. They stood on
 * an edge or a corner for it, the d4 on its tip, and the d6 showed two numbers
 * almost alike.
 */
export function restingQuaternion(geometry: DieGeometry, face: number, yaw = 0): Quat {
  const onTop = faceQuaternion(geometry, face);
  // Half a turn about the line of sight puts the face on the table and leaves
  // the edge that was at the bottom of the screen there.
  const lying = geometry.sides === 4 ? qMul(qAxisAngle([0, 0, 1], Math.PI), onTop) : onTop;
  return qNormalize(qMul(qAxisAngle([0, 1, 0], yaw), lying));
}
