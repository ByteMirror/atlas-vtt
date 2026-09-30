import type { SystemPreset } from '../../types/systemPresetTypes';
import { builtInPresetId, conditionsOf } from './presetHelpers';

/**
 * Cairn 2e: a character moves up to 40ft and takes one action per turn, with
 * no grid rule of its own, so the squares assume 5 feet (8 squares a turn) and
 * every diagonal counts 1. Conditions are the states its core rules name:
 * Deprived and Fatigue (valued, one per slot it fills), Critical Damage (a
 * failed STR save leaves a character crawling until stabilised), DEX 0
 * paralyses, WIL 0 makes delirious, and failed morale saves send foes fleeing.
 */
export const CAIRN: SystemPreset = {
  id: builtInPresetId('cairn'),
  name: 'Cairn',
  builtIn: true,
  rules: {
    gridDefaults: {
      unitType: 'feet',
      unitDistance: 5,
      measurementMode: 'metric',
      diagonalRule: 'equidistant',
      abstractRangeBands: [],
    },
    conditions: conditionsOf('cairn', [
      { name: 'Deprived', color: '#b45309', icon: 'rations' },
      { name: 'Fatigue', color: '#78716c', icon: 'weight', valued: true },
      { name: 'Critical Damage', color: '#991b1b', icon: 'bleeding-wound' },
      { name: 'Paralyzed', color: '#38bdf8', icon: 'frozen-body' },
      { name: 'Delirious', color: '#7c3aed', icon: 'spiral-bloom' },
      { name: 'Fleeing', color: '#f59e0b', icon: 'run' },
    ]),
    defaultWidgets: { hpBar: true },
  },
};
