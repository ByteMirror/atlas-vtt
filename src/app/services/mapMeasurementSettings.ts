import { resolveMeasurementSettings, type MeasurementSettings } from '../grid/measurementFormat';
import { collectionConeAngle } from '../gameSystems/coneAngle';
import type { ViewAtlasState } from '../storeFactory';
import type { AssetService } from './AssetService';

/** Measurement settings for the map in `state`, read from its collection when it has one. */
export function mapMeasurementSettings(
  assetService: AssetService,
  state: Pick<ViewAtlasState, 'mapPath' | 'grid'>,
): MeasurementSettings {
  const collectionId = state.mapPath ? assetService.getCollectionForMap(state.mapPath) : null;
  if (!collectionId) return resolveMeasurementSettings(undefined, state.grid);
  const { gridDefaults, systemPresetId } = assetService.getCollectionSettings(collectionId);
  return { ...resolveMeasurementSettings(gridDefaults, state.grid), coneAngle: collectionConeAngle(gridDefaults, systemPresetId) };
}
