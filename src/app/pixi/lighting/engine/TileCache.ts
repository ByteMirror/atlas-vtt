import type { Renderer, RenderTexture } from 'pixi.js';
import type { WallSegment } from '../../../types/wallTypes';
import { LIGHT_REACH, wallRadius } from '../../../lighting/lightingConstants';
import { placeLight } from '../../../lighting/lightPlacement';
import { segOf, solidSegments, splitBlocking, type BlockingWalls, type Rect } from '../../../lighting/segments';
import { blocksFrom, type MapBounds } from '../../../vision/visibility';
import { CapsuleField } from './CapsuleField';
import { LimitedTileMask } from './LimitedTileMask';
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
  /** What limited walls stop, which no trace can tell, is taken out of a finished tile. */
  private readonly limited: LimitedTileMask;
  private readonly entries = new Map<string, Entry>();

  /** Tiles never reach past the map (rounded up to the texel grid), however far a light shines. */
  constructor(private readonly renderer: Renderer, private readonly field: CapsuleField, private readonly bounds: MapBounds) {
    this.tracer = new TileTracer(renderer, field);
    this.limited = new LimitedTileMask(renderer, field.texel);
  }

  tiles(): ReadonlyMap<string, Tile> {
    const out = new Map<string, Tile>();
    for (const [key, entry] of this.entries) if (entry.tile) out.set(key, entry.tile);
    return out;
  }

  /** Brings tiles up to date; true when any was built or dropped. */
  sync(lights: readonly EngineLight[], walls: readonly WallSegment[], changed: readonly Rect[] | 'all'): boolean {
    let dirty = false;
    let built = false;
    const keys = new Set(lights.map((light) => light.key));
    for (const [key, entry] of this.entries) {
      if (keys.has(key)) continue;
      entry.tile?.texture.destroy(true);
      this.entries.delete(key);
      dirty = true;
    }
    const blocking = splitBlocking(walls, 'light');
    for (const light of lights) {
      const entry = this.entries.get(light.key);
      if (entry && sameShape(entry.light, light) && !touches(entry.tile, changed)) {
        entry.light = light;
        continue;
      }
      entry?.tile?.texture.destroy(true);
      this.entries.set(light.key, { light, tile: this.build(light, blocking, walls) });
      dirty = true;
      built = true;
    }
    // A light being dragged rebuilds its tile on every update: the tracer's raw targets are kept
    // until an update rebuilds nothing (allocating them per rebuild made each about 40% slower).
    if (!built) this.tracer.release();
    return dirty;
  }

  private build(light: EngineLight, blocking: BlockingWalls, walls: readonly WallSegment[]): Tile | null {
    const { texel } = this.field;
    const placed = placeLight(light.x, light.y, light.flame, solidSegments(blocking), texel);
    if (!placed) return null;
    const rect = this.tileRect(placed.x, placed.y, light.dim * LIGHT_REACH);
    if (!rect) return null;
    const blockingOneWay = blocking.oneWay.filter((wall) => blocksFrom(wall, placed, 'light'));
    let oneWayField: CapsuleField | null = null;
    if (blockingOneWay.length > 0) {
      oneWayField = new CapsuleField(this.renderer, rect, texel, wallRadius(texel), 'uOneWay');
      oneWayField.build(blockingOneWay.map(segOf));
    }
    const traced = this.tracer.trace([placed.x, placed.y], placed.flame, rect, oneWayField);
    oneWayField?.destroy();
    // The rule counts from where the light is, wherever a wall it stands in made the engine place it.
    const texture = blocking.limited.length > 0 ? this.limited.apply(traced, rect, { x: light.x, y: light.y }, walls) : traced;
    return { x: placed.x, y: placed.y, flame: placed.flame, rect, texture };
  }

  /** The square of half-size `half` around (x, y) on the texel grid, clipped to the map; null if empty. */
  private tileRect(x: number, y: number, half: number): Rect | null {
    const { texel } = this.field;
    const width = Math.ceil(this.bounds.width / texel) * texel, height = Math.ceil(this.bounds.height / texel) * texel;
    const x0 = Math.max(0, Math.floor((x - half) / texel) * texel), y0 = Math.max(0, Math.floor((y - half) / texel) * texel);
    const x1 = Math.min(width, Math.ceil((x + half) / texel) * texel), y1 = Math.min(height, Math.ceil((y + half) / texel) * texel);
    return x1 > x0 && y1 > y0 ? [x0, y0, x1 - x0, y1 - y0] : null;
  }

  destroy(): void {
    for (const entry of this.entries.values()) entry.tile?.texture.destroy(true);
    this.entries.clear();
    this.tracer.destroy();
    this.limited.destroy();
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
