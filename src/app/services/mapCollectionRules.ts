import type { App } from 'obsidian';
import { BUILT_IN_SYSTEM_PRESETS } from '../gameSystems/builtInPresets';
import { GENERIC_LIGHT_PRESETS } from '../gameSystems/lightPresets/generic';
import { readCollectionLightPresets } from '../gameSystems/lightPresetValidation';
import { resolveMeasurementSettings } from '../grid/measurementFormat';
import { unitScaleOf } from '../lighting/lightingUnits';
import { lightPresetsOnMap } from '../lighting/lightPresetChoice';
import { maxLightRange } from '../lighting/lightRanges';
import type { ViewAtlasState } from '../storeFactory';
import type { CollectionSettings } from '../types/collectionSettingsTypes';
import type { LightPresetDefinition } from '../types/lightPresetTypes';
import type { SystemPreset } from '../types/systemPresetTypes';
import { AssetService } from './AssetService';
import { SettingsService } from './SettingsService';
import { SystemPresetService } from './SystemPresetService';

/** The game system presets of the vault: the built-in ones, and the user's once the settings are loaded. */
export function systemPresetsOf(app: App): readonly SystemPreset[] {
  const settings = SettingsService.forApp(app);
  return settings ? new SystemPresetService(settings).list() : BUILT_IN_SYSTEM_PRESETS;
}

/** The settings of the collection that holds the map; null for a map outside every collection. */
export function mapCollectionSettings(app: App, mapPath: string | null | undefined): CollectionSettings | null {
  const assets = AssetService.getInstance(app);
  const collectionId = mapPath ? assets.getCollectionForMap(mapPath) : null;
  return collectionId ? assets.getCollectionSettings(collectionId) : null;
}

/**
 * The lights offered on the map in `state`: its collection's, or the generic ones without one,
 * in what the map measures in and no farther than a light may reach on it (`lightPresetsOnMap`).
 */
export function mapLightPresets(app: App, state: Pick<ViewAtlasState, 'mapPath' | 'grid'>): readonly LightPresetDefinition[] {
  const settings = mapCollectionSettings(app, state.mapPath);
  const presets = settings ? readCollectionLightPresets(settings, systemPresetsOf(app)) : GENERIC_LIGHT_PRESETS;
  const unit = resolveMeasurementSettings(settings?.gridDefaults, state.grid);
  return lightPresetsOnMap(presets, unit, maxLightRange(unitScaleOf(unit, state.grid)));
}
