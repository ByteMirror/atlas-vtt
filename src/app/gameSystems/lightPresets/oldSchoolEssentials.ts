import { LANTERN_LOOK, TORCH_LOOK, lightsOf } from './lightPresetHelpers';

/** Old-School Essentials: "Typical light sources enable normal vision within a 30' radius." */
export const OLD_SCHOOL_ESSENTIALS_LIGHTS = lightsOf('ose', 'feet', {
  torch: { name: 'Torch', bright: 30, dim: 30, ...TORCH_LOOK },
  lantern: { name: 'Lantern', bright: 30, dim: 30, ...LANTERN_LOOK },
});
