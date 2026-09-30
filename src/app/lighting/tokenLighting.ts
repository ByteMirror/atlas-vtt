import type { LightEmission, TokenVision } from '../types/lightingTypes';
import { emissionOfPreset } from './lightEmissionForm';
import type { LightPresetId } from './lightPresets';

export interface VisionForm {
  enabled: boolean;
  /** Game units as typed; blank is unlimited sight. */
  range: string;
  /** Game units as typed; blank is none. */
  darkvision: string;
  /** Game units as typed; blank is none. */
  tremorsense: string;
  /** Degrees as typed; blank is all around. */
  angle: string;
}

const FULL_TURN = 360;

function positive(text: string): number | undefined {
  const value = Number(text);
  return text.trim() !== '' && Number.isFinite(value) && value > 0 ? value : undefined;
}

/** A cone narrower than a full turn, at least one degree wide; anything else sees all around. */
function coneAngle(text: string): number | undefined {
  const angle = positive(text);
  return angle !== undefined && angle < FULL_TURN ? Math.max(1, angle) : undefined;
}

const text = (value: number | undefined): string => (value === undefined ? '' : String(value));

/** The fields Edit Token shows for a token's vision. */
export function visionForm(vision: TokenVision | undefined): VisionForm {
  return {
    enabled: vision?.enabled ?? false,
    range: text(vision?.range),
    darkvision: text(vision?.darkvision),
    tremorsense: text(vision?.tremorsense),
    angle: text(vision?.angle),
  };
}

export function visionFromForm(form: VisionForm): TokenVision {
  const range = positive(form.range);
  const darkvision = positive(form.darkvision);
  const tremorsense = positive(form.tremorsense);
  const angle = coneAngle(form.angle);
  return {
    enabled: form.enabled,
    ...(range !== undefined && { range }),
    ...(darkvision !== undefined && { darkvision }),
    ...(tremorsense !== undefined && { tremorsense }),
    ...(angle !== undefined && { angle }),
  };
}

/** The light a token carries for a preset, or none. */
export function carriedLight(preset: LightPresetId | null): LightEmission | undefined {
  return preset ? emissionOfPreset(preset) : undefined;
}
