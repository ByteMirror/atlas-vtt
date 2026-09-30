import { Container, Graphics, Matrix, Texture, type Renderer, type WebGLRenderer } from 'pixi.js';
import type { Sight } from '../../../vision/sight';
import { destroyTree } from '../../utils/destroyTree';
import type { CapsuleField } from './CapsuleField';
import { createCompositeFilter, type CompositeFilter, type LightingMode } from './compositeFilter';
import { LightingWorld } from './LightingWorld';
import { SightMeshes } from './SightMeshes';
import type { EngineScene } from './types';

/**
 * Scene lighting, independent of the store: world-space caches (`LightingWorld`), sight meshes
 * and a bounds rectangle in one layer, lit by the composite filter. The world exists only while
 * lighting is enabled, and is rebuilt from the last scene when the WebGL context is restored
 * (render textures come back blank); `onRestored` then asks the owner for a render.
 */
export class LightingEngine {
  readonly layer = new Container({ label: 'lighting' });
  private readonly boundsRect = new Graphics();
  private readonly sightMeshes = new SightMeshes();
  private world: LightingWorld | null = null;
  private composite: CompositeFilter | null = null;
  private boundField: CapsuleField | null = null;
  private explored: Texture = Texture.EMPTY;
  private mode: LightingMode = 'gm';
  private view = { screenToWorld: new Matrix(), zoom: 1 };
  private sight: Sight | null = null;
  private scene: EngineScene | null = null;
  private enabled = false;
  private ownsBackBuffer = false;
  private readonly contextListener = { contextChange: (): void => this.restore() };

  constructor(private readonly renderer: Renderer, private readonly onRestored: () => void = (): void => undefined) {
    this.layer.eventMode = 'none';
    this.layer.addChild(this.boundsRect, this.sightMeshes.view);
    renderer.runners.contextChange.add(this.contextListener);
  }

  /** Does nothing while disabled: the next update after `setEnabled(true)` builds everything. */
  update(scene: EngineScene): void {
    if (!this.enabled) return;
    this.scene = scene;
    const { bounds } = scene;
    if (!this.world || this.world.bounds.width !== bounds.width || this.world.bounds.height !== bounds.height) {
      this.replaceWorld(new LightingWorld(this.renderer, bounds));
    }
    const world = this.world!;
    const composite = this.composite!;
    world.update(scene.walls, scene.lights, scene.albedo);
    if (world.fieldAll() !== this.boundField) {
      this.boundField = world.fieldAll();
      composite.setWorld(world);
    }
    if (scene.sight !== this.sight) {
      this.sight = scene.sight;
      this.sightMeshes.draw(scene.sight, scene.sightRadius);
      composite.setAllSeen(scene.sight.all);
    }
    composite.setAmbient(scene.ambient, scene.ambientColor);
  }

  /**
   * The one switch for the back buffer: the composite reads the scene beneath it, and without
   * one WebGL skips the composite and the layer shows the map unlit. The engine's owner calls
   * this, so nothing else turns the back buffer on or off behind its back. Disabling frees the
   * world textures (100–270 MB on large maps).
   */
  setEnabled(on: boolean): void {
    this.enabled = on;
    this.layer.visible = on;
    setBackBuffer(this.renderer, on);
    this.ownsBackBuffer = on;
    if (!on) this.dropWorld();
  }

  animate(now: number): boolean {
    return this.world?.animate(now) ?? false;
  }

  busy(): boolean {
    return this.world?.busy() ?? false;
  }

  flush(): void {
    this.world?.flush();
  }

  setMode(mode: LightingMode): void {
    this.mode = mode;
    this.composite?.setMode(mode);
  }

  setView(screenToWorld: Matrix, zoom: number): void {
    this.view.screenToWorld.copyFrom(screenToWorld);
    this.view.zoom = zoom;
    this.composite?.setView(screenToWorld, zoom);
  }

  /** The caller owns `texture`; set its replacement before destroying it. */
  setExplored(texture: Texture): void {
    this.explored = texture;
    this.composite?.setExplored(texture);
  }

  destroy(): void {
    this.renderer.runners.contextChange.remove(this.contextListener);
    this.dropWorld();
    this.sightMeshes.destroy();
    destroyTree(this.layer);
    if (this.ownsBackBuffer) setBackBuffer(this.renderer, false);
  }

  /** A restored context keeps no render texture's pixels: rebuild the world from the last scene. */
  private restore(): void {
    const scene = this.scene;
    if (!this.world || !scene) return;
    this.dropWorld();
    this.update(scene);
    this.onRestored();
  }

  /** The composite goes with the world, so it never holds the world's destroyed textures. */
  private dropWorld(): void {
    this.layer.filters = null;
    this.composite?.filter.destroy();
    this.composite = null;
    this.boundField = null;
    this.world?.destroy();
    this.world = null;
    this.scene = null;
    this.sight = null;
  }

  /** The composite moves to the new world before the old one's textures are destroyed. */
  private replaceWorld(world: LightingWorld): void {
    const previous = this.world;
    this.world = world;
    this.boundField = world.fieldAll();
    if (this.composite) {
      this.composite.setWorld(world);
    } else {
      this.composite = createCompositeFilter(world, this.explored);
      this.composite.setMode(this.mode);
      this.composite.setView(this.view.screenToWorld, this.view.zoom);
      this.layer.filters = [this.composite.filter];
    }
    previous?.destroy();
    const { width, height } = world.bounds;
    // PIXI takes the filter area from the children's bounds: keep the whole map covered.
    this.boundsRect.clear().rect(0, 0, width, height).fill({ color: 0, alpha: 0 });
    this.sight = null;
  }
}

/** WebGL only offers the scene beneath a filter through a back buffer. */
function setBackBuffer(renderer: Renderer, on: boolean): void {
  if (renderer.name !== 'webgl') return;
  (renderer as WebGLRenderer).backBuffer.useBackBuffer = on;
}
