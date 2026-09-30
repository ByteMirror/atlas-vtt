import type { TokenEntity } from '../types';
import type { Point } from '../types/visionTypes';
import type { WallSegment } from '../types/wallTypes';
import { gameUnitsToWorld, type UnitScale } from '../lighting/lightingUnits';
import { computeVisibility, pointInPolygon, type MapBounds, type Polygon } from './visibility';

/** Light level at which a point counts as lit, so a token standing there can be seen. */
export const LIT_THRESHOLD = 0.25;

/** A token that sees, in world pixels. */
export interface SightSource {
  tokenId: string;
  origin: Point;
  range: number;
  /** 0 without darkvision. */
  darkvision: number;
}

/** What a viewer sees. `all` means no token has vision, so nothing is hidden by line of sight. */
export interface Sight {
  all: boolean;
  polygons: Polygon[];
  darkvision: Polygon[];
}

/** The area a light illuminates, for deciding on the CPU whether a point is lit. */
export interface LightReach {
  origin: Point;
  dim: number;
  polygon: Polygon;
}

/** Every token with vision on, with its ranges converted to world pixels. */
export function sightSources(tokens: Record<string, TokenEntity>, scale: UnitScale, bounds: MapBounds): SightSource[] {
  const unlimited = Math.hypot(bounds.width, bounds.height);
  const sources: SightSource[] = [];
  for (const token of Object.values(tokens)) {
    if (!token.vision?.enabled) continue;
    const { range, darkvision } = token.vision;
    sources.push({
      tokenId: token.id,
      origin: { x: token.x, y: token.y },
      range: range === undefined ? unlimited : gameUnitsToWorld(range, scale),
      darkvision: darkvision ? gameUnitsToWorld(darkvision, scale) : 0,
    });
  }
  return sources;
}

interface CachedSight {
  source: SightSource;
  walls: readonly WallSegment[];
  polygon: Polygon;
  darkvision: Polygon | null;
}

/** Keeps each token's polygons until the token or the walls change, so only moved tokens recompute. */
export class SightCache {
  private readonly entries = new Map<string, CachedSight>();

  get(source: SightSource, walls: readonly WallSegment[]): CachedSight {
    const cached = this.entries.get(source.tokenId);
    if (cached && cached.walls === walls && sameSource(cached.source, source)) return cached;
    const entry: CachedSight = {
      source,
      walls,
      polygon: computeVisibility(source.origin, source.range, walls),
      darkvision: source.darkvision > 0 ? computeVisibility(source.origin, Math.min(source.darkvision, source.range), walls) : null,
    };
    this.entries.set(source.tokenId, entry);
    return entry;
  }

  /** Drops tokens that no longer see. */
  retain(tokenIds: ReadonlySet<string>): void {
    for (const id of this.entries.keys()) if (!tokenIds.has(id)) this.entries.delete(id);
  }
}

function sameSource(a: SightSource, b: SightSource): boolean {
  return a.origin.x === b.origin.x && a.origin.y === b.origin.y && a.range === b.range && a.darkvision === b.darkvision;
}

export function computeSight(sources: readonly SightSource[], walls: readonly WallSegment[], cache: SightCache = new SightCache()): Sight {
  if (sources.length === 0) return { all: true, polygons: [], darkvision: [] };
  cache.retain(new Set(sources.map((source) => source.tokenId)));
  const entries = sources.map((source) => cache.get(source, walls));
  return {
    all: false,
    polygons: entries.map((entry) => entry.polygon),
    darkvision: entries.flatMap((entry) => (entry.darkvision ? [entry.darkvision] : [])),
  };
}

export function lightReach(origin: Point, dim: number, walls: readonly WallSegment[]): LightReach {
  return { origin, dim, polygon: computeVisibility(origin, dim, walls) };
}

function isLit(point: Point, ambient: number, lights: readonly LightReach[]): boolean {
  if (ambient >= LIT_THRESHOLD) return true;
  return lights.some((light) => Math.hypot(point.x - light.origin.x, point.y - light.origin.y) <= light.dim && pointInPolygon(point, light.polygon));
}

/** Whether a viewer can see `point`: in line of sight and lit, or within darkvision. */
export function isSeen(point: Point, sight: Sight, ambient: number, lights: readonly LightReach[]): boolean {
  if (!sight.all && !sight.polygons.some((polygon) => pointInPolygon(point, polygon))) return false;
  return isLit(point, ambient, lights) || sight.darkvision.some((polygon) => pointInPolygon(point, polygon));
}
