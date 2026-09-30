import type { LightEmission, TokenVision } from '../types/lightingTypes';
import { emissionOfPreset } from './lightEmissionForm';
import type { LightPresetId } from './lightPresets';

export interface VisionForm {
  enabled: boolean;
  /** Game units as typed; blank is unlimited sight. */
  range: string;
  /** Game units as typed; blank is none. */
  darkvision: string;
}

function positive(text: string): number | undefined {
  const value = Number(text);
  return text.trim() !== '' && Number.isFinite(value) && value > 0 ? value : undefined;
}

export function visionFromForm(form: VisionForm): TokenVision {
  const range = positive(form.range);
  const darkvision = positive(form.darkvision);
  return { enabled: form.enabled, ...(range !== undefined && { range }), ...(darkvision !== undefined && { darkvision }) };
}

/** The light a token carries for a preset, or none. */
export function carriedLight(preset: LightPresetId | null): LightEmission | undefined {
  return preset ? emissionOfPreset(preset) : undefined;
}
