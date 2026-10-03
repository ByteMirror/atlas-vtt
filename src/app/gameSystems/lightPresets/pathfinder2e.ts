import { CANDLE_LOOK, DARKNESS_LOOK, LANTERN_LOOK, SPELL_LOOK, STEADY_MAGIC_LOOK, TORCH_LOOK, lightsOf } from './lightPresetHelpers';

/**
 * Pathfinder 2e (Player Core): "it sheds dim light to double that radius", except the candle,
 * which sheds dim light only, and the glow rod. Darkness is the spell's 20-foot burst.
 */
export const PATHFINDER_2E_LIGHTS = lightsOf('pathfinder2e', 'feet', {
  candle: { name: 'Candle', bright: 0, dim: 10, ...CANDLE_LOOK },
  torch: { name: 'Torch', bright: 20, dim: 40, ...TORCH_LOOK },
  'hooded-lantern': { name: 'Hooded lantern', bright: 30, dim: 60, ...LANTERN_LOOK },
  light: { name: 'Light', bright: 20, dim: 40, ...SPELL_LOOK },
  'everlight-crystal': { name: 'Everlight crystal', bright: 20, dim: 40, ...STEADY_MAGIC_LOOK },
  'glow-rod': { name: 'Glow rod', bright: 20, dim: 60, ...STEADY_MAGIC_LOOK, color: '#7ee0a8' },
  darkness: { name: 'Darkness', dim: 20, ...DARKNESS_LOOK },
  // Bright light in a 60-foot cone, dim in the next 60 feet; a Pathfinder cone is a quarter circle.
  'bullseye-lantern': { name: 'Bull\'s-eye lantern', bright: 60, dim: 120, ...LANTERN_LOOK, angle: 90 },
});
