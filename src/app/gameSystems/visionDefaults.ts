import type { AssetService } from '../services/AssetService';
import type { TokenVisionDefaults } from '../types/lightingTypes';
import { positiveNumber } from '../utils/numberInput';
import { coneAngle } from '../vision/visionCone';

const DISTANCE_FIELDS = ['range', 'darkvision', 'tremorsense'] as const;

/**
 * The usable part of stored default vision, read as the forms read it: distances above 0, a cone
 * angle as `coneAngle` takes it (360 is no cone, so it is dropped), anything else (unknown fields,
 * `enabled`) dropped. Undefined when nothing is left, since an empty default means new tokens get
 * no vision settings.
 */
export function parseVisionDefaults(raw: unknown): TokenVisionDefaults | undefined {
  if (typeof raw !== 'object' || raw === null || Array.isArray(raw)) return undefined;
  const record = raw as Record<string, unknown>;
  const result: TokenVisionDefaults = {};
  for (const field of DISTANCE_FIELDS) {
    const value = positiveNumber(record[field]);
    if (value !== undefined) result[field] = value;
  }
  const angle = coneAngle(record.angle);
  if (angle !== undefined) result.angle = angle;
  return hasVisionDefaults(result) ? result : undefined;
}

/** Whether `defaults` sets anything new tokens would start with. */
export function hasVisionDefaults(defaults: TokenVisionDefaults | undefined): defaults is TokenVisionDefaults {
  return defaults !== undefined && Object.values(defaults).some((value) => value !== undefined);
}

/** Whether two defaults give tokens the same vision; none and empty are the same. */
export function sameVisionDefaults(a: TokenVisionDefaults | undefined, b: TokenVisionDefaults | undefined): boolean {
  return a?.range === b?.range
    && a?.darkvision === b?.darkvision
    && a?.tremorsense === b?.tremorsense
    && a?.angle === b?.angle;
}

/** The default vision of the collection that holds `mapPath`; undefined when it or the map has none. */
export function mapVisionDefaults(
  assetService: Pick<AssetService, 'getCollectionForMap' | 'getCollectionSettings'>,
  mapPath: string | null | undefined,
): TokenVisionDefaults | undefined {
  const collectionId = mapPath ? assetService.getCollectionForMap(mapPath) : null;
  return collectionId ? parseVisionDefaults(assetService.getCollectionSettings(collectionId).defaultTokenVision) : undefined;
}
