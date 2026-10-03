import { TORCH_LOOK, lightsOf } from './lightPresetHelpers';

/** Cairn 2e: "Torches and other radial sources of light illuminate 40ft of dungeon." */
export const CAIRN_LIGHTS = lightsOf('cairn', 'feet', {
  torch: { name: 'Torch', bright: 40, dim: 40, ...TORCH_LOOK },
});
