import type { Container } from 'pixi.js';
import type { WallSegment } from '../../types/wallTypes';
import type { UnitScale } from '../../lighting/lightingUnits';
import { lightReach, type LightReach } from '../../vision/sight';
import { LightFlicker } from './lightFlicker';
import { LightLayer } from './LightLayer';
import { LIGHT_EDGE } from './lightShaders';
import { lightFrame, type ActiveLight } from './lightSources';
import { shadowCasters } from './shadowGeometry';

/** Casters are gathered a little past the glow so radius flicker never outgrows them. */
const CASTER_MARGIN = 1.05;

interface Entry {
  layer: LightLayer;
  light: ActiveLight;
  reach: LightReach;
}

/** One `LightLayer` per active light, rebuilt only for lights that moved or changed. */
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
      const layer = entry?.layer ?? this.createLayer();
      const frame = lightFrame(light, scale);
      const casters = shadowCasters(walls, light, frame.dim * LIGHT_EDGE * CASTER_MARGIN);
      layer.update(frame, casters);
      this.entries.set(light.key, { layer, light, reach: lightReach({ x: light.x, y: light.y }, frame.dim, walls) });
    }
  }

  /** Where each light reaches, for deciding on the CPU what is lit. */
  reaches(): LightReach[] {
    return [...this.entries.values()].map((entry) => entry.reach);
  }

  hasAnimation(): boolean {
    return [...this.entries.values()].some((entry) => entry.light.emission.animation !== 'none');
  }

  /** Advances every animated light to `timeMs`; only uniforms change. */
  animate(timeMs: number): void {
    if (!this.scale) return;
    for (const entry of this.entries.values()) {
      const { animation } = entry.light.emission;
      if (animation === 'none') continue;
      entry.layer.update(lightFrame(entry.light, this.scale, this.flicker.sample(entry.light.key, animation, timeMs)), null);
    }
  }

  destroy(): void {
    for (const entry of this.entries.values()) entry.layer.destroy();
    this.entries.clear();
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
