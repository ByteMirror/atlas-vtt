import * as THREE from 'three';
import type { App } from 'obsidian';
import { DiceEngine } from './engine/DiceEngine';
import { createDiceSettings } from './engine/diceSettings';
import { loadDicePack } from './dicePack';

const PREVIEW_PIXELS = 256;
/** Long enough for the face sheets to load; after that a still die needs no more frames. */
const DRAW_FOR_MS = 3000;
const TOWARD_CAMERA = new THREE.Vector3(0, 0, 1);
/** A little turn off square, so the die reads as a solid rather than a flat triangle. */
const TILT = new THREE.Quaternion().setFromEuler(new THREE.Euler(-0.32, 0.28, 0));

interface Preview {
  canvas: HTMLCanvasElement;
  mesh: THREE.Mesh | null;
  /** When the die was built; it is drawn until DRAW_FOR_MS after. */
  builtAt: number;
}

/**
 * A d20 with its 20 face up for each of the asset manager's dice packs. Every card has a plain 2D
 * canvas; one WebGL renderer draws each pack's die in turn and copies the frame
 * across, so a long list of packs costs a single rendering context. The dice
 * are built by a hidden dice engine, the same way the table builds them.
 */
export class DicePackPreviews {
  private static instances = new WeakMap<App, DicePackPreviews>();

  static forApp(app: App): DicePackPreviews {
    let instance = this.instances.get(app);
    if (!instance) {
      instance = new DicePackPreviews(app);
      this.instances.set(app, instance);
    }
    return instance;
  }

  private readonly previews = new Map<HTMLCanvasElement, Preview>();
  private renderer: THREE.WebGLRenderer | null = null;
  private engine: DiceEngine | null = null;
  private engineHost: HTMLElement | null = null;
  private readonly scene = new THREE.Scene();
  private readonly camera = new THREE.PerspectiveCamera(30, 1, 0.1, 100);
  private frame: number | null = null;
  /** The engine holds one pack at a time, so dice are built one after another. */
  private building: Promise<void> = Promise.resolve();

  private constructor(private readonly app: App) {
    this.camera.position.set(0, 0, 5.2);
    this.camera.lookAt(0, 0, 0);
    this.scene.add(new THREE.AmbientLight(0xffffff, 0.7));
    const key = new THREE.DirectionalLight(0xffffff, 2.2);
    key.position.set(2, 4, 5);
    this.scene.add(key);
  }

  /** Shows the d20 of the pack at `root` on `canvas`, until released. */
  attach(canvas: HTMLCanvasElement, root: string): void {
    this.release(canvas);
    canvas.width = PREVIEW_PIXELS;
    canvas.height = PREVIEW_PIXELS;
    const preview: Preview = { canvas, mesh: null, builtAt: 0 };
    this.previews.set(canvas, preview);

    this.building = this.building.then(async () => {
      const loaded = await loadDicePack(this.app, root);
      if (this.previews.get(canvas) !== preview) return;
      const engine = this.ensureEngine();
      engine.setPack(loaded?.pack ?? {});
      engine.setPackTextures(loaded?.textures ?? {}, loaded?.normals ?? {});
      const mesh = engine.createDieMesh('d20');
      fitToView(mesh);
      const twenty = engine.faceNormalOf('d20', 20);
      if (twenty) mesh.quaternion.setFromUnitVectors(twenty.normalize(), TOWARD_CAMERA).premultiply(TILT);
      preview.mesh = mesh;
      preview.builtAt = performance.now();
      this.start();
    }).catch((error: unknown) => console.error('[Atlas dice packs] Preview failed:', error));
  }

  release(canvas: HTMLCanvasElement): void {
    const preview = this.previews.get(canvas);
    if (!preview) return;
    this.previews.delete(canvas);
    if (preview.mesh) disposeMesh(preview.mesh);
    if (this.previews.size === 0) this.stop();
  }

  private ensureEngine(): DiceEngine {
    if (this.engine) return this.engine;
    // Kept small and out of sight: the engine sizes its own canvas to it and never draws.
    this.engineHost = document.body.createDiv();
    this.engineHost.setCssStyles({ position: 'fixed', left: '-10000px', top: '0', width: '64px', height: '64px', visibility: 'hidden' });
    this.engine = new DiceEngine(this.engineHost, createDiceSettings());
    // It only builds dice here; nothing on it moves or listens.
    this.engine.isViewActive = false;
    return this.engine;
  }

  private ensureRenderer(): THREE.WebGLRenderer {
    if (this.renderer) return this.renderer;
    this.renderer = new THREE.WebGLRenderer({ alpha: true, antialias: true });
    this.renderer.setPixelRatio(1);
    this.renderer.setSize(PREVIEW_PIXELS, PREVIEW_PIXELS, false);
    this.renderer.setClearColor(0x000000, 0);
    return this.renderer;
  }

  private start(): void {
    if (this.frame !== null) return;
    this.frame = window.requestAnimationFrame(this.tick);
  }

  private stop(): void {
    if (this.frame !== null) window.cancelAnimationFrame(this.frame);
    this.frame = null;
    // Nothing to show: give the contexts back until a card asks again.
    this.renderer?.dispose();
    this.renderer?.forceContextLoss();
    this.renderer = null;
    this.engine?.destroy();
    this.engine = null;
    this.engineHost?.remove();
    this.engineHost = null;
  }

  private readonly tick = (now: number): void => {
    this.frame = null;
    let drawing = false;
    const renderer = this.ensureRenderer();

    for (const preview of this.previews.values()) {
      const { mesh, canvas } = preview;
      if (!mesh) {
        drawing = true; // still being built
        continue;
      }
      if (now - preview.builtAt > DRAW_FOR_MS || !canvas.isConnected) continue;
      drawing = true;

      this.scene.add(mesh);
      renderer.render(this.scene, this.camera);
      this.scene.remove(mesh);

      const context = canvas.getContext('2d');
      if (!context) continue;
      context.clearRect(0, 0, canvas.width, canvas.height);
      context.drawImage(renderer.domElement, 0, 0, canvas.width, canvas.height);
    }

    if (drawing) this.frame = window.requestAnimationFrame(this.tick);
  };
}

/** Scales a die so it fills the preview whatever size its pack gives it. */
function fitToView(mesh: THREE.Mesh): void {
  mesh.geometry.computeBoundingSphere();
  const radius = mesh.geometry.boundingSphere?.radius || 1;
  mesh.scale.setScalar(1.25 / radius);
}

function disposeMesh(mesh: THREE.Mesh): void {
  mesh.geometry.dispose();
  const materials = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
  for (const material of materials) {
    for (const value of Object.values(material)) {
      if (value instanceof THREE.Texture) value.dispose();
    }
    material.dispose();
  }
}
