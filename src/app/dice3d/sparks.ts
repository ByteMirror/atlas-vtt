/**
 * **Sparks** over the throw.
 *
 * This used to be a `THREE.PointsMaterial`. Without a texture it draws
 * **squares**: nobody notices with eight points, with sixty it looks like paper
 * confetti. Sparks are round, white inside and nothing outside. That is not an
 * image but a formula, and it lives in the fragment shader below.
 *
 * A single point cloud carries every spark on the stage: the spray at a wall,
 * the shower on landing, the fireworks of a top roll. A dead spark gets size
 * zero and costs nothing more. So nothing is built in the middle of a throw,
 * where a hitch would be exactly where everyone is looking.
 */

import * as THREE from 'three';

import type { Vec3 } from './vectorMath';

export interface SparkBurst {
  count: number;
  at: Vec3;
  /** Main direction of the spray cone. */
  dir: Vec3;
  /** 0 is a beam, 1 a sphere. */
  spread: number;
  speed: number;
  /**
   * How hard the air brakes. **The real control for the reach**: a spark
   * travels about `speed / drag`, however long it lives.
   */
  drag?: number;
  /**
   * How far from the origin the sparks are **born**. Born from one point they
   * look like a blob in the first moment; born from a shell they are a cloud
   * from the start.
   */
  shell?: number;
  /** Lifetime in seconds, scattered upwards. */
  life: number;
  size: number;
  /** Two colours, the hot core and the cold ash, mixed per spark. */
  hot: THREE.ColorRepresentation;
  cool: THREE.ColorRepresentation;
  gravity: number;
}

const CAPACITY = 420;

/**
 * `uScale` is `viewport height / (2·tan(half fov))`, the factor from world
 * units to pixels at camera distance 1. There once was a guessed number here,
 * and the sparks were two pixels large: present on paper, invisible to the eye.
 * Nothing is guessed here any more.
 */
const VERTEX = /* glsl */ `
  uniform float uScale;
  attribute float aSize;
  attribute vec3 aTint;
  attribute float aFade;
  varying vec3 vTint;
  varying float vFade;
  void main() {
    vTint = aTint;
    vFade = aFade;
    vec4 mv = modelViewMatrix * vec4(position, 1.0);
    gl_PointSize = max(1.0, aSize * uScale / max(0.001, -mv.z));
    gl_Position = projectionMatrix * mv;
  }
`;

/**
 * **Painted, not added.**
 *
 * Additive glow is the usual choice for sparks, and on parchment it is
 * nothing: gold plus cream is cream. The embers were there in the numbers and
 * invisible to the eye. On a light ground a spark has to *cover* instead of
 * glow; it shows because it is **richer and darker** than the paper, gold leaf
 * rather than phosphor.
 *
 * It stays round, and it keeps a brighter core: that now lives in the opacity
 * and in a lightening towards the centre, not in a sum with the background.
 */
const FRAGMENT = /* glsl */ `
  varying vec3 vTint;
  varying float vFade;
  void main() {
    float d = length(gl_PointCoord - vec2(0.5)) * 2.0;
    float a = 1.0 - smoothstep(0.0, 1.0, d);
    a *= a;
    if (a * vFade < 0.01) discard;
    gl_FragColor = vec4(mix(vTint, vTint + vec3(0.45), a * a), a * vFade);
  }
`;

const HOT = new THREE.Color();
const COOL = new THREE.Color();
const MIX = new THREE.Color();

export class Sparks {
  private readonly points: THREE.Points<THREE.BufferGeometry, THREE.ShaderMaterial>;
  private readonly scale = { value: 900 };
  private readonly position: Float32Array;
  private readonly size: Float32Array;
  private readonly tint: Float32Array;
  private readonly fade: Float32Array;
  private readonly velocity = new Float32Array(CAPACITY * 3);
  private readonly age = new Float32Array(CAPACITY);
  private readonly life = new Float32Array(CAPACITY);
  private readonly size0 = new Float32Array(CAPACITY);
  private readonly tint0 = new Float32Array(CAPACITY * 3);
  private readonly drag = new Float32Array(CAPACITY);
  private readonly gravity = new Float32Array(CAPACITY);
  /** Where the next spark is written: the ring buffer. */
  private next = 0;
  private alive = 0;

  constructor(
    scene: THREE.Scene,
    private readonly floorY: number,
  ) {
    const geometry = new THREE.BufferGeometry();
    this.position = new Float32Array(CAPACITY * 3);
    this.size = new Float32Array(CAPACITY);
    this.tint = new Float32Array(CAPACITY * 3);
    this.fade = new Float32Array(CAPACITY);
    geometry.setAttribute('position', new THREE.BufferAttribute(this.position, 3));
    geometry.setAttribute('aSize', new THREE.BufferAttribute(this.size, 1));
    geometry.setAttribute('aTint', new THREE.BufferAttribute(this.tint, 3));
    geometry.setAttribute('aFade', new THREE.BufferAttribute(this.fade, 1));
    // The bounds only keep `three` from culling sparks one by one: they fly
    // far, but the cloud as a whole is always in view.
    geometry.boundingSphere = new THREE.Sphere(new THREE.Vector3(), 40);

    this.points = new THREE.Points(
      geometry,
      new THREE.ShaderMaterial({
        uniforms: { uScale: this.scale },
        vertexShader: VERTEX,
        fragmentShader: FRAGMENT,
        transparent: true,
        depthWrite: false,
        // **Sparks are never hidden.** They are born at the body, mostly
        // *inside* it; with depth testing nearly all of them fall behind the
        // die and are gone. The gold dust belongs on top, as in the game it
        // was taken from.
        depthTest: false,
      }),
    );
    this.points.frustumCulled = false;
    this.points.visible = false;
    scene.add(this.points);
  }

  /** Viewport height and field of view change the conversion; both come from outside. */
  setViewport(heightPx: number, fovDegrees: number): void {
    this.scale.value = heightPx / (2 * Math.tan((fovDegrees * Math.PI) / 360));
  }

  emit(burst: SparkBurst): void {
    HOT.set(burst.hot);
    COOL.set(burst.cool);
    const dir = new THREE.Vector3(burst.dir[0], burst.dir[1], burst.dir[2]).normalize();
    for (let n = 0; n < burst.count; n++) {
      const i = this.next;
      this.next = (this.next + 1) % CAPACITY;
      if (this.age[i]! >= this.life[i]!) this.alive++;

      // A direction in the cone: a random direction pulled towards the main
      // direction. `spread` decides how hard it is pulled.
      const t = Math.random() * Math.PI * 2;
      const c = Math.random() * 2 - 1;
      const r = Math.sqrt(1 - c * c);
      const wobble = new THREE.Vector3(r * Math.cos(t), c, r * Math.sin(t));
      wobble.lerp(dir, 1 - burst.spread).normalize();

      const speed = burst.speed * (0.4 + Math.random() * 1.1);
      const born = (burst.shell ?? 0.06) * (0.35 + Math.random() * 0.65);
      this.position[i * 3] = burst.at[0] + wobble.x * born;
      this.position[i * 3 + 1] = burst.at[1] + wobble.y * born;
      this.position[i * 3 + 2] = burst.at[2] + wobble.z * born;
      this.velocity[i * 3] = wobble.x * speed;
      this.velocity[i * 3 + 1] = wobble.y * speed;
      this.velocity[i * 3 + 2] = wobble.z * speed;

      this.age[i] = 0;
      this.life[i] = burst.life * (0.6 + Math.random() * 0.7);
      this.size0[i] = burst.size * (0.5 + Math.random() * 1.1);
      this.drag[i] = (burst.drag ?? 2.5) * (0.75 + Math.random() * 0.5);
      this.gravity[i] = burst.gravity;

      MIX.copy(COOL)
        .lerp(HOT, Math.random() ** 0.6)
        .toArray(this.tint0, i * 3);
    }
  }

  /** Whether any spark still glows. */
  get burning(): boolean {
    return this.alive > 0;
  }

  step(dt: number): void {
    if (this.alive === 0) {
      this.points.visible = false;
      return;
    }
    this.points.visible = true;
    let alive = 0;
    for (let i = 0; i < CAPACITY; i++) {
      const life = this.life[i]!;
      if (this.age[i]! >= life) {
        this.size[i] = 0;
        continue;
      }
      this.age[i] = this.age[i]! + dt;
      const u = this.age[i]! / life;
      if (u >= 1) {
        this.size[i] = 0;
        continue;
      }
      alive++;

      const x = i * 3;
      const y = x + 1;
      const z = x + 2;
      const slow = Math.exp(-this.drag[i]! * dt);
      this.velocity[x] = this.velocity[x]! * slow;
      this.velocity[y] = this.velocity[y]! * slow - this.gravity[i]! * dt;
      this.velocity[z] = this.velocity[z]! * slow;
      this.position[x] = this.position[x]! + this.velocity[x] * dt;
      this.position[y] = this.position[y]! + this.velocity[y] * dt;
      this.position[z] = this.position[z]! + this.velocity[z] * dt;

      // **The table holds sparks too.** Without this line they fall through,
      // and what should look like embers skidding over the wood looks like
      // embers the wood has swallowed.
      if (this.position[y] < this.floorY) {
        this.position[y] = this.floorY;
        this.velocity[y] = Math.abs(this.velocity[y]) * 0.3;
      }

      // A spark fades but hardly shrinks: shrinking with its brightness it
      // would be a single pixel after a blink, and gone. What keeps it alive is
      // the flicker; it glows. **The colour stays**, only the opacity goes: on
      // a light ground a spark whose colour faded would turn into paper
      // instead of vanishing.
      const flicker = 0.72 + 0.28 * Math.sin((u * 34 + i) * 2.1);
      this.size[i] = this.size0[i]! * (0.45 + 0.55 * (1 - u)) * flicker;
      this.fade[i] = Math.pow(1 - u, 1.15) * flicker;
      this.tint[x] = this.tint0[x]!;
      this.tint[y] = this.tint0[y]!;
      this.tint[z] = this.tint0[z]!;
    }
    this.alive = alive;
    const g = this.points.geometry;
    g.getAttribute('position').needsUpdate = true;
    g.getAttribute('aSize').needsUpdate = true;
    g.getAttribute('aTint').needsUpdate = true;
    g.getAttribute('aFade').needsUpdate = true;
  }

  /**
   * All glow off at once. For a stage handed on to the next throw: its first
   * frame must not inherit the previous throw's sparks. An age beyond any
   * lifetime means "dead" everywhere.
   */
  clear(): void {
    this.age.fill(Number.POSITIVE_INFINITY);
    this.size.fill(0);
    this.alive = 0;
    this.points.visible = false;
  }
}
