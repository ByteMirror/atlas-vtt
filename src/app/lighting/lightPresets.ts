import type { LightEmission } from '../types/lightingTypes';
import { t } from '../i18n';

export type LightPresetId = 'candle' | 'torch' | 'lantern' | 'magical';

export interface LightPreset {
  label: string;
  emission: LightEmission;
}

/** Built-in lights, in feet-based game units like the D&D defaults. */
export const LIGHT_PRESETS: Record<LightPresetId, LightPreset> = {
  candle: { label: t('light.preset.candle'), emission: { bright: 5, dim: 10, color: '#ffb347', intensity: 0.9, animation: 'candle', sourceRadius: 1 } },
  torch: { label: t('light.preset.torch'), emission: { bright: 20, dim: 40, color: '#ff9a3c', intensity: 1, animation: 'torch', sourceRadius: 2 } },
  lantern: { label: t('light.preset.lantern'), emission: { bright: 30, dim: 60, color: '#ffd28a', intensity: 1, animation: 'none', sourceRadius: 1.5 } },
  magical: { label: t('light.preset.magical'), emission: { bright: 15, dim: 30, color: '#8fb8ff', intensity: 1, animation: 'magic', sourceRadius: 2.5 } },
};

export const LIGHT_PRESET_IDS = Object.keys(LIGHT_PRESETS) as LightPresetId[];

function sameEmission(a: LightEmission, b: LightEmission): boolean {
  return a.bright === b.bright && a.dim === b.dim && a.color.toLowerCase() === b.color.toLowerCase()
    && a.intensity === b.intensity && a.animation === b.animation && (a.sourceRadius ?? 0) === (b.sourceRadius ?? 0);
}

/** The preset an emission is identical to, or null once any field was edited. */
export function presetOf(emission: LightEmission): LightPresetId | null {
  return LIGHT_PRESET_IDS.find((id) => sameEmission(LIGHT_PRESETS[id].emission, emission)) ?? null;
}
