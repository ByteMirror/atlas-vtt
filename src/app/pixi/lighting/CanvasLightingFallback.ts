import { Graphics } from 'pixi.js';
import type { Viewport } from 'pixi-viewport';
import type { ViewAtlasState, ViewAtlasStore } from '../../storeFactory';
import type { MeasurementSettings } from '../../grid/measurementFormat';
import { unitScaleOf } from '../../lighting/lightingUnits';
import { sealedWalls } from '../../lighting/sealWalls';
import { worldTexel } from '../../lighting/lightingConstants';
import { SEES_ALL, SightCache, computeSight, sightSources, type LightReach, type Sight } from '../../vision/sight';
import { wallList } from '../../vision/wallList';
import type { MapBounds } from '../../vision/visibility';
import type { HideableLayer } from '../playerSafeFrame';
import { destroyTree } from '../utils/destroyTree';
import { LIGHTING_Z_INDEX } from './LightingRenderer';
import { PlayerView } from './PlayerView';
import type { SceneLightingView } from './sceneLightingView';

export interface CanvasLightingDeps {
  viewport: Viewport;
  store: ViewAtlasStore;
  measurement: () => MeasurementSettings;
  bounds: () => MapBounds | null;
}

/**
 * Scene lighting without WebGL, which has no shaders: players still see nothing their tokens
 * cannot see (the map is black outside line of sight), but there is no light, shadow or
 * explored memory, and everything in sight counts as lit. The GM's canvas is unchanged.
 */
// ponytail: overlapping sight polygons are cut as separate holes; earcut may darken their overlap. Union them if that shows.
export class CanvasLightingFallback implements SceneLightingView {
  readonly modeLayer: HideableLayer;
  private readonly darkness = new Graphics();
  private readonly cache = new SightCache();
  private sight: Sight = SEES_ALL;
  private readonly playerView = new PlayerView((active) => { this.darkness.visible = active; });
  private readonly unsubscribe: () => void;

  constructor(private readonly deps: CanvasLightingDeps) {
    this.darkness.zIndex = LIGHTING_Z_INDEX;
    this.darkness.eventMode = 'none';
    deps.viewport.addChild(this.darkness);
    this.modeLayer = this.playerView;
    this.unsubscribe = deps.store.subscribe((state) => this.update(state));
    this.update(deps.store.getState());
  }

  isEnabled(): boolean { return this.deps.store.getState().lighting.enabled; }
  setPreview(on: boolean): void { this.playerView.setPreview(on); }
  currentSight(): Sight { return this.sight; }
  lightReaches(): LightReach[] { return []; }
  ambient(): number { return 1; }
  refreshBounds(): void { this.update(this.deps.store.getState()); }
  resetExplored(): void { /* The fallback keeps no explored memory. */ }
  beforeMapUnload(): void { /* Nothing is pending in the fallback. */ }

  private update(state: ViewAtlasState): void {
    const bounds = this.deps.bounds();
    if (!state.lighting.enabled || !bounds) {
      this.darkness.clear();
      return;
    }
    const scale = unitScaleOf(this.deps.measurement(), state.grid);
    this.sight = computeSight(sightSources(state.objects.tokens, scale, bounds), sealedWalls(wallList(state.objects.walls), worldTexel(bounds)), this.cache);
    const g = this.darkness;
    g.clear();
    if (this.sight.all) return;
    g.rect(0, 0, bounds.width, bounds.height).fill({ color: 0x000000 });
    for (const polygon of this.sight.polygons) {
      if (polygon.length >= 3) g.poly(polygon.flatMap((p) => [p.x, p.y])).cut();
    }
    this.darkness.visible = this.playerView.active;
  }

  destroy(): void {
    this.unsubscribe();
    destroyTree(this.darkness);
  }
}
