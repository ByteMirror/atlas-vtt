import type { LightEmission } from '../types/lightingTypes';
import { LIGHT_PRESETS, type LightPresetId } from './lightPresets';

export type EmissionNumberField = 'bright' | 'dim' | 'intensity' | 'sourceRadius';

const RANGES: Record<EmissionNumberField, [number, number]> = {
  bright: [0, Infinity],
  dim: [0, Infinity],
  intensity: [0, 2],
  sourceRadius: [0, 5],
};

/**
 * The emission with one number field set from what the user typed. Text that is not a
 * number keeps the emission as it was; bright and dim push each other so dim ≥ bright.
 */
export function editEmission(emission: LightEmission, field: EmissionNumberField, input: string): LightEmission {
  const parsed = input.trim() === '' ? NaN : Number(input);
  if (!Number.isFinite(parsed)) return emission;
  const [min, max] = RANGES[field];
  const value = Math.min(max, Math.max(min, parsed));
  const next = { ...emission, [field]: value };
  if (field === 'bright' && next.dim < value) next.dim = value;
  if (field === 'dim' && next.bright > value) next.bright = value;
  return next;
}

export function emissionOfPreset(id: LightPresetId): LightEmission {
  return { ...LIGHT_PRESETS[id].emission };
}
