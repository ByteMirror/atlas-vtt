import { DEFAULT_CONE_ANGLE } from '../grid/measurementFormat';
import type { CollectionGridDefaults } from '../types/collectionSettingsTypes';
import { BUILT_IN_SYSTEM_PRESETS } from './builtInPresets';

/**
 * The cone angle a collection measures with: its own, else that of its built-in system
 * (collections set up before cone angles existed store none), else a quarter circle.
 */
export function collectionConeAngle(gridDefaults: CollectionGridDefaults | undefined, systemPresetId: string | undefined): number {
  return gridDefaults?.coneAngle
    ?? BUILT_IN_SYSTEM_PRESETS.find((preset) => preset.id === systemPresetId)?.rules.gridDefaults.coneAngle
    ?? DEFAULT_CONE_ANGLE;
}
