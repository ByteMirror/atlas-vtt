/**
 * The path of a throw: a billiard in a rectangle that closes on itself.
 *
 * The die shoots off its spot, bounces off the walls and ends exactly where
 * it started. That it arrives is **arithmetic, not a correction**: unfold the
 * table at every wall instead of mirroring the ball and the billiard is a
 * straight line (`fold` folds it back). On that line "back on the spot" is
 * simply a distance that can be computed for a given number of wall hits
 * (`spanFor`).
 */

import { vNormalize, type Vec3 } from './vectorMath';

export type Rng = () => number;

/** The schedule of one throw, rolled anew at every launch. */
export interface DieTour {
  /**
   * The distance in **unfolded** space, per axis. From `spanFor`, so it is
   * guaranteed to end on the spot.
   */
  spanX: number;
  spanZ: number;
  /** The walls this body bounces off: stage minus its own radius. */
  wallX: number;
  wallZ: number;
  /** Duration of the throw in seconds. */
  duration: number;
  /**
   * The run-out of the path: 1 would be uniform, larger means flick and
   * friction.
   *
   * It once was 2.25, and the die covered its whole path in the first third
   * of the time and crawled the rest: a twitch, then a second of creeping.
   */
  ease: number;
  /** The two tumble axes. Never nearly the same. */
  axisA: Vec3;
  axisB: Vec3;
  /** How far to turn about each axis: several whole turns. */
  turnA: number;
  turnB: number;
  /**
   * The run-out of the spin. Flatter than the path's: the die should **spin
   * until the end**, not stop halfway and wait.
   */
  spinEase: number;
  /** Axis and amplitude of the final rock. */
  rockAxis: Vec3;
  rockAmount: number;
}

/** The table. Nothing exists below it. */
export const FLOOR_Y = -0.72;

/**
 * **The stage when nobody measures it.** At runtime the renderer passes the
 * real size (it knows the camera and canvas); these are the fallback for tests
 * and the first frame before measuring.
 */
export const STAGE_X = 3.25;
export const STAGE_Z = 2.1;

export function randomAxis(rng: Rng): Vec3 {
  for (let tries = 0; tries < 12; tries++) {
    const v: Vec3 = [rng() * 2 - 1, rng() * 2 - 1, rng() * 2 - 1];
    const l = v[0] * v[0] + v[1] * v[1] + v[2] * v[2];
    if (l > 0.04 && l <= 1) return vNormalize(v);
  }
  return [0, 1, 0];
}

/**
 * How much bounce is left at point `s` of the throw.
 *
 * The first half bounces fully, where the die should whirl. Afterwards the
 * bounce falls linearly to zero so the end happens **on the table**, not in
 * the air: a die still hopping while its number stands looks like a bug.
 */
export function damp(s: number): number {
  return Math.max(0, 1 - Math.max(0, (s - 0.55) / 0.35));
}

/**
 * How high a tumbling die's centre stays above the table, as a share of its
 * radius: between lying on a face and standing on a corner.
 */
export const TUMBLE_HEIGHT = 0.78;

/** Where the centre of a die is when the die touches the table: `share` of its radius above it. */
export function restHeight(radius: number, share = TUMBLE_HEIGHT): number {
  return FLOOR_Y + radius * share;
}

/**
 * **Fold the unfolded table back together.**
 *
 * Mirroring the table instead of the die makes the billiard a straight line.
 * `fold` turns it back into the zigzag: a triangle wave of amplitude `wall`
 * and period `4·wall`, exactly the way between both walls and back.
 */
export function fold(u: number, wall: number): number {
  const s = Math.sin((Math.PI * u) / (2 * wall));
  return ((2 * wall) / Math.PI) * Math.asin(s < -1 ? -1 : s > 1 ? 1 : s);
}

/** Which unfolded cell `u` lies in. A change of cell is a wall hit. */
export function cellOf(u: number, wall: number): number {
  return Math.floor((u + wall) / (2 * wall));
}

/**
 * **Which of the two walls lies between two cells: `+wall` or `−wall`.**
 *
 * This once used the parity of the *new* cell alone, which was only right
 * while the die flew forwards. Flying backwards (`spanFor` rolls the direction
 * per axis, so in half of all throws), the crossed boundary lies on the
 * *other* side of the new cell and the answer flipped: sparks flew at the
 * opposite wall, where the die never was.
 *
 * Asking the **boundary** instead of the cell is direction-free: between cells
 * `k` and `k+1` it lies at `u = (2k+1)·wall`, where `fold` is exactly
 * `(−1)^k · wall`. So the smaller of the two cell numbers decides, whichever
 * way the die comes from.
 */
export function wallSide(prev: number, next: number): 1 | -1 {
  return Math.min(prev, next) % 2 === 0 ? 1 : -1;
}

/**
 * **The distance on one axis that returns home after exactly `hits` walls.**
 *
 * After `hits` walls the die is in cell `hits`; there `fold` is a straight
 * line, and where it meets `home` again can be computed instead of searched:
 * with an even hit count the distance is a whole multiple of the wall width,
 * with an odd one the way back across the spot subtracts twice the offset.
 */
function spanFor(home: number, wall: number, hits: number, dir: 1 | -1): number {
  const straight = dir * 2 * hits * wall;
  return hits % 2 === 1 ? straight - 2 * home : straight;
}

/**
 * **How often the die may hit a wall per axis.**
 *
 * Not every pair works: if both axes hit walls in lockstep, the die runs into
 * a corner and **back the same way**, a dashed line instead of a pinball path.
 * From the centre, one axis' hits fall on odd multiples of `1/(2·hits)`; two
 * such series never meet exactly when the two hit counts contain the factor
 * two **a different number of times**. Hence a checked list, not a random
 * number.
 */
const WALL_PAIRS: readonly (readonly [number, number])[] = [
  [1, 2],
  [2, 1],
  [2, 3],
  [3, 2],
  [1, 4],
  [4, 1],
  [3, 4],
  [4, 3],
];

/** Two axes far enough apart that it looks like tumbling. */
function tumbleAxes(rng: Rng): [Vec3, Vec3] {
  const a = randomAxis(rng);
  for (let tries = 0; tries < 8; tries++) {
    const b = randomAxis(rng);
    if (Math.abs(a[0] * b[0] + a[1] * b[1] + a[2] * b[2]) < 0.8) return [a, b];
  }
  // Fallback: anything across `a`.
  return [a, vNormalize([a[1] - a[2], a[2] - a[0], a[0] - a[1]])];
}

/** Roll the path: a hit pair, two directions, a pace, a tumble. */
export function planTour(
  home: readonly [number, number],
  radius: number,
  stage: readonly [number, number],
  rng: Rng,
  maxWallHits = Infinity,
): DieTour {
  const wallX = Math.max(radius * 0.5, stage[0] - radius);
  const wallZ = Math.max(radius * 0.5, stage[1] - radius);
  // A shorter throw may cap its wall hits; the pairs keep their order, so an uncapped throw draws as before.
  const allowed = WALL_PAIRS.filter(([x, z]) => x + z <= maxWallHits);
  const pairs = allowed.length > 0 ? allowed : WALL_PAIRS.slice(0, 1);
  const [hitsX, hitsZ] = pairs[Math.min(pairs.length - 1, Math.floor(rng() * pairs.length))]!;
  const [axisA, axisB] = tumbleAxes(rng);
  const rockAngle = rng() * Math.PI * 2;

  return {
    spanX: spanFor(home[0], wallX, hitsX, rng() < 0.5 ? 1 : -1),
    spanZ: spanFor(home[1], wallZ, hitsZ, rng() < 0.5 ? 1 : -1),
    wallX,
    wallZ,
    duration: 1.45 + rng() * 0.4,
    ease: 1.55 + rng() * 0.35,
    axisA,
    axisB,
    // Well over seven turns together: enough for a blur rather than a frame.
    turnA: (rng() < 0.5 ? 1 : -1) * (26 + rng() * 18),
    turnB: (rng() < 0.5 ? 1 : -1) * (16 + rng() * 14),
    spinEase: 1.8 + rng() * 0.4,
    // The rock goes over an edge, so about a **lying** axis.
    rockAxis: vNormalize([Math.cos(rockAngle), 0.12, Math.sin(rockAngle)]),
    rockAmount: 0.13 + rng() * 0.09,
  };
}
