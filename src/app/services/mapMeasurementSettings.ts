import { resolveMeasurementSettings, type MeasurementSettings } from '../grid/measurementFormat';
import type { ViewAtlasState } from '../storeFactory';
import type { AssetService } from './AssetService';

/** Measurement settings for the map in `state`, read from its collection when it has one. */
export function mapMeasurementSettings(
  assetService: AssetService,
  state: Pick<ViewAtlasState, 'mapPath' | 'grid'>,
): MeasurementSettings {
  const collectionId = state.mapPath ? assetService.getCollectionForMap(state.mapPath) : null;
  const defaults = collectionId ? assetService.getCollectionSettings(collectionId).gridDefaults : undefined;
  return resolveMeasurementSettings(defaults, state.grid);
}
