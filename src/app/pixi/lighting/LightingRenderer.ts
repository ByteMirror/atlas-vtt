import { Matrix, type Application, type Container, type Texture } from 'pixi.js';
import type { Viewport } from 'pixi-viewport';
import type { ViewAtlasState, ViewAtlasStore } from '../../storeFactory';
import type { MeasurementSettings } from '../../grid/measurementFormat';
import { unitScaleOf } from '../../lighting/lightingUnits';
import { sealedWalls } from '../../lighting/sealWalls';
import { worldTexel } from '../../lighting/lightingConstants';
import { sceneLook, type SceneLook } from '../../lighting/sceneLightingOptions';
import type { SceneLighting } from '../../types/lightingTypes';
import { SEES_ALL, SightCache, ambientLights, sceneSight, sightSources, type AmbientLight, type LightReach, type Sight } from '../../vision/sight';
import { wallList } from '../../vision/wallList';
import { exploredShapes } from '../../vision/exploredShapes';
import type { MapBounds } from '../../vision/visibility';
import type { HideableLayer } from '../playerSafeFrame';
import { requestRender } from '../RenderScheduler';
import { LightingEngine } from './engine/LightingEngine';
import type { EngineScene } from './engine/types';
import { ExploredTexture } from './ExploredTexture';
import { saveExploredMask } from './exploredMaskSaving';
import { LightReaches } from './lightReaches';
import { activeLights, engineLight } from './lightSources';
import { PlayerView } from './PlayerView';
import { ExploredSaveScheduler } from './ExploredSaveScheduler';
import type { SceneLightingView } from './sceneLightingView';

/** Above tokens, below their nameplates and bars (100): the GM keeps readable labels in the dark. */
export const LIGHTING_Z_INDEX = 90;
const EXPLORED_SAVE_DELAY = 2000;
const DEFAULT_CELL_SIZE = 70;

export interface LightingRendererDeps {
  viewport: Viewport;
  app: Application;
  store: ViewAtlasStore;
  measurement: () => MeasurementSettings;
  /** Size of the map image in world pixels, or null before it loaded. */
  bounds: () => MapBounds | null;
  /** The map image, covering world `[0, width] × [0, height]`; bounce reads its colours. */
  albedo: () => Texture | null;
}

type Watched = Pick<ViewAtlasState, 'objects' | 'lighting' | 'grid' | 'exploredMask'>;
type SceneWithoutLook = Omit<EngineScene, keyof SceneLook>;

/**
 * Scene lighting for one map view: feeds the store's walls, lights and vision tokens to the
 * `LightingEngine`, which lights the scene beneath its layer, hides what no token sees in the
 * player view and ghosts it for the GM. Explored memory lives in a world-space texture; with the
 * scene's explored memory off it records nothing but keeps (and saves) what it holds.
 */
export class LightingRenderer implements SceneLightingView {
  readonly layer: Container;
  /** Flipped by the player-frame capture: visible means the player's view. */
  readonly modeLayer: HideableLayer;
  private readonly engine: LightingEngine;
  private readonly sightCache = new SightCache();
  private readonly lightReachCache = new LightReaches();
  private reaches: LightReach[] = [];
  private explored: ExploredTexture | null = null;
  private exploredBounds: MapBounds | null = null;
  private sight: Sight = SEES_ALL;
  private previous: Watched | null = null;
  /** The last scene without its look (`SceneLook`), reused while only the look changes. */
  private lastScene: SceneWithoutLook | null = null;
  /** The mask the texture holds; undefined after a failed load, so that the next update retries. */
  private loadedMask: string | null | undefined = null;
  /** Bumped whenever the texture's content is superseded, so a load decoded too late is dropped. */
  private loadGeneration = 0;
  /** False while a saved mask is on its way in, or failed to load: the texture is not the memory then. */
  private exploredReady = true;
  private contextLost = false;
  private readonly onContextLost = (): void => {
    this.contextLost = true;
    this.exploredSaver.cancel();
  };
  private readonly exploredSaver: ExploredSaveScheduler;
  private readonly playerView = new PlayerView((active) => this.engine.setMode(active ? 'player' : 'gm'));
  private readonly unsubscribe: () => void;
  private readonly tick = (): void => this.animate();

  constructor(private readonly deps: LightingRendererDeps) {
    this.engine = new LightingEngine(deps.app.renderer, () => this.afterContextRestored());
    this.layer = this.engine.layer;
    this.exploredSaver = new ExploredSaveScheduler(() => deps.store.getState().mapPath, () => this.saveExplored(), EXPLORED_SAVE_DELAY);
    deps.app.renderer.canvas.addEventListener('webglcontextlost', this.onContextLost);
    this.layer.zIndex = LIGHTING_Z_INDEX;
    this.layer.onRender = (): void => this.syncScreenTransform();
    deps.viewport.addChild(this.layer);
    this.modeLayer = this.playerView;
    this.unsubscribe = deps.store.subscribe((state) => this.update(state));
    deps.app.ticker.add(this.tick);
    this.update(deps.store.getState());
  }

  /** Shows the GM exactly what the players see. */
  setPreview(on: boolean): void {
    this.playerView.setPreview(on);
    requestRender(this.deps.app);
  }

  isEnabled(): boolean {
    return this.deps.store.getState().lighting.enabled;
  }

  currentSight(): Sight { return this.sight; }
  lightReaches(): LightReach[] { return this.reaches; }
  ambientLight(): AmbientLight { return this.deps.store.getState().lighting; }

  /** The map image changed size or finished loading. */
  refreshBounds(): void {
    this.previous = null;
    this.update(this.deps.store.getState());
  }

  resetExplored(): void {
    this.explored?.clear();
    this.loadedMask = null;
    this.loadGeneration++;
    this.exploredReady = true;
    this.deps.store.getState().setExploredMask(null);
    requestRender(this.deps.app);
  }

  private update(state: ViewAtlasState): void {
    const { lighting } = state;
    const bounds = lighting.enabled ? this.deps.bounds() : null;
    this.engine.setEnabled(!!bounds);
    if (!bounds) {
      // Nothing is drawn while off; the next update after switching on rebuilds everything.
      this.previous = null;
      return;
    }
    const prev = this.previous;
    this.previous = { objects: state.objects, lighting, grid: state.grid, exploredMask: state.exploredMask };
    this.ensureExplored(bounds);
    if (state.exploredMask !== this.loadedMask) void this.loadExplored(state.exploredMask);

    const { walls, lights, tokens } = state.objects;
    const moved = !prev || prev.objects.walls !== walls || prev.objects.lights !== lights
      || prev.objects.tokens !== tokens || prev.grid !== state.grid || sightOptionsChanged(prev.lighting, lighting);
    const base = moved || !this.lastScene ? (this.lastScene = this.buildScene(state, bounds)) : this.lastScene;
    this.engine.update({ ...base, ...sceneLook(lighting) });
    requestRender(this.deps.app);
  }

  /** Recomputes lights, their reaches and sight with sealed walls, and records what tokens now see. */
  private buildScene(state: ViewAtlasState, bounds: MapBounds): SceneWithoutLook {
    const scale = unitScaleOf(this.deps.measurement(), state.grid);
    const walls = sealedWalls(wallList(state.objects.walls), worldTexel(bounds));
    const lights = activeLights(state.objects.lights, state.objects.tokens).map((light) => engineLight(light, scale));
    this.reaches = this.lightReachCache.sync(lights, walls);
    this.sight = sceneSight(state.lighting, sightSources(state.objects.tokens, scale, bounds), walls, this.sightCache);
    this.recordExplored(state.lighting);
    return {
      bounds,
      albedo: this.deps.albedo(),
      walls,
      lights,
      sight: this.sight,
      sightRadius: (state.grid?.size ?? DEFAULT_CELL_SIZE) * 0.5,
    };
  }

  private recordExplored(lighting: SceneLighting): void {
    const shapes = exploredShapes(this.sight, lighting, this.reaches);
    if (!shapes || !this.explored) return;
    this.explored.add(shapes);
    this.exploredSaver.schedule();
  }

  /** The engine holds the explored texture: it takes the new one before the old one is destroyed. */
  private ensureExplored(bounds: MapBounds): void {
    if (this.explored && this.exploredBounds?.width === bounds.width && this.exploredBounds.height === bounds.height) return;
    const previous = this.explored;
    this.explored = new ExploredTexture(this.deps.app.renderer, bounds);
    this.exploredBounds = bounds;
    this.loadedMask = null;
    this.loadGeneration++;
    this.exploredReady = true;
    this.engine.setExplored(this.explored.texture);
    previous?.destroy();
  }

  /**
   * The GPU reset: the explored texture came back blank, with lighting on or off, so reload the
   * saved memory now. A save pending from before holds only what the lost texture had, and
   * saves wait for the reload (`saveExplored`), so a blank texture never replaces the saved mask.
   */
  private afterContextRestored(): void {
    this.contextLost = false;
    this.exploredSaver.cancel();
    this.loadedMask = null;
    const state = this.deps.store.getState();
    void this.loadExplored(state.exploredMask);
    this.update(state);
  }

  /**
   * Each load supersedes the ones before it (a map switch or reset mid-decode must not draw the
   * old scene's memory), and the texture is unsaveable until its mask is in.
   */
  private async loadExplored(mask: string | null): Promise<void> {
    const generation = ++this.loadGeneration;
    const explored = this.explored;
    this.loadedMask = mask;
    if (!explored) return;
    if (!mask) {
      explored.clear();
      this.exploredReady = true;
      requestRender(this.deps.app);
      return;
    }
    this.exploredReady = false;
    try {
      const image = await explored.decode(mask);
      if (generation !== this.loadGeneration) {
        image.destroy(true);
        return;
      }
      explored.draw(image);
      this.exploredReady = true;
      requestRender(this.deps.app);
    } catch (error) {
      if (generation === this.loadGeneration) this.loadedMask = undefined;
      console.error('Atlas: could not load the explored areas of this scene', error);
    }
  }

  private saveExplored(): void {
    if (!this.explored || !this.exploredReady || this.contextLost) return;
    this.loadedMask = saveExploredMask(this.explored.toCanvas());
    this.deps.store.getState().setExploredMask(this.loadedMask);
  }

  /** Before the map unloads: save the scene's pending memory into it, then start the next scene blank. */
  beforeMapUnload(): void {
    this.exploredSaver.flush();
    this.explored?.clear();
    this.loadedMask = null;
    this.loadGeneration++;
    this.exploredReady = true;
    this.previous = null;
  }

  /** The composite maps screen pixels to the world with the camera of the frame being rendered. */
  private syncScreenTransform(): void {
    const { viewport } = this.deps;
    const worldToScreen = new Matrix(viewport.scale.x, 0, 0, viewport.scale.y, viewport.x, viewport.y);
    this.engine.setView(worldToScreen.invert(), viewport.scale.x);
  }

  private animate(): void {
    if (!this.layer.visible || !this.engine.busy()) return;
    // ponytail: animated lights redraw the whole light map even while off-screen; cull to the viewport if that gets slow.
    if (this.engine.animate(performance.now())) requestRender(this.deps.app);
  }

  destroy(): void {
    this.unsubscribe();
    this.deps.app.ticker.remove(this.tick);
    this.exploredSaver.cancel();
    this.loadGeneration++;
    this.deps.app.renderer.canvas.removeEventListener('webglcontextlost', this.onContextLost);
    this.engine.destroy();
    this.explored?.destroy();
  }
}

/**
 * Changes to what tokens see or what explored memory records, so the scene is rebuilt: the
 * options, and the ambient light crossing the lit threshold (choosing "Day" records at once).
 */
function sightOptionsChanged(a: SceneLighting, b: SceneLighting): boolean {
  return a.tokenVision !== b.tokenVision || a.exploredMemory !== b.exploredMemory || a.litThreshold !== b.litThreshold
    || ambientLights(a) !== ambientLights(b);
}
