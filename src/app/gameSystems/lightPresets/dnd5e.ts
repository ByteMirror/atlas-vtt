import { CANDLE_LOOK, DARKNESS_LOOK, LANTERN_LOOK, SPELL_LOOK, STEADY_MAGIC_LOOK, TORCH_LOOK, lightsOf } from './lightPresetHelpers';

/**
 * D&D 5e (SRD 5.2.1): bright light to the first radius, dim light for the stated distance
 * beyond it. The most common four come first.
 * Darkness is the spell's 15-foot sphere, which nonmagical light and the light of spells of its
 * level or lower cannot illuminate; Daylight, a level above it, outranks it.
 */
export const DND_5E_LIGHTS = lightsOf('dnd5e', 'feet', {
  candle: { name: 'Candle', bright: 5, dim: 10, ...CANDLE_LOOK },
  torch: { name: 'Torch', bright: 20, dim: 40, ...TORCH_LOOK },
  'hooded-lantern': { name: 'Hooded lantern', bright: 30, dim: 60, ...LANTERN_LOOK },
  light: { name: 'Light', bright: 20, dim: 40, ...SPELL_LOOK },
  lamp: { name: 'Lamp', bright: 15, dim: 45, ...LANTERN_LOOK, color: '#ffc46b', sourceRadius: 1 },
  'continual-flame': { name: 'Continual Flame', bright: 20, dim: 40, ...STEADY_MAGIC_LOOK, color: '#ffc46b' },
  daylight: { name: 'Daylight', bright: 60, dim: 120, ...STEADY_MAGIC_LOOK, sourceRadius: 4, priority: 1 },
  darkness: { name: 'Darkness', dim: 15, ...DARKNESS_LOOK },
  // "Bright Light in a 60-foot Cone and Dim Light for an additional 60 feet"; a 5e cone is as wide as it is long.
  'bullseye-lantern': { name: 'Bullseye lantern', bright: 60, dim: 120, ...LANTERN_LOOK, angle: 53 },
});
