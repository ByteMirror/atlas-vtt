/** Colours of the cloud fog modifier, per scene. */
export const FOG_COLOR_SWATCHES = [
  { value: '#232a38', label: 'Night' },
  { value: '#2b2b2e', label: 'Charcoal' },
  { value: '#5c6069', label: 'Ash' },
  { value: '#8a94a6', label: 'Mist' },
  { value: '#22332a', label: 'Forest' },
  { value: '#3f5a2a', label: 'Poison' },
  { value: '#4a1f24', label: 'Blood' },
  { value: '#33264d', label: 'Arcane' },
  { value: '#c9ced6', label: 'Fog' },
  { value: '#eef1f5', label: 'Snow' },
  { value: '#cbbd9c', label: 'Sand' },
  { value: '#b8cbe0', label: 'Sky' },
] as const;

/** The fog colour of scenes that never picked one. */
export const DEFAULT_FOG_COLOR: string = FOG_COLOR_SWATCHES[0].value;

const HEX_COLOR = /^#[0-9a-f]{6}$/i;

/** A saved fog colour, or the default when the map file holds none or something else. */
export function readFogColor(value: unknown): string {
  return typeof value === 'string' && HEX_COLOR.test(value) ? value.toLowerCase() : DEFAULT_FOG_COLOR;
}
