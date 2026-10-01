import type { Renderer, Texture } from 'pixi.js';
import type { WallSegment } from '../../../types/wallTypes';
import { BOUNCE, FLICKER_INTERVAL_MS, LIGHT_REACH, tileWallReach, wallRadius, worldTexel } from '../../../lighting/lightingConstants';
import { changedWallRects } from '../../../lighting/wallChanges';
import { allSegments, splitBlocking, type Rect } from '../../../lighting/segments';
import type { MapBounds } from '../../../vision/visibility';
import { LightFlicker, STEADY, type FlickerSample } from '../lightFlicker';
import { CapsuleField } from './CapsuleField';
import { LightMap, type DrawnLight } from './LightMap';
import { RadianceCascades } from './RadianceCascades';
import { TileCache } from './TileCache';
import type { EngineLight } from './types';

/**
 * Everything the lighting keeps in world space for one map: the wall field, each light's tile,
 * the light map and the bounce. Independent of any camera; rebuilt only for what changed.
 */
export class LightingWorld {
  readonly texel: number;
  readonly wallRadius: number;
  /** Two-way walls: what every light's tile is traced through. */
  readonly field: CapsuleField;
  readonly lightMap: LightMap;
  readonly cascades: RadianceCascades;
  /**
   * Two-way and one-way walls, created with the first one-way wall and then kept (idle while
   * there are none), so the composite never holds a destroyed field.
   */
  private allField: CapsuleField | null = null;
  private hasOneWay = false;
  private readonly tiles: TileCache;
  private readonly flicker = new LightFlicker();
  private walls: readonly WallSegment[] | null = null;
  private lights: readonly EngineLight[] = [];
  private albedo: Texture | null = null;
  private bounceDirty = false;
  private lastBounce = -Infinity;
  /** When the light map last took its flicker; -Infinity while it holds the steady lights. */
  private lastFlicker = -Infinity;

  constructor(private readonly renderer: Renderer, readonly bounds: MapBounds) {
    this.texel = worldTexel(bounds);
    this.wallRadius = wallRadius(this.texel);
    this.field = this.createField();
    this.field.build([]);
    this.lightMap = new LightMap(renderer, bounds, this.texel);
    this.cascades = new RadianceCascades(renderer, bounds, this.field);
    this.tiles = new TileCache(renderer, this.field, bounds);
  }

  /** The field with one-way walls too, which bounce and sight treat as blocking both ways. */
  fieldAll(): CapsuleField {
    return this.hasOneWay ? this.allField! : this.field;
  }

  update(walls: readonly WallSegment[], lights: readonly EngineLight[], albedo: Texture | null): void {
    let changed: Rect[] | 'all' = [];
    if (walls !== this.walls) {
      changed = this.walls ? changedWallRects(this.walls, walls, tileWallReach(this.texel)) : 'all';
      this.walls = walls;
      if (changed === 'all' || changed.length > 0) {
        this.rebuildFields(walls);
        this.bounceDirty = true;
      }
    }
    const tilesChanged = this.tiles.sync(lights, walls, changed);
    const lightsChanged = !sameLights(this.lights, lights);
    if (lightsChanged) this.forgetRemoved(lights);
    this.lights = lights;
    if (tilesChanged || lightsChanged) {
      this.drawSteady();
      this.bounceDirty = true;
    }
    if (albedo !== this.albedo) {
      this.albedo = albedo;
      this.bounceDirty = true;
    }
  }

  /**
   * Throttled flicker and bounce; true when a world texture changed. A light map drawn steady
   * (a light moved, the bounce was built) takes its flicker back at once, so a dragged light
   * never blinks between the two.
   */
  animate(now: number): boolean {
    let drew = false;
    if (this.bounceDirty && now - this.lastBounce >= BOUNCE.throttleMs) {
      // Bounce uses steady intensity, so flicker never rebuilds it.
      this.drawSteady();
      this.cascades.build(this.lightMap, this.albedo, this.fieldAll());
      this.bounceDirty = false;
      this.lastBounce = now;
      drew = true;
    }
    if (this.animated() && now - this.lastFlicker >= FLICKER_INTERVAL_MS) {
      this.drawLightMap((light) => this.flicker.sample(light.key, light.animation, now));
      this.lastFlicker = now;
      drew = true;
    }
    return drew;
  }

  /** Animated lights or bounce still to build: keep calling `animate`. */
  busy(): boolean {
    return this.bounceDirty || this.animated();
  }

  /** Builds the bounce now (map load finished, tests). */
  flush(): void {
    this.lastBounce = -Infinity;
    this.animate(performance.now());
  }

  destroy(): void {
    this.tiles.destroy();
    this.cascades.destroy();
    this.lightMap.destroy();
    this.allField?.destroy();
    this.field.destroy();
  }

  private animated(): boolean {
    return this.lights.some((light) => light.animation !== 'none');
  }

  private createField(): CapsuleField {
    return new CapsuleField(this.renderer, [0, 0, this.bounds.width, this.bounds.height], this.texel, this.wallRadius);
  }

  private rebuildFields(walls: readonly WallSegment[]): void {
    const blocking = splitBlocking(walls);
    this.field.build(blocking.twoWay);
    this.hasOneWay = blocking.oneWay.length > 0;
    if (!this.hasOneWay) return;
    this.allField ??= this.createField();
    this.allField.build(allSegments(blocking));
  }

  private forgetRemoved(lights: readonly EngineLight[]): void {
    const keys = new Set(lights.map((light) => light.key));
    for (const light of this.lights) if (!keys.has(light.key)) this.flicker.forget(light.key);
  }

  private drawSteady(): void {
    this.drawLightMap(() => STEADY);
    this.lastFlicker = -Infinity;
  }

  private drawLightMap(sample: (light: EngineLight) => FlickerSample): void {
    const tiles = this.tiles.tiles();
    const drawn: DrawnLight[] = [];
    for (const light of this.lights) {
      const tile = tiles.get(light.key);
      if (!tile) continue;
      const { intensity, radiusScale } = sample(light);
      drawn.push({ tile, bright: light.bright * radiusScale, reach: light.dim * LIGHT_REACH * radiusScale, color: light.color, intensity: light.intensity * intensity });
    }
    this.lightMap.draw(drawn);
  }
}

function sameLights(a: readonly EngineLight[], b: readonly EngineLight[]): boolean {
  return a.length === b.length && a.every((x, i) => {
    const y = b[i]!;
    return x.key === y.key && x.x === y.x && x.y === y.y && x.bright === y.bright && x.dim === y.dim && x.flame === y.flame
      && x.intensity === y.intensity && x.animation === y.animation && x.color.every((c, j) => c === y.color[j]);
  });
}
