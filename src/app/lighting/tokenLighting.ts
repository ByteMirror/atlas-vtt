import type { LightEmission, TokenVision, TokenVisionDefaults } from '../types/lightingTypes';
import { emissionOfPreset } from './lightEmissionForm';
import type { LightPresetId } from './lightPresets';
import { numberText, parseNumberText, positiveNumber } from '../utils/numberInput';
import { coneAngle } from '../vision/visionCone';

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

/** A vision field as both Edit Token and the collection's Vision tab show it. */
export interface VisionFieldSpec {
  key: keyof VisionDefaultsForm;
  label: string;
  /** Labelled with the map's game unit, e.g. "Sight range (ft)". */
  inGameUnits: boolean;
  placeholder: string;
  resetLabel: string;
  hint?: string;
  min?: number;
  max?: number;
}

export const VISION_FIELDS: readonly VisionFieldSpec[] = [
  { key: 'range', label: 'Sight range', inGameUnits: true, placeholder: 'Unlimited', resetLabel: 'Unlimited sight' },
  { key: 'darkvision', label: 'Darkvision', inGameUnits: true, placeholder: 'None', resetLabel: 'No darkvision' },
  { key: 'tremorsense', label: 'Tremorsense', inGameUnits: true, placeholder: 'None', resetLabel: 'No tremorsense' },
  {
    key: 'angle', label: 'Vision angle (°)', inGameUnits: false, placeholder: '360', resetLabel: 'See all around',
    hint: "Faces the token's rotation", min: 1, max: 360,
  },
];

/** The label of `field` with the map's game unit, which is empty for abstract units. */
export function visionFieldLabel(field: VisionFieldSpec, unit: string): string {
  return field.inGameUnits && unit ? `${field.label} (${unit})` : field.label;
}

/** The fields a collection's default vision shows. */
export function visionDefaultsForm(defaults: TokenVisionDefaults | undefined): VisionDefaultsForm {
  return {
    range: numberText(defaults?.range),
    darkvision: numberText(defaults?.darkvision),
    tremorsense: numberText(defaults?.tremorsense),
    angle: numberText(defaults?.angle),
  };
}

/** The fields Edit Token shows for a token's vision. */
export function visionForm(vision: TokenVision | undefined): VisionForm {
  return { enabled: vision?.enabled ?? false, ...visionDefaultsForm(vision) };
}

/** The default vision typed in; empty when every field is blank or unusable. */
export function visionDefaultsFromForm(form: VisionDefaultsForm): TokenVisionDefaults {
  const range = positiveNumber(parseNumberText(form.range));
  const darkvision = positiveNumber(parseNumberText(form.darkvision));
  const tremorsense = positiveNumber(parseNumberText(form.tremorsense));
  const angle = coneAngle(parseNumberText(form.angle));
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
