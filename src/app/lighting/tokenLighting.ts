import type { LightEmission, TokenVision, TokenVisionDefaults } from '../types/lightingTypes';
import { emissionOfPreset } from './lightEmissionForm';
import type { LightPresetId } from './lightPresets';

export interface VisionDefaultsForm {
  /** Game units as typed; blank is unlimited sight. */
  range: string;
  /** Game units as typed; blank is none. */
  darkvision: string;
  /** Game units as typed; blank is none. */
  tremorsense: string;
  /** Degrees as typed; blank is all around. */
  angle: string;
}

export interface VisionForm extends VisionDefaultsForm {
  enabled: boolean;
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

/** The fields a collection's default vision shows. */
export function visionDefaultsForm(defaults: TokenVisionDefaults | undefined): VisionDefaultsForm {
  return {
    range: text(defaults?.range),
    darkvision: text(defaults?.darkvision),
    tremorsense: text(defaults?.tremorsense),
    angle: text(defaults?.angle),
  };
}

/** The fields Edit Token shows for a token's vision. */
export function visionForm(vision: TokenVision | undefined): VisionForm {
  return { enabled: vision?.enabled ?? false, ...visionDefaultsForm(vision) };
}

/** The default vision typed in; empty when every field is blank or unusable. */
export function visionDefaultsFromForm(form: VisionDefaultsForm): TokenVisionDefaults {
  const range = positive(form.range);
  const darkvision = positive(form.darkvision);
  const tremorsense = positive(form.tremorsense);
  const angle = coneAngle(form.angle);
  return {
    ...(range !== undefined && { range }),
    ...(darkvision !== undefined && { darkvision }),
    ...(tremorsense !== undefined && { tremorsense }),
    ...(angle !== undefined && { angle }),
  };
}

export function visionFromForm(form: VisionForm): TokenVision {
  return { enabled: form.enabled, ...visionDefaultsFromForm(form) };
}

/** The light a token carries for a preset, or none. */
export function carriedLight(preset: LightPresetId | null): LightEmission | undefined {
  return preset ? emissionOfPreset(preset) : undefined;
}
