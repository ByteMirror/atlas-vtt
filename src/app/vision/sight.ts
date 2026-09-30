import type { TokenEntity } from '../types';
import type { SceneLighting } from '../types/lightingTypes';
import type { Point } from '../types/visionTypes';
import type { WallSegment } from '../types/wallTypes';
import { gameUnitsToWorld, type UnitScale } from '../lighting/lightingUnits';
import { litThresholdOf, tokenVisionOn } from '../lighting/sceneLightingOptions';
import { computeVisibility, pointInPolygon, type MapBounds, type Polygon } from './visibility';
import { visionCone, type VisionCone } from './visionCone';

/**
 * The scene's light without its sources: at or above `litThreshold` (unset: 0.25) ambient light,
 * every point in sight counts as lit, so a token standing there can be seen.
 */
export type AmbientLight = Pick<SceneLighting, 'ambient' | 'litThreshold'>;

/** A token that sees, in world pixels. */
export interface SightSource {
  tokenId: string;
  origin: Point;
  range: number;
  /** 0 without darkvision. */
  darkvision: number;
  /** Where the token looks; unset, it sees all around. Clips its sight and darkvision. */
  cone?: VisionCone;
  /** Radius within which it senses tokens through walls and darkness; unset without tremorsense. */
  tremorsense?: number;
}

/** Tokens within `radius` of `origin` are sensed, whatever lies between. */
export interface TremorSense {
  origin: Point;
  radius: number;
}

/** What a viewer sees. `all` means no token has vision, so nothing is hidden by line of sight. */
export interface Sight {
  all: boolean;
  polygons: Polygon[];
  /** Where each polygon is seen from, aligned with `polygons`. */
  origins: Point[];
  darkvision: Polygon[];
  darkvisionOrigins: Point[];
  /** Tremorsense of the vision tokens: reveals tokens only, never the map, light or explored memory. */
  tremors: TremorSense[];
}

/** Sight of a viewer without a vision token: line of sight hides nothing. */
export const SEES_ALL: Sight = { all: true, polygons: [], origins: [], darkvision: [], darkvisionOrigins: [], tremors: [] };

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
    const { range, darkvision, tremorsense, angle } = token.vision;
    const cone = visionCone(token.rotation, angle);
    sources.push({
      tokenId: token.id,
      origin: { x: token.x, y: token.y },
      range: range === undefined ? unlimited : gameUnitsToWorld(range, scale),
      darkvision: darkvision ? gameUnitsToWorld(darkvision, scale) : 0,
      ...(cone && { cone }),
      ...(tremorsense !== undefined && tremorsense > 0 && { tremorsense: gameUnitsToWorld(tremorsense, scale) }),
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
      polygon: computeVisibility(source.origin, source.range, walls, source.cone),
      darkvision: source.darkvision > 0 ? computeVisibility(source.origin, Math.min(source.darkvision, source.range), walls, source.cone) : null,
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
  return a.origin.x === b.origin.x && a.origin.y === b.origin.y && a.range === b.range && a.darkvision === b.darkvision
    && a.cone?.facing === b.cone?.facing && a.cone?.angle === b.cone?.angle;
}

/** The scene's sight: that of its vision tokens, or everything while the scene has token vision off. */
export function sceneSight(
  lighting: Pick<SceneLighting, 'tokenVision'>,
  sources: readonly SightSource[],
  walls: readonly WallSegment[],
  cache?: SightCache,
): Sight {
  return tokenVisionOn(lighting) ? computeSight(sources, walls, cache) : SEES_ALL;
}

export function computeSight(sources: readonly SightSource[], walls: readonly WallSegment[], cache: SightCache = new SightCache()): Sight {
  if (sources.length === 0) return SEES_ALL;
  cache.retain(new Set(sources.map((source) => source.tokenId)));
  const entries = sources.map((source) => cache.get(source, walls));
  const withDarkvision = entries.filter((entry) => entry.darkvision);
  return {
    all: false,
    polygons: entries.map((entry) => entry.polygon),
    origins: entries.map((entry) => entry.source.origin),
    darkvision: withDarkvision.map((entry) => entry.darkvision!),
    darkvisionOrigins: withDarkvision.map((entry) => entry.source.origin),
    tremors: sources.flatMap(({ origin, tremorsense }) => (tremorsense ? [{ origin, radius: tremorsense }] : [])),
  };
}

export function lightReach(origin: Point, dim: number, walls: readonly WallSegment[]): LightReach {
  return { origin, dim, polygon: computeVisibility(origin, dim, walls) };
}

/** Whether the ambient light alone lights everything in sight. */
export function ambientLights(light: AmbientLight): boolean {
  return light.ambient >= litThresholdOf(light);
}

function isLit(point: Point, ambient: AmbientLight, lights: readonly LightReach[]): boolean {
  if (ambientLights(ambient)) return true;
  return lights.some((light) => Math.hypot(point.x - light.origin.x, point.y - light.origin.y) <= light.dim && pointInPolygon(point, light.polygon));
}

/** Whether a vision token senses a token at `point` by tremorsense, through walls and darkness. */
export function isFelt(point: Point, sight: Sight): boolean {
  return sight.tremors.some(({ origin, radius }) => Math.hypot(point.x - origin.x, point.y - origin.y) <= radius);
}

/** Whether a viewer can see `point`: in line of sight and lit, or within darkvision. */
export function isSeen(point: Point, sight: Sight, ambient: AmbientLight, lights: readonly LightReach[]): boolean {
  if (!sight.all && !sight.polygons.some((polygon) => pointInPolygon(point, polygon))) return false;
  return isLit(point, ambient, lights) || sight.darkvision.some((polygon) => pointInPolygon(point, polygon));
}
