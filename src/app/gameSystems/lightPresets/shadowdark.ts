import { LANTERN_LOOK, SPELL_LOOK, TORCH_LOOK, lightsOf } from './lightPresetHelpers';

/**
 * Shadowdark knows lit and total darkness only, and measures in bands: a torch and the Light
 * spell reach near, a lantern double near. The distances are those bands in the preset's feet.
 */
export const SHADOWDARK_LIGHTS = lightsOf('shadowdark', 'feet', {
  torch: { name: 'Torch (near)', bright: 30, dim: 30, ...TORCH_LOOK },
  lantern: { name: 'Lantern (double near)', bright: 60, dim: 60, ...LANTERN_LOOK },
  light: { name: 'Light spell (near)', bright: 30, dim: 30, ...SPELL_LOOK },
});
