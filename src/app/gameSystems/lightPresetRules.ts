/** Reading light presets: which ones a collection has, and comparing two lists. */

import type { LightPresetDefinition } from '../types/lightPresetTypes';
import type { SystemPreset } from '../types/systemPresetTypes';
import { GENERIC_LIGHT_PRESETS } from './lightPresets/generic';

/**
 * The lights offered in a collection: its own, else those of the preset it was set from, else
 * the generic ones (no game system, or one whose rules name no lights). An empty list counts
 * as none, so there is always a light to place.
 */
export function collectionLightPresets(
  settings: { lightPresets?: readonly LightPresetDefinition[] | undefined; systemPresetId?: string | undefined },
  presets: readonly SystemPreset[],
): readonly LightPresetDefinition[] {
  const own = settings.lightPresets?.length ? settings.lightPresets : undefined;
  const ofPreset = presets.find((preset) => preset.id === settings.systemPresetId)?.rules.lightPresets;
  return own ?? (ofPreset?.length ? ofPreset : GENERIC_LIGHT_PRESETS);
}

function sameLightPreset(a: LightPresetDefinition, b: LightPresetDefinition): boolean {
  return a.id === b.id
    && a.name === b.name
    && a.unit === b.unit
    && a.bright === b.bright
    && a.dim === b.dim
    && a.color.toLowerCase() === b.color.toLowerCase()
    && a.animation === b.animation
    && a.kind === b.kind
    && a.sourceRadius === b.sourceRadius
    && (a.intensity ?? 1) === (b.intensity ?? 1)
    && !!a.darkness === !!b.darkness
    && (a.priority ?? 0) === (b.priority ?? 0)
    && a.angle === b.angle;
}

/** Whether two lists offer the same lights, ids included since lights record them; none is the generic set. */
export function sameLightPresets(a: readonly LightPresetDefinition[] | undefined, b: readonly LightPresetDefinition[] | undefined): boolean {
  const left = a ?? GENERIC_LIGHT_PRESETS;
  const right = b ?? GENERIC_LIGHT_PRESETS;
  return left.length === right.length && left.every((light, i) => sameLightPreset(light, right[i]!));
}
