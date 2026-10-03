import { LIGHT_PRESETS, LIGHT_PRESET_IDS } from '../../lighting/lightPresets';
import type { LightPresetDefinition } from '../../types/lightPresetTypes';

/** The square `LIGHT_PRESETS` writes its distances for. */
const FEET_PER_CELL = 5;

/**
 * The lights of a collection without a game system, and of a system whose rules name none:
 * the four Atlas always had and a Darkness, under the ids placed lights record as their kind. They are counted
 * in grid cells (a torch lights 4 and reaches 8), so they are the same size on every grid,
 * whatever the collection measures in.
 */
export const GENERIC_LIGHT_PRESETS: readonly LightPresetDefinition[] = LIGHT_PRESET_IDS.map((id) => {
  const { label, emission } = LIGHT_PRESETS[id];
  const { intensity, sourceRadius, bright, dim, ...light } = emission;
  return {
    id,
    name: label,
    unit: 'squares',
    bright: bright / FEET_PER_CELL,
    dim: dim / FEET_PER_CELL,
    ...light,
    kind: id,
    ...(sourceRadius !== undefined && { sourceRadius }),
    ...(intensity !== 1 && { intensity }),
  };
});
