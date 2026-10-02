/**
 * The dice renderer: **real light instead of computed tones.**
 *
 * A software version painted every face with a gradient and a formula
 * highlight; it read as cardboard, not as a die. What gives a die its look
 * cannot be painted per face:
 *
 * 1. **Reflections of the surroundings.** A studio environment
 *    (`RoomEnvironment`) stands behind the material as its mirror world.
 * 2. **The chamfer as a body.** The edge is really ground off: a narrow strip
 *    of geometry that catches the light differently from the face, anew at
 *    every turn (`dieMesh.ts`).
 * 3. **The cut numeral.** A bump map sinks the number into the material.
 * 4. **A real cast shadow.** The die casts it on the table, with a soft edge,
 *    in its own shape; no blob underneath.
 *
 * The math stays where it is: `dieGeometry.ts` supplies the bodies,
 * `dieMotion.ts` the path. This file only draws.
 */

import * as THREE from 'three';
import { RoomEnvironment } from 'three/examples/jsm/environments/RoomEnvironment.js';

import type { DieSides } from './dieGeometry';
import { dieAssets } from './dieMesh';
import type { DieAnim } from './dieMotion';
import { FLOOR_Y } from './dieTour';
import { chainLengthFor, GhostTrail } from './ghostTrail';
import { landingSparks, wallSparks, type Crit } from './impactSparks';
import { Sparks } from './sparks';
import { STAGE_FOV, StageCamera } from './stageCamera';
import { StageShadow } from './stageShadow';

export interface StageDie {
  anim: DieAnim;
  sides: DieSides;
  /** Rolled for an explosion: not on the table until it is thrown. */
  waits?: boolean;
  /** The die exploded: it lands with this burst, whatever the roll as a whole is. */
  burst?: Crit;
}

/**
 * How large the mirror world is baked, per face. The dice are matte paper
 * (roughness 0.92, a fifth of the room's light): they read only its blurriest
 * level, which 64 pixels hold as well as 256, in a fraction of the time a new
 * stage takes to build.
 */
const ENVIRONMENT_SIZE = 64;

/** Puts the mesh where its die is. Returns whether that moved it. */
function place(mesh: THREE.Mesh, anim: DieAnim): boolean {
  const { position, quaternion, scale } = mesh;
  const [x, y, z] = anim.p;
  const q = anim.q;
  const moved =
    position.x !== x || position.y !== y || position.z !== z ||
    quaternion.x !== q.x || quaternion.y !== q.y || quaternion.z !== q.z || quaternion.w !== q.w ||
    scale.x !== anim.radius;
  position.set(x, y, z);
  quaternion.set(q.x, q.y, q.z, q.w);
  scale.setScalar(anim.radius);
  return moved;
}

/** The pixel ratio a stage in `win` is drawn at: beyond 2 nobody sees the difference, and it is paid on every frame. */
export function stagePixelRatio(win: Window): number {
  return Math.min(2, win.devicePixelRatio || 1);
}

export class DiceRenderer {
  private readonly renderer: THREE.WebGLRenderer;
  private readonly scene = new THREE.Scene();
  private readonly view = new StageCamera();
  private readonly shadow: StageShadow;
  private readonly pmrem: THREE.PMREMGenerator;
  /** The baked reflection: its own render target that nothing else clears. */
  private readonly envRT: THREE.WebGLRenderTarget;
  private meshes: THREE.Mesh[] = [];
  private readonly trails: GhostTrail;
  private readonly sparks: Sparks;
  /** Who has landed already: the landing fires only once. */
  private landed: boolean[] = [];
  private lastTime: number | null = null;
  /** The canvas' drawing buffer: its size in CSS pixels and its pixel ratio. */
  private buffer = { width: 0, height: 0, dpr: 0 };

  constructor(canvas: HTMLCanvasElement) {
    this.renderer = new THREE.WebGLRenderer({ canvas, alpha: true, antialias: true });
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;

    this.pmrem = new THREE.PMREMGenerator(this.renderer);
    // The mirror world is baked **once**; the room it comes from has nothing
    // left to do and gives its meshes back right away.
    const room = new RoomEnvironment();
    this.envRT = this.pmrem.fromScene(room, 0.04, 0.1, 100, { size: ENVIRONMENT_SIZE });
    room.dispose();
    this.scene.environment = this.envRT.texture;

    this.shadow = new StageShadow(this.renderer, this.scene);

    this.trails = new GhostTrail(this.scene);
    this.sparks = new Sparks(this.scene, FLOOR_Y + 0.02);

    // **The canvas is wiped before anyone sees it.**
    //
    // Baking the mirror world draws, and it draws bright: `RoomEnvironment` is
    // a white room. Whatever of it stays in the framebuffer stands there until
    // the first real frame covers it, and between setup and first frame there
    // is at least one layout pass. That was the **white box with sharp
    // corners** flashing over the sheet on the second throw: not the paper, not
    // the mask, but the leftovers of the oven.
    this.renderer.setRenderTarget(null);
    this.renderer.clear();
  }

  /**
   * One mesh per planned die; dice of the same kind share geometry and
   * material. Each gets a chain of ghosts, shorter the more dice there are
   * (`chainLengthFor`).
   */
  setPlan(sides: DieSides[]): void {
    for (const mesh of this.meshes) this.scene.remove(mesh);
    this.trails.clear();
    this.landed = sides.map(() => false);
    this.shadow.bodiesChanged();

    const chainLength = chainLengthFor(sides.length);

    this.meshes = sides.map((s) => {
      const assets = dieAssets(s);
      const mesh = new THREE.Mesh(assets.geometry, assets.material);
      mesh.castShadow = true;
      mesh.visible = false;
      this.scene.add(mesh);
      this.trails.addChain(assets, chainLength);
      return mesh;
    });
  }

  /** The stage as the throw knows it: half width and half depth in world units. */
  stage(): readonly [number, number] {
    return this.view.stage();
  }

  /**
   * Sizes the canvas to exactly this and fits the camera: to `halfWidth` world
   * units either side of the centre, by default the whole stage the dice bounce
   * around in.
   */
  setSize(width: number, height: number, dpr: number, focus = 0.5, halfWidth?: number): void {
    this.allocate(width, height, dpr);
    this.fitView(width, height, focus, halfWidth);
  }

  /**
   * `setSize` for a stage on a panel: draws at this size in the bottom left
   * corner of a canvas that is at least as large, and keeps the canvas.
   *
   * Making drawing buffers takes milliseconds, and a panel asked for them at
   * the two moments that have none to spare: when its roll arrives, and when
   * the next roll shrinks it to a row. So a canvas only ever grows; the stage
   * holds it by that corner and clips the rest (`.atlas-dice-roll__stage`).
   */
  setView(width: number, height: number, dpr: number, focus = 0.5, halfWidth?: number): void {
    const { buffer } = this;
    // Another pixel ratio makes new buffers whatever their size, so they start at this one.
    if (dpr !== buffer.dpr) this.allocate(width, height, dpr);
    else this.allocate(Math.max(width, buffer.width), Math.max(height, buffer.height), dpr);
    this.fitView(width, height, focus, halfWidth);
  }

  /** Gives the canvas this size, as an element and in its drawing buffers, unless it has it. */
  private allocate(width: number, height: number, dpr: number): void {
    const { buffer } = this;
    if (width === buffer.width && height === buffer.height && dpr === buffer.dpr) return;
    this.buffer = { width, height, dpr };
    this.renderer.setPixelRatio(dpr);
    // Sets the element's CSS size too: the stylesheet leaves it to the renderer.
    this.renderer.setSize(width, height);
  }

  /**
   * Draws at this size in the canvas' bottom left corner and fits the camera,
   * the key light and its shadow frame to it.
   */
  private fitView(width: number, height: number, focus: number, halfWidth: number | undefined): void {
    this.renderer.setViewport(0, 0, width, height);
    this.view.setAspect(width / height);
    this.view.fit(focus, halfWidth);
    const [halfX, halfZ] = this.view.stage();
    this.shadow.fit(this.view.reach, this.view.focusZ, halfX, halfZ);
    // Sparks are sized in pixels, not world units; the conversion depends on
    // exactly this height.
    this.sparks.setViewport(height * this.buffer.dpr, STAGE_FOV);
  }

  /** One frame: take the poses from the simulation and draw. */
  render(dice: StageDie[], emphasis: number, crit: Crit = null): void {
    const now = performance.now() / 1000;
    const dt = this.lastTime === null ? 0 : Math.min(0.05, now - this.lastTime);
    this.lastTime = now;

    let moved = false;
    for (let i = 0; i < this.meshes.length; i++) {
      const die = dice[i];
      const mesh = this.meshes[i]!;
      if (die === undefined) continue;
      const anim = die.anim;
      // The waiting die lies visibly in place; the delay hides nothing any
      // more, it is the stillness before the push. Only a die rolled for an
      // explosion is not there yet: it exists once the die before it burst.
      const visible = !(die.waits === true && anim.phase === 'throw' && anim.delay > 0);
      if (mesh.visible !== visible) moved = true;
      mesh.visible = visible;
      if (!visible) continue;
      if (place(mesh, anim)) moved = true;

      const hit = wallSparks(anim);
      if (hit !== null) this.sparks.emit(hit);
      if (anim.impact?.kind === 'settle' && !this.landed[i]) {
        this.landed[i] = true;
        this.sparks.emit(landingSparks(anim, die.burst ?? crit));
      } else if (anim.phase === 'throw' && anim.t < 0.2) {
        this.landed[i] = false;
      }

      this.trails.update(i, mesh, anim);
    }

    this.shadow.update(dice, emphasis, moved);

    this.placeCamera(dice, dt);
    this.sparks.step(dt);

    this.renderer.render(this.scene, this.view.camera);
  }

  /**
   * Whether the next frame would show what the last one did, the dice being at
   * rest: no spark burns and the camera stands. The stage's clock stops there.
   */
  isStill(): boolean {
    return !this.sparks.burning && !this.view.shaking;
  }

  /** Shakes the camera by the strongest wall hit of this frame. */
  private placeCamera(dice: StageDie[], dt: number): void {
    let bang = 0;
    for (const die of dice) {
      if (die.anim.impact?.kind === 'wall') bang = Math.max(bang, die.anim.impact.strength);
    }
    this.view.place(bang, dt);
  }

  /**
   * **The stage is cleared, not torn down.**
   *
   * There once was a `dispose()` here that gave the WebGL context back with
   * `forceContextLoss()`, because every throw built its own stage. The idea was
   * right, the effect was not: an abandoned context **keeps counting** until
   * garbage collection gets round to it. Measured in WebKit, twenty throws in
   * a row: from the seventeenth on, every single one logged "There are too many
   * active WebGL contexts on this page, the oldest context will be lost", and
   * right after it "loseContext: context already lost": the browser had
   * reclaimed the context itself before we could give it back. Each of those
   * contexts held a 2048 shadow map and a baked reflection. On a phone the
   * series does not end with a warning but with the system reloading the page
   * under memory pressure, mid-game.
   *
   * So no context is thrown away any more. The stage is cleared and handed on
   * to the next throw (`stagePool.ts`): the pool grows to as many contexts as
   * were ever on screen *at the same time*.
   */
  reset(): void {
    this.setPlan([]);
    this.sparks.clear();
    this.view.resetShake();
    this.lastTime = null;
    // What was last in the framebuffer belonged to the previous throw. The
    // borrowed canvas starts empty, or its last frame flashes up briefly.
    this.renderer.setRenderTarget(null);
    this.renderer.clear();
  }
}
