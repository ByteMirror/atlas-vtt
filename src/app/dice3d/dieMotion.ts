/**
 * A throw as a **pinball path that closes on itself** and a **spin that
 * unwinds itself**. The die runs straight until a wall is in the way, like in
 * a tray, on a billiard path (`dieTour.ts`) that ends on its spot for any pace:
 * the pace lives only in `tau`, and `tau(1) = 1` always holds.
 *
 * The pose is **written down, not integrated** (`poseAt`): at time `s` it is
 * the target turned *back* about two axes by `−(1−s)^spinEase` times several
 * turns. A free tumble followed by a slerp into the target showed a body
 * *being turned* until the right number was up; here the target is the zero
 * point of the spin, so the die spins, ever slower, until the last frame.
 *
 * Physics stays where it is visible: ballistic hops whose rebound dies with the
 * throw, impacts that knock the pose (`wobble`, blended out with `1 − s` so
 * they never move the arrival), and one rock over an edge at the end. The
 * result is fixed first; the throw retells it. Everything is a pure
 * `step(dt)`: the caller keeps time, the tests run it dry.
 */

import { qAxisAngle, qIdentity, qMul, qNormalize, qSlerp, vScale, type Quat, type Vec3 } from './vectorMath';
import { cellOf, damp, fold, planTour, randomAxis, restHeight, STAGE_X, STAGE_Z, TUMBLE_HEIGHT, wallSide } from './dieTour';
import type { DieTour, Rng } from './dieTour';

/** `throw` runs its path, `rest` lies still. Nothing lies between. */
export type DiePhase = 'throw' | 'rest';

/** An impact of this frame, read by the caller for sound and sparks; `null` again next step. */
export interface DieImpact {
  /**
   * `settle` is not a hit but **the moment the throw stands**, reported a hair
   * before the clock runs out: the last tenth of a second moves invisibly, and
   * sparks tied to the clock would fall into a silence that is already over.
   */
  kind: 'floor' | 'wall' | 'settle';
  /** 0 to 1: how hard it was. Volume, pitch and spark count depend on it. */
  strength: number;
  /** Where it sparked, in world coordinates. */
  at: Vec3;
  /** The normal of the surface that was hit; sparks fly that way. */
  normal: Vec3;
}

export interface DieAnim {
  phase: DiePhase;
  /** Centre position in world coordinates. */
  p: Vec3;
  v: Vec3;
  q: Quat;
  /** Angular velocity (axis × rad/s), **measured** from two frames; drives the motion blur. */
  w: Vec3;
  /** The die's spot: start and end of every throw. */
  home: readonly [number, number];
  radius: number;
  /** How high the centre lies above the table once the die lies on a face, as a share of the radius. */
  lie: number;
  /** Where the table holds the centre right now (see `floorAt`). */
  floor: number;
  /** Half the stage in world units: the walls stand here. */
  stage: readonly [number, number];
  /** Delay until launch, so several dice set off staggered. */
  delay: number;
  target: Quat;
  /** Elapsed time of the throw. */
  t: number;
  /** Seconds since coming to rest, for highlight and fade-out by the caller. */
  restFor: number;
  bounces: number;
  wallHits: number;
  impact: DieImpact | null;
  /** What the impacts left of the pose. Decays towards rest. */
  wobble: Quat;
  tour: DieTour;
  /** The unfolded cell the die is in; a change means a wall lay exactly between. */
  cellX: number;
  cellZ: number;
}

const GRAVITY = 15;
/** How much momentum an impact returns. Stone on wood, not rubber. */
const RESTITUTION = 0.62;
/** Below this an impact is no hit, just resting. */
const BOUNCE_FLOOR = 0.3;
/** How fast an impact runs out of the pose. */
const WOBBLE_DECAY = 7;
/** When the body starts rocking over its edge, and how often. */
const ROCK_FROM = 0.72;
const ROCK_TURNS = 3;
/** The share of the throw from which it counts as arrived, for sparks and sound. */
const LANDED_AT = 0.95;

/**
 * **Where the table holds the die's centre at point `s` of the throw.**
 *
 * A tumbling body rolls over its edges and corners, so its centre stays high;
 * a lying one rests on a face, lower, and much lower on a d4. The height comes
 * down with the bounce (`damp`): by the time the die no longer hops, it lies.
 */
function floorAt(die: DieAnim, s: number): number {
  return restHeight(die.radius, die.lie + (TUMBLE_HEIGHT - die.lie) * damp(s));
}

/**
 * A die lying still and visible on its spot until `beginRoll` launches it.
 * `lie` is its body's height when lying on a face (`lyingHeight`).
 */
export function makeDie(
  rng: Rng,
  home: readonly [number, number] = [0, 0],
  radius = 0.92,
  stage: readonly [number, number] = [STAGE_X, STAGE_Z],
  lie = TUMBLE_HEIGHT,
): DieAnim {
  let q = qAxisAngle(randomAxis(rng), rng() * Math.PI * 2);
  q = qNormalize(qMul(qAxisAngle(randomAxis(rng), rng() * Math.PI), q));
  const floor = restHeight(radius, lie);
  return {
    phase: 'rest',
    p: [home[0], floor, home[1]],
    v: [0, 0, 0],
    q,
    w: [0, 0, 0],
    home,
    radius,
    lie,
    floor,
    stage,
    delay: 0,
    target: q,
    t: 0,
    restFor: 0,
    bounces: 0,
    wallHits: 0,
    impact: null,
    wobble: qIdentity(),
    tour: planTour(home, radius, stage, rng),
    cellX: 0,
    cellZ: 0,
  };
}

/**
 * **The pose at time `s`**, written down, not summed up: the target, turned
 * back by `back = −(1−s)^spinEase`. At `s = 1` every factor above the target is
 * the identity, so exactly the target remains without anything turning it there.
 */
function poseAt(die: DieAnim, s: number): Quat {
  const { axisA, axisB, turnA, turnB, spinEase, rockAxis, rockAmount } = die.tour;
  const back = -Math.pow(1 - s, spinEase);

  let q = die.target;
  q = qMul(qAxisAngle(axisB, turnB * back), q);
  q = qMul(qAxisAngle(axisA, turnA * back), q);

  // The rock: a damped swing whose envelope is zero at both ends.
  const u = (s - ROCK_FROM) / (1 - ROCK_FROM);
  if (u > 0 && u < 1) {
    const envelope = (1 - u) * (1 - u);
    q = qMul(qAxisAngle(rockAxis, rockAmount * Math.sin(ROCK_TURNS * Math.PI * u) * envelope), q);
  }

  // The impacts, blended out with `1 − s` so none can move the arrival.
  if (s < 1) q = qMul(qSlerp(qIdentity(), die.wobble, 1 - s), q);
  return qNormalize(q);
}

/** How fast the pose turned between two frames, as a vector. */
function angularVelocity(from: Quat, to: Quat, dt: number): Vec3 {
  if (dt <= 0) return [0, 0, 0];
  const d = qMul(to, { w: from.w, x: -from.x, y: -from.y, z: -from.z });
  const sin = Math.hypot(d.x, d.y, d.z);
  if (sin < 1e-9) return [0, 0, 0];
  // Remove the sign of `w`, or the axis flips every half turn and the blur flickers.
  const flip = d.w < 0 ? -1 : 1;
  const angle = 2 * Math.atan2(sin, Math.abs(d.w));
  return vScale([(d.x * flip) / sin, (d.y * flip) / sin, (d.z * flip) / sin], angle / dt);
}

/**
 * The launch: rolls path and tumble and lifts the body off the table. The pose
 * jumps to `poseAt` in the first frame, which nobody sees at sixty turns a second.
 */
export function beginRoll(die: DieAnim, target: Quat, delay: number, rng: Rng, maxWallHits = Infinity): void {
  die.phase = 'throw';
  die.floor = restHeight(die.radius);
  die.p = [die.home[0], die.floor + 0.02, die.home[1]];
  die.tour = planTour(die.home, die.radius, die.stage, rng, maxWallHits);
  die.cellX = cellOf(die.home[0], die.tour.wallX);
  die.cellZ = cellOf(die.home[1], die.tour.wallZ);
  die.v = [0, 2.9 + rng() * 1.0, 0];
  die.target = target;
  die.delay = delay;
  die.restFor = 0;
  die.bounces = 0;
  die.wallHits = 0;
  die.impact = null;
  die.wobble = qIdentity();
  die.t = 0;
  die.q = poseAt(die, 0);
  // The spin of the first frame, so the motion blur does not lag a turn behind.
  const probe = 1 / 240 / die.tour.duration;
  die.w = angularVelocity(die.q, poseAt(die, probe), probe * die.tour.duration);
}

/** An impact knocks the pose. It decays, and `poseAt` blends it out by the end. */
function jolt(die: DieAnim, amount: number, rng: Rng): void {
  die.wobble = qNormalize(qMul(qAxisAngle(randomAxis(rng), amount), die.wobble));
}

/**
 * The wall hit: a jolt, a hop, a bang. **The bang belongs at the wall**: the
 * cell change is noticed a step late, when the die has already rebounded, so
 * the hit axis is reset to the **contact point**. Not to `wall`, where the
 * centre stands a whole radius inside (sparks then came from the middle of the
 * die), but to its skin at `wall + radius`.
 */
function hitWall(
  die: DieAnim,
  normal: Vec3,
  wall: number,
  here: Vec3,
  s: number,
  vy: number,
  rng: Rng,
): number {
  die.wallHits += 1;
  const punch = Math.max(0, 1 - s);
  jolt(die, 0.12 + punch * 0.3, rng);
  const skinDistance = wall + die.radius;
  const at: Vec3 = [
    normal[0] !== 0 ? -normal[0] * skinDistance : here[0],
    here[1],
    normal[2] !== 0 ? -normal[2] * skinDistance : here[2],
  ];
  die.impact = { kind: 'wall', strength: 0.35 + punch * 0.65, at, normal };
  // The cushion throws it up, but only while the throw still has energy.
  return s < 0.8 ? Math.max(vy, 1.0 * punch) : vy;
}

export function stepDie(die: DieAnim, dt: number, rng: Rng): void {
  die.impact = null;

  if (die.phase === 'rest') {
    die.restFor += dt;
    return;
  }

  if (die.delay > 0) {
    // Before its own launch the die lies still on its spot.
    die.delay -= dt;
    return;
  }

  die.t += dt;
  const { spanX, spanZ, wallX, wallZ, duration, ease } = die.tour;
  const s = Math.min(1, die.t / duration);

  // **The path.** A straight line on the unfolded table, folded into the zigzag.
  // `tau(1) = 1` puts the last point on the spot, and its zero slope there
  // makes the die arrive without speed.
  const tau = 1 - Math.pow(1 - s, ease);
  const ux = die.home[0] + spanX * tau;
  const uz = die.home[1] + spanZ * tau;
  const x = fold(ux, wallX);
  const z = fold(uz, wallZ);

  // **The height** stays ballistics: fall, hit, hop shorter.
  // The table gives way under a die that lies down (`floorAt`); the die rides
  // it, so sinking onto its face is no fall and no impact.
  const floor = floorAt(die, s);
  let vy = die.v[1] - GRAVITY * dt;
  let y = die.p[1] - die.floor + floor + vy * dt;
  die.floor = floor;
  if (y <= floor && vy < 0) {
    // **Resting is not an impact**, or every frame on the table would rattle.
    const impactSpeed = -vy;
    y = floor;
    vy = impactSpeed > BOUNCE_FLOOR ? impactSpeed * RESTITUTION * damp(s) : 0;
    if (vy < 0.14) vy = 0;
    if (impactSpeed > BOUNCE_FLOOR) {
      const hit = Math.min(1, impactSpeed / 4);
      jolt(die, hit * 0.22 * (1 - s), rng);
      die.bounces += 1;
      die.impact = { kind: 'floor', strength: hit, at: [x, floor, z], normal: [0, 1, 0] };
    }
  }

  // **The walls.** A cell change means a wall lay exactly between; which one,
  // the pair of old and new cell tells (see `wallSide`). The position is this
  // frame's: on the other axis a stale one would put the sparks beside the gap.
  const nextX = cellOf(ux, wallX);
  const nextZ = cellOf(uz, wallZ);
  const here: Vec3 = [x, y, z];
  if (nextX !== die.cellX) {
    const side = wallSide(die.cellX, nextX);
    die.cellX = nextX;
    vy = hitWall(die, [-side, 0, 0], wallX, here, s, vy, rng);
  }
  if (nextZ !== die.cellZ) {
    const side = wallSide(die.cellZ, nextZ);
    die.cellZ = nextZ;
    vy = hitWall(die, [0, 0, -side], wallZ, here, s, vy, rng);
  }

  // Velocity from the actual path, for trails and sound.
  if (dt > 0) die.v = [(x - die.p[0]) / dt, vy, (z - die.p[2]) / dt];
  die.p = [x, y, z];

  // **The spin.** Read off, not summed up, and its speed measured from that.
  die.wobble = qSlerp(die.wobble, qIdentity(), Math.min(1, WOBBLE_DECAY * dt));
  const previous = die.q;
  die.q = poseAt(die, s);
  die.w = angularVelocity(previous, die.q, dt);

  // The throw stands, reported a hair early so sparks and sound fall on the last visible motion.
  const landedAt = duration * LANDED_AT;
  if (die.t >= landedAt && die.t - dt < landedAt) {
    die.impact = { kind: 'settle', strength: 1, at: [x, floor, z], normal: [0, 1, 0] };
  }

  // Over and back on the floor. The die already shows its number: it never turned elsewhere.
  if (s >= 1 && vy === 0 && y <= floor + 1e-6) {
    die.phase = 'rest';
    die.q = die.target;
    die.p = [die.home[0], floor, die.home[1]];
    die.v = [0, 0, 0];
    die.w = [0, 0, 0];
    die.wobble = qIdentity();
    die.restFor = 0;
  }
}

/** Come to rest at once, for reduced motion. */
export function restImmediately(die: DieAnim, target: Quat): void {
  die.phase = 'rest';
  die.q = target;
  die.target = target;
  die.floor = restHeight(die.radius, die.lie);
  die.p = [die.home[0], die.floor, die.home[1]];
  die.v = [0, 0, 0];
  die.w = [0, 0, 0];
  die.wobble = qIdentity();
  die.delay = 0;
  die.restFor = 0;
  die.impact = null;
}
