import type { MapAsset } from '../types';
import type { CreateScenePrefill } from '../hooks/useAssetCrud';

/** Background and name of a new scene built on a map. */
export function scenePrefillFromMap(map: MapAsset): CreateScenePrefill {
  return { backgroundPath: map.mapFilePath, defaultName: map.name };
}
