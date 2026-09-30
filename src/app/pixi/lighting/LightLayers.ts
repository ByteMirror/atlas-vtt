import type { Container, Matrix } from 'pixi.js';
import type { WallSegment } from '../../types/wallTypes';
import type { UnitScale } from '../../lighting/lightingUnits';
import { lightReach, type LightReach } from '../../vision/sight';
import { LightFlicker } from './lightFlicker';
import { LightLayer } from './LightLayer';
import { LIGHT_EDGE, type LightFrame } from './lightShaders';
import { BOUNCE_REACH, bounceFrame, lightFrame, type ActiveLight } from './lightSources';
import { shadowCasters } from './shadowGeometry';

/** Casters are gathered a little past the glow so radius flicker never outgrows them. */
const CASTER_MARGIN = 1.05;

interface Entry {
  layer: LightLayer;
  /** The same light bounced off its surroundings (see `bounceFrame`). */
  bounce: LightLayer;
  light: ActiveLight;
  reach: LightReach;
}

/** Two `LightLayer`s per active light (direct and bounced), rebuilt only for lights that moved or changed. */
export class LightLayers {
  private readonly entries = new Map<string, Entry>();
  private readonly flicker = new LightFlicker();
  private walls: readonly WallSegment[] = [];
  private scale: UnitScale | null = null;

  constructor(private readonly parent: Container) {}

  sync(lights: readonly ActiveLight[], walls: readonly WallSegment[], scale: UnitScale): void {
    const rebuildAll = walls !== this.walls || !sameScale(scale, this.scale);
    this.walls = walls;
    this.scale = scale;
    const keys = new Set(lights.map((light) => light.key));
    for (const [key, entry] of this.entries) {
      if (keys.has(key)) continue;
      entry.layer.destroy();
      entry.bounce.destroy();
      this.flicker.forget(key);
      this.entries.delete(key);
    }
    for (const light of lights) {
      const entry = this.entries.get(light.key);
      if (entry && !rebuildAll && entry.light === light) continue;
      if (entry && !rebuildAll && sameLight(entry.light, light)) {
        entry.light = light;
        continue;
      }
      // The bounce layer goes in first, so direct light draws over it.
      const bounce = entry?.bounce ?? this.createLayer();
      const layer = entry?.layer ?? this.createLayer();
      const frame = lightFrame(light, scale);
      const casters = shadowCasters(walls, light, frame.dim * BOUNCE_REACH * LIGHT_EDGE * CASTER_MARGIN);
      this.draw({ layer, bounce }, frame, casters);
      this.entries.set(light.key, { layer, bounce, light, reach: lightReach({ x: light.x, y: light.y }, frame.dim, walls) });
    }
  }

  /** Where each light reaches, for deciding on the CPU what is lit. */
  reaches(): LightReach[] {
    return [...this.entries.values()].map((entry) => entry.reach);
  }

  hasAnimation(): boolean {
    return [...this.entries.values()].some((entry) => entry.light.emission.animation !== 'none');
  }

  /** Shadow edges blur `pixels` wide on screen, for the camera `worldToScreen` of the frame being rendered. */
  setEdge(pixels: number, worldToScreen: Matrix): void {
    for (const entry of this.entries.values()) {
      entry.layer.setEdge(pixels, worldToScreen);
      entry.bounce.setEdge(pixels, worldToScreen);
    }
  }

  /** Advances every animated light to `timeMs`; only uniforms change. */
  animate(timeMs: number): void {
    if (!this.scale) return;
    for (const entry of this.entries.values()) {
      const { animation } = entry.light.emission;
      if (animation === 'none') continue;
      this.draw(entry, lightFrame(entry.light, this.scale, this.flicker.sample(entry.light.key, animation, timeMs)), null);
    }
  }

  destroy(): void {
    for (const entry of this.entries.values()) {
      entry.layer.destroy();
      entry.bounce.destroy();
    }
    this.entries.clear();
  }

  private draw(entry: Pick<Entry, 'layer' | 'bounce'>, frame: LightFrame, casters: readonly WallSegment[] | null): void {
    entry.layer.update(frame, casters);
    entry.bounce.update(bounceFrame(frame), casters);
  }

  private createLayer(): LightLayer {
    const layer = new LightLayer();
    this.parent.addChild(layer.view);
    return layer;
  }
}

function sameScale(a: UnitScale, b: UnitScale | null): boolean {
  return !!b && a.unitDistance === b.unitDistance && a.cellSize === b.cellSize;
}

function sameLight(a: ActiveLight, b: ActiveLight): boolean {
  return a.x === b.x && a.y === b.y && a.emission === b.emission;
}
