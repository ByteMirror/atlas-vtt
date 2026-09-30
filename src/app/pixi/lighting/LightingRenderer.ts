import { Container, Matrix, Texture, type Application, type Renderer, type WebGLRenderer } from 'pixi.js';
import type { Viewport } from 'pixi-viewport';
import type { ViewAtlasState, ViewAtlasStore } from '../../storeFactory';
import type { MeasurementSettings } from '../../grid/measurementFormat';
import { unitScaleOf, type UnitScale } from '../../lighting/lightingUnits';
import { SEES_ALL, SightCache, computeSight, sightSources, type LightReach, type Sight } from '../../vision/sight';
import { wallList } from '../../vision/wallList';
import { exploredShapes } from '../../vision/exploredShapes';
import type { MapBounds } from '../../vision/visibility';
import type { HideableLayer } from '../playerSafeFrame';
import { requestRender } from '../RenderScheduler';
import { destroyTree } from '../utils/destroyTree';
import { createCompositeFilter, type CompositeFilter } from './compositeFilter';
import { ExploredTexture } from './ExploredTexture';
import { saveExploredMask } from './exploredMaskSaving';
import { LightLayers } from './LightLayers';
import { activeLights } from './lightSources';
import { SightLayer } from './SightLayer';
import type { SceneLightingView } from './sceneLightingView';

/** Above tokens, below their nameplates and bars (100): the GM keeps readable labels in the dark. */
export const LIGHTING_Z_INDEX = 90;
const EXPLORED_SAVE_DELAY = 2000;

export interface LightingRendererDeps {
  viewport: Viewport;
  app: Application;
  store: ViewAtlasStore;
  measurement: () => MeasurementSettings;
  /** Size of the map image in world pixels, or null before it loaded. */
  bounds: () => MapBounds | null;
}

type Watched = Pick<ViewAtlasState, 'objects' | 'lighting' | 'grid' | 'exploredMask'>;

/**
 * Scene lighting: lights (`LightLayers`) and the viewer's sight (`SightLayer`) are drawn into
 * one layer whose composite filter lights the scene beneath it, hides what no token sees in
 * the player view and ghosts it for the GM. Explored memory lives in a world-space texture.
 */
export class LightingRenderer implements SceneLightingView {
  readonly layer = new Container({ label: 'lighting' });
  /** Flipped by the player-frame capture: visible means the player's view. */
  readonly modeLayer: HideableLayer;
  private readonly composite: CompositeFilter;
  private readonly sightLayer = new SightLayer();
  private readonly lights = new LightLayers(this.layer);
  private readonly sightCache = new SightCache();
  private explored: ExploredTexture | null = null;
  private exploredBounds: MapBounds | null = null;
  private sight: Sight = SEES_ALL;
  private previous: Watched | null = null;
  private loadedMask: string | null = null;
  private saveTimer: number | null = null;
  private preview = false;
  private capturing = false;
  private readonly unsubscribe: () => void;
  private readonly tick = (): void => this.animate();

  constructor(private readonly deps: LightingRendererDeps) {
    this.composite = createCompositeFilter(Texture.EMPTY);
    this.layer.zIndex = LIGHTING_Z_INDEX;
    this.layer.eventMode = 'none';
    this.layer.filters = [this.composite.filter];
    this.layer.addChild(this.sightLayer.view);
    this.layer.onRender = (): void => this.syncScreenTransform();
    deps.viewport.addChild(this.layer);
    const isCapturing = (): boolean => this.capturing;
    const setCapturing = (player: boolean): void => {
      this.capturing = player;
      this.applyMode();
    };
    this.modeLayer = {
      get visible(): boolean { return isCapturing(); },
      set visible(player: boolean) { setCapturing(player); },
    };
    this.unsubscribe = deps.store.subscribe((state) => this.update(state));
    deps.app.ticker.add(this.tick);
    this.update(deps.store.getState());
  }

  /** Shows the GM exactly what the players see. */
  setPreview(on: boolean): void {
    this.preview = on;
    this.applyMode();
    requestRender(this.deps.app);
  }

  isEnabled(): boolean {
    return this.deps.store.getState().lighting.enabled;
  }

  currentSight(): Sight { return this.sight; }
  lightReaches(): LightReach[] { return this.lights.reaches(); }
  ambient(): number { return this.deps.store.getState().lighting.ambient; }

  /** The map image changed size or finished loading. */
  refreshBounds(): void {
    this.previous = null;
    this.update(this.deps.store.getState());
  }

  resetExplored(): void {
    this.explored?.clear();
    this.loadedMask = null;
    this.deps.store.getState().setExploredMask(null);
    requestRender(this.deps.app);
  }

  private update(state: ViewAtlasState): void {
    const { lighting } = state;
    const bounds = lighting.enabled ? this.deps.bounds() : null;
    this.layer.visible = !!bounds;
    setBackBuffer(this.deps.app.renderer, !!bounds);
    if (!bounds) {
      // Nothing is drawn while off; the next update after switching on rebuilds everything.
      this.previous = null;
      return;
    }
    const prev = this.previous;
    this.previous = { objects: state.objects, lighting, grid: state.grid, exploredMask: state.exploredMask };
    this.ensureExplored(bounds);
    if (state.exploredMask !== this.loadedMask) void this.loadExplored(state.exploredMask);

    const scale = unitScaleOf(this.deps.measurement(), state.grid);
    const { walls, lights, tokens } = state.objects;
    const moved = !prev || prev.objects.walls !== walls || prev.objects.lights !== lights || prev.objects.tokens !== tokens || prev.grid !== state.grid;
    if (moved) {
      this.lights.sync(activeLights(lights, tokens), wallList(walls), scale);
      this.updateSight(state, scale, bounds);
    }
    this.composite.setAmbient(lighting.ambient, lighting.ambientColor);
    requestRender(this.deps.app);
  }

  private updateSight(state: ViewAtlasState, scale: UnitScale, bounds: MapBounds): void {
    const sources = sightSources(state.objects.tokens, scale, bounds);
    this.sight = computeSight(sources, wallList(state.objects.walls), this.sightCache);
    this.sightLayer.draw(this.sight, bounds);
    this.composite.setAllSeen(this.sight.all);
    const shapes = exploredShapes(this.sight, state.lighting.ambient, this.lights.reaches());
    if (!shapes || !this.explored) return;
    this.explored.add(shapes);
    this.scheduleExploredSave();
  }

  private ensureExplored(bounds: MapBounds): void {
    if (this.explored && this.exploredBounds?.width === bounds.width && this.exploredBounds.height === bounds.height) return;
    this.explored?.destroy();
    this.explored = new ExploredTexture(this.deps.app.renderer, bounds);
    this.exploredBounds = bounds;
    this.loadedMask = null;
    this.composite.setExplored(this.explored.texture);
  }

  private async loadExplored(mask: string | null): Promise<void> {
    this.loadedMask = mask;
    if (!this.explored) return;
    if (mask) await this.explored.load(mask);
    else this.explored.clear();
    requestRender(this.deps.app);
  }

  private scheduleExploredSave(): void {
    if (this.saveTimer !== null) return;
    this.saveTimer = window.setTimeout(() => {
      this.saveTimer = null;
      if (!this.explored) return;
      this.loadedMask = saveExploredMask(this.explored.toCanvas());
      this.deps.store.getState().setExploredMask(this.loadedMask);
    }, EXPLORED_SAVE_DELAY);
  }

  private applyMode(): void {
    this.composite.setMode(this.capturing || this.preview ? 'player' : 'gm');
  }

  /** The composite maps screen pixels to the explored texture with the camera of the frame being rendered. */
  private syncScreenTransform(): void {
    const bounds = this.exploredBounds;
    if (!bounds) return;
    const { viewport } = this.deps;
    const worldToScreen = new Matrix(viewport.scale.x, 0, 0, viewport.scale.y, viewport.x, viewport.y);
    this.composite.setScreenToExplored(worldToScreen.invert().scale(1 / bounds.width, 1 / bounds.height));
  }

  private animate(): void {
    if (!this.layer.visible || !this.lights.hasAnimation()) return;
    // ponytail: animates every light while any is animated; cull to the viewport if many lights get slow.
    this.lights.animate(performance.now());
    requestRender(this.deps.app);
  }

  destroy(): void {
    this.unsubscribe();
    this.deps.app.ticker.remove(this.tick);
    if (this.saveTimer !== null) window.clearTimeout(this.saveTimer);
    setBackBuffer(this.deps.app.renderer, false);
    this.lights.destroy();
    this.sightLayer.destroy();
    this.explored?.destroy();
    this.composite.filter.destroy();
    destroyTree(this.layer);
  }
}

/** The composite reads the scene beneath it, which WebGL only offers through a back buffer. */
function setBackBuffer(renderer: Renderer, on: boolean): void {
  if (renderer.name !== 'webgl') return;
  (renderer as WebGLRenderer).backBuffer.useBackBuffer = on;
}
