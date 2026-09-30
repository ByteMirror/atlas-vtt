import type { Renderer, RenderTexture } from 'pixi.js';
import type { WallSegment } from '../../../types/wallTypes';
import { LIGHT_REACH, TILE_MARGIN, wallRadius } from '../../../lighting/lightingConstants';
import { placeLight } from '../../../lighting/lightPlacement';
import { segOf, splitBlocking, type Rect } from '../../../lighting/segments';
import { blocksFrom } from '../../../vision/visibility';
import { CapsuleField } from './CapsuleField';
import { TileTracer } from './TileTracer';
import type { EngineLight } from './types';

/** A light's traced visibility, at the spot it was placed. */
export interface Tile {
  x: number;
  y: number;
  flame: number;
  rect: Rect;
  texture: RenderTexture;
}

interface Entry {
  light: EngineLight;
  tile: Tile | null;
}

/**
 * One visibility tile per light, rebuilt only when the light moves, grows or changes its flame,
 * or when walls change within its tile.
 */
// ponytail: no memory budget; every active light keeps its tile (~1 MB for a 40 ft torch). Evict tiles of lights far off-screen if large scenes run out of GPU memory.
export class TileCache {
  private readonly tracer: TileTracer;
  private readonly entries = new Map<string, Entry>();

  constructor(private readonly renderer: Renderer, private readonly field: CapsuleField) {
    this.tracer = new TileTracer(renderer, field);
  }

  tiles(): ReadonlyMap<string, Tile> {
    const out = new Map<string, Tile>();
    for (const [key, entry] of this.entries) if (entry.tile) out.set(key, entry.tile);
    return out;
  }

  /** Brings tiles up to date; true when any was built or dropped. */
  sync(lights: readonly EngineLight[], walls: readonly WallSegment[], changed: readonly Rect[] | 'all'): boolean {
    let dirty = false;
    const keys = new Set(lights.map((light) => light.key));
    for (const [key, entry] of this.entries) {
      if (keys.has(key)) continue;
      entry.tile?.texture.destroy(true);
      this.entries.delete(key);
      dirty = true;
    }
    const blocking = splitBlocking(walls);
    for (const light of lights) {
      const entry = this.entries.get(light.key);
      if (entry && sameShape(entry.light, light) && !touches(entry.tile, changed)) {
        entry.light = light;
        continue;
      }
      entry?.tile?.texture.destroy(true);
      this.entries.set(light.key, { light, tile: this.build(light, blocking) });
      dirty = true;
    }
    return dirty;
  }

  private build(light: EngineLight, { twoWay, oneWay }: ReturnType<typeof splitBlocking>): Tile | null {
    const { texel } = this.field;
    const placed = placeLight(light.x, light.y, light.flame, [...twoWay, ...oneWay.map(segOf)], texel);
    if (!placed) return null;
    const half = light.dim * LIGHT_REACH * TILE_MARGIN;
    const x0 = Math.floor((placed.x - half) / texel) * texel, y0 = Math.floor((placed.y - half) / texel) * texel;
    const x1 = Math.ceil((placed.x + half) / texel) * texel, y1 = Math.ceil((placed.y + half) / texel) * texel;
    const rect: Rect = [x0, y0, x1 - x0, y1 - y0];
    const blockingOneWay = oneWay.filter((wall) => blocksFrom(wall, placed));
    let oneWayField: CapsuleField | null = null;
    if (blockingOneWay.length > 0) {
      oneWayField = new CapsuleField(this.renderer, rect, texel, wallRadius(texel), 'uOneWay');
      oneWayField.build(blockingOneWay.map(segOf));
    }
    const texture = this.tracer.trace([placed.x, placed.y], placed.flame, rect, oneWayField);
    oneWayField?.destroy();
    return { x: placed.x, y: placed.y, flame: placed.flame, rect, texture };
  }

  destroy(): void {
    for (const entry of this.entries.values()) entry.tile?.texture.destroy(true);
    this.entries.clear();
    this.tracer.destroy();
  }
}

function sameShape(a: EngineLight, b: EngineLight): boolean {
  return a.x === b.x && a.y === b.y && a.dim === b.dim && a.flame === b.flame;
}

function touches(tile: Tile | null, changed: readonly Rect[] | 'all'): boolean {
  if (changed === 'all') return true;
  if (!tile) return changed.length > 0;
  const [x, y, w, h] = tile.rect;
  return changed.some(([cx, cy, cw, ch]) => cx <= x + w && cx + cw >= x && cy <= y + h && cy + ch >= y);
}
