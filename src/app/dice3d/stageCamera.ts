/**
 * The camera over the dice stage: fitted to the canvas once per size, fixed
 * afterwards, nudged only by the shake of a wall hit.
 */

import * as THREE from 'three';

import { STAGE_X, STAGE_Z } from './dieTour';

/**
 * The view **from above**, as in Baldur's Gate: the camera hangs almost
 * straight over the table, offset forward just enough that the die's body stays
 * readable. The rolled face lies on top and looks at the viewer.
 */
const CAMERA = { fov: 26, direction: [0, 7.0, 2.2] as const };
export const STAGE_FOV = CAMERA.fov;

/**
 * **The camera stands still, far enough away that the whole sheet fits.**
 *
 * There once was a camera move here: back during the flight, in again on
 * landing. It was a workaround for the die living in a 16:10 cutout with no
 * room in it. Now the canvas is the whole sheet, and a moving camera would be
 * outright **wrong**: a die bouncing off a wall that is not at the edge of the
 * picture visibly bounces off nothing.
 *
 * Instead the distance is **measured** once per canvas size (`fit`), so the
 * die appears the same size on a tall sheet as on a wide one. Whatever the
 * camera sees as the edge is the wall.
 */
export const VIEW_HALF_WIDTH = 2.72;
/** A finger's breadth of air, so no body runs over the torn paper edge. */
const WALL_MARGIN = 0.12;

/** How hard a wall hit nudges the camera, and how fast that dies down. */
const SHAKE_PER_HIT = 0.03;
const SHAKE_DECAY = 9;
/** A shake this small moves the picture by about a hundredth of a pixel. */
const SHAKE_UNSEEN = 1e-4;

/** The four screen corners and a scratch vector, allocated once, not per frame. */
const CORNERS: readonly (readonly [number, number])[] = [
  [-1, -1],
  [1, -1],
  [-1, 1],
  [1, 1],
];
const PROBE = new THREE.Vector3();

export class StageCamera {
  readonly camera = new THREE.PerspectiveCamera(CAMERA.fov, 1, 0.5, 80);
  /** The measured camera distance and the half visible area below it. */
  private reachValue = 1;
  private half: readonly [number, number] = [STAGE_X, STAGE_Z];
  /** Where the camera looks: the point the dice come to rest on. */
  private focus = 0;
  private shake = 0;

  constructor() {
    this.aim(1, 0);
  }

  get reach(): number {
    return this.reachValue;
  }

  get focusZ(): number {
    return this.focus;
  }

  /** Half width and half depth of the stage in world units; the walls stand there. */
  stage(): readonly [number, number] {
    return this.half;
  }

  setAspect(aspect: number): void {
    this.camera.aspect = aspect;
    this.camera.updateProjectionMatrix();
  }

  /**
   * **Fits the sheet.**
   *
   * Two values are settled here: the distance (far enough that the same width
   * of table is always visible, otherwise the die would be twice as large on a
   * tall sheet as on a wide one) and the depth of the look-at point (chosen so
   * the dice come to rest where `focus` asks).
   *
   * Both are **measured, not derived**, and both are linear in the value
   * sought, so one probe per size is enough.
   */
  fit(focus: number, halfWidth = VIEW_HALF_WIDTH): void {
    this.aim(1, 0);
    const [probeX] = this.visible(0);
    this.reachValue = probeX > 1e-6 ? halfWidth / probeX : 1;

    // The look-at point: how far into the depth must it move for the centre
    // of the stage to sit at the requested height of the sheet?
    const want = 1 - 2 * focus;
    this.aim(this.reachValue, 0);
    const atZero = this.originOnScreen();
    this.aim(this.reachValue, 1);
    const atOne = this.originOnScreen();
    this.focus = Math.abs(atOne - atZero) < 1e-6 ? 0 : (want - atZero) / (atOne - atZero);

    this.aim(this.reachValue, this.focus);
    const [x, z] = this.visible(this.focus);
    this.half = [Math.max(0.4, x - WALL_MARGIN), Math.max(0.4, z - WALL_MARGIN)];
  }

  /**
   * A tremor when a die just hit the wall (`bang` is the strongest hit this
   * frame). It stays tiny: it should confirm the blow, not shake the picture,
   * and above all it must not move the walls the die bounces off.
   */
  place(bang: number, dt: number): void {
    this.shake = Math.max(this.shake * Math.exp(-SHAKE_DECAY * dt), bang * SHAKE_PER_HIT);
    this.aim(this.reachValue, this.focus, (Math.random() - 0.5) * this.shake * this.reachValue);
  }

  /** Whether a wall hit still moves the camera by anything a pixel could show. */
  get shaking(): boolean {
    return this.shake > SHAKE_UNSEEN;
  }

  resetShake(): void {
    this.shake = 0;
  }

  /** Camera at `reach` times the base distance, looking at `focusZ` in the depth. */
  private aim(reach: number, focusZ: number, jitter = 0): void {
    this.camera.position.set(
      CAMERA.direction[0] * reach + jitter,
      CAMERA.direction[1] * reach,
      CAMERA.direction[2] * reach + focusZ + jitter,
    );
    this.camera.lookAt(0, 0, focusZ);
    this.camera.updateMatrixWorld();
  }

  /**
   * Where the ray through screen point `(sx, sy)` meets the rest plane. This
   * reads what the camera actually sees of the table, instead of deriving it
   * from field of view and tilt and getting it wrong.
   */
  private groundAt(sx: number, sy: number, into: THREE.Vector3): THREE.Vector3 {
    into.set(sx, sy, 0.5).unproject(this.camera).sub(this.camera.position);
    const t = -this.camera.position.y / into.y;
    return into.multiplyScalar(t).add(this.camera.position);
  }

  /** The half visible area around `focusZ`; the tightest corner counts. */
  private visible(focusZ: number): [number, number] {
    let x = Infinity;
    let z = Infinity;
    for (const [sx, sy] of CORNERS) {
      const p = this.groundAt(sx, sy, PROBE);
      x = Math.min(x, Math.abs(p.x));
      z = Math.min(z, Math.abs(p.z - focusZ));
    }
    return [x, z];
  }

  /** Where the world origin lands on screen, in normalised device coordinates (-1…1). */
  private originOnScreen(): number {
    return PROBE.set(0, 0, 0).project(this.camera).y;
  }
}
