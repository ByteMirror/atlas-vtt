import type { LightEmission } from '../types/lightingTypes';

export type EmissionNumberField = 'bright' | 'dim' | 'intensity' | 'sourceRadius';

const RANGES: Record<EmissionNumberField, [number, number]> = {
  bright: [0, Infinity],
  dim: [0, Infinity],
  intensity: [0, 2],
  sourceRadius: [0, 5],
};

/**
 * The emission with one number field set, clamped to its range; bright and dim end at `maxRange`
 * (`maxLightRange`) and push each other so dim ≥ bright.
 */
export function withEmissionValue(emission: LightEmission, field: EmissionNumberField, value: number, maxRange = Infinity): LightEmission {
  const [min, max] = RANGES[field];
  const clamped = Math.min(max, field === 'bright' || field === 'dim' ? maxRange : max, Math.max(min, value));
  if (clamped === (emission[field] ?? null)) return emission;
  const next = { ...emission, [field]: clamped };
  if (field === 'bright' && next.dim < clamped) next.dim = clamped;
  if (field === 'dim' && next.bright > clamped) next.bright = clamped;
  return next;
}

/** What was typed, as a number. A comma is the decimal sign where `locale` (the user's, by default) writes one. */
function typedNumber(input: string, locale?: string): number {
  const text = input.trim();
  if (text === '') return NaN;
  return Number((1.5).toLocaleString(locale).includes(',') ? text.replace(',', '.') : text);
}

/**
 * The emission with one number field set from what the user typed. Text that is not a
 * number keeps the emission as it was.
 */
export function editEmission(emission: LightEmission, field: EmissionNumberField, input: string, maxRange?: number, locale?: string): LightEmission {
  const parsed = typedNumber(input, locale);
  return Number.isFinite(parsed) ? withEmissionValue(emission, field, parsed, maxRange) : emission;
}
