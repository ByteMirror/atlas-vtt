import { GENERIC_LIGHT_PRESETS } from '../../src/app/gameSystems/lightPresets/generic';
import { emissionOf, lightPresetsOnMap } from '../../src/app/lighting/lightPresetChoice';
import type { LightPresetId } from '../../src/app/lighting/lightPresets';
import type { LightEmission } from '../../src/app/types/lightingTypes';

/** The generic lights as a map on the default 5-foot grid offers them. */
const ON_MAP = lightPresetsOnMap(GENERIC_LIGHT_PRESETS, { unitType: 'feet', unitDistance: 5 }, Infinity);

/** The light the generic preset `id` puts down there, as the popover, the lighting tool and Carry light do. */
export function genericLight(id: LightPresetId): LightEmission {
  const preset = ON_MAP.find((candidate) => candidate.id === id);
  if (!preset) throw new Error(`No generic light ${id}`);
  return emissionOf(preset);
}
