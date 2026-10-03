/**
 * Vectors and quaternions for the dice stage. Pure math without DOM, so it can
 * be tested like a formula.
 *
 * Convention: "up" is +Y and the camera looks down on the table from above.
 */

export type Vec3 = readonly [number, number, number];

export interface Quat {
  w: number;
  x: number;
  y: number;
  z: number;
}

export const vAdd = (a: Vec3, b: Vec3): Vec3 => [a[0] + b[0], a[1] + b[1], a[2] + b[2]];
export const vSub = (a: Vec3, b: Vec3): Vec3 => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
export const vScale = (a: Vec3, s: number): Vec3 => [a[0] * s, a[1] * s, a[2] * s];
export const vDot = (a: Vec3, b: Vec3): number => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
export const vCross = (a: Vec3, b: Vec3): Vec3 => [
  a[1] * b[2] - a[2] * b[1],
  a[2] * b[0] - a[0] * b[2],
  a[0] * b[1] - a[1] * b[0],
];
export const vLength = (a: Vec3): number => Math.sqrt(vDot(a, a));

export function vNormalize(a: Vec3): Vec3 {
  const l = vLength(a);
  return l > 0 ? vScale(a, 1 / l) : [0, 0, 1];
}

export const qIdentity = (): Quat => ({ w: 1, x: 0, y: 0, z: 0 });

export function qAxisAngle(axis: Vec3, angle: number): Quat {
  const h = angle / 2;
  const s = Math.sin(h);
  return { w: Math.cos(h), x: axis[0] * s, y: axis[1] * s, z: axis[2] * s };
}

export function qMul(a: Quat, b: Quat): Quat {
  return {
    w: a.w * b.w - a.x * b.x - a.y * b.y - a.z * b.z,
    x: a.w * b.x + a.x * b.w + a.y * b.z - a.z * b.y,
    y: a.w * b.y - a.x * b.z + a.y * b.w + a.z * b.x,
    z: a.w * b.z + a.x * b.y - a.y * b.x + a.z * b.w,
  };
}

export function qNormalize(q: Quat): Quat {
  const l = Math.sqrt(q.w * q.w + q.x * q.x + q.y * q.y + q.z * q.z) || 1;
  return { w: q.w / l, x: q.x / l, y: q.y / l, z: q.z / l };
}

/** `v` rotated by `q`, with the two-cross-product formula instead of a matrix. */
export function qRotate(q: Quat, v: Vec3): Vec3 {
  const u: Vec3 = [q.x, q.y, q.z];
  const t = vScale(vCross(u, v), 2);
  return vAdd(vAdd(v, vScale(t, q.w)), vCross(u, t));
}

/**
 * Spherical interpolation. `t` may exceed 1: the rotation then runs past the
 * target and comes back, the small overshoot of a die settling rather than
 * docking.
 */
export function qSlerp(a: Quat, b: Quat, t: number): Quat {
  let d = a.w * b.w + a.x * b.x + a.y * b.y + a.z * b.z;
  let bw = b.w;
  let bx = b.x;
  let by = b.y;
  let bz = b.z;
  if (d < 0) {
    d = -d;
    bw = -bw;
    bx = -bx;
    by = -by;
    bz = -bz;
  }
  if (d > 0.9995) {
    return qNormalize({
      w: a.w + (bw - a.w) * t,
      x: a.x + (bx - a.x) * t,
      y: a.y + (by - a.y) * t,
      z: a.z + (bz - a.z) * t,
    });
  }
  const theta = Math.acos(Math.min(1, d));
  const s = Math.sin(theta);
  const fa = Math.sin((1 - t) * theta) / s;
  const fb = Math.sin(t * theta) / s;
  return qNormalize({
    w: fa * a.w + fb * bw,
    x: fa * a.x + fb * bx,
    y: fa * a.y + fb * by,
    z: fa * a.z + fb * bz,
  });
}

/** Angular distance between two orientations in radians (0 to π). */
export function qAngle(a: Quat, b: Quat): number {
  const d = Math.abs(a.w * b.w + a.x * b.x + a.y * b.y + a.z * b.z);
  return 2 * Math.acos(Math.min(1, d));
}

/**
 * Quaternion from a rotation matrix given as three rows. The matrix maps
 * `right → +X`, `up → +Y`, `normal → +Z`. Shepperd's case split, so nothing
 * degenerates when the trace is near −1.
 */
export function qFromRows(r0: Vec3, r1: Vec3, r2: Vec3): Quat {
  const trace = r0[0] + r1[1] + r2[2];
  if (trace > 0) {
    const s = Math.sqrt(trace + 1) * 2;
    return qNormalize({
      w: s / 4,
      x: (r2[1] - r1[2]) / s,
      y: (r0[2] - r2[0]) / s,
      z: (r1[0] - r0[1]) / s,
    });
  }
  if (r0[0] > r1[1] && r0[0] > r2[2]) {
    const s = Math.sqrt(1 + r0[0] - r1[1] - r2[2]) * 2;
    return qNormalize({
      w: (r2[1] - r1[2]) / s,
      x: s / 4,
      y: (r0[1] + r1[0]) / s,
      z: (r0[2] + r2[0]) / s,
    });
  }
  if (r1[1] > r2[2]) {
    const s = Math.sqrt(1 + r1[1] - r0[0] - r2[2]) * 2;
    return qNormalize({
      w: (r0[2] - r2[0]) / s,
      x: (r0[1] + r1[0]) / s,
      y: s / 4,
      z: (r1[2] + r2[1]) / s,
    });
  }
  const s = Math.sqrt(1 + r2[2] - r0[0] - r1[1]) * 2;
  return qNormalize({
    w: (r1[0] - r0[1]) / s,
    x: (r0[2] + r2[0]) / s,
    y: (r1[2] + r2[1]) / s,
    z: s / 4,
  });
}
