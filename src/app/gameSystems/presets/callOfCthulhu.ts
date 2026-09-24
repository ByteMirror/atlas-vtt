import type { SystemPreset } from '../../types/systemPresetTypes';
import { builtInPresetId, conditionsOf } from './presetHelpers';

/**
 * Call of Cthulhu 7th Edition has no grid: firearm ranges, blast radii and the
 * optional combat movement (MOV × 5 yards) are all in yards, so a square is one
 * yard and the ruler measures the exact distance. Conditions are the states on
 * the official character sheet (Major Wound, Dying, Unconscious, Temporary and
 * Indefinite Insanity) plus death, a bout of madness, Prone from a major wound
 * and Stunned from stun weapons.
 */
export const CALL_OF_CTHULHU: SystemPreset = {
  id: builtInPresetId('coc7e'),
  name: 'Call of Cthulhu',
  builtIn: true,
  rules: {
    gridDefaults: {
      unitType: 'yards',
      unitDistance: 1,
      measurementMode: 'metric',
      diagonalRule: 'euclidean',
      abstractRangeBands: [],
    },
    conditions: conditionsOf('coc7e', [
      { name: 'Major Wound', color: '#dc2626', icon: 'bleeding-wound' },
      { name: 'Dying', color: '#7f1d1d', icon: 'heartbeat' },
      { name: 'Unconscious', color: '#1e3a8a', icon: 'sleepy' },
      { name: 'Dead', color: '#1f2937', icon: 'skull' },
      { name: 'Temporary Insanity', color: '#7c3aed', icon: 'brain-tentacle' },
      { name: 'Indefinite Insanity', color: '#4c1d95', icon: 'psychic-waves' },
      { name: 'Bout of Madness', color: '#c026d3', icon: 'screaming' },
      { name: 'Prone', color: '#d97706', icon: 'foot-trip' },
      { name: 'Stunned', color: '#fbbf24', icon: 'knocked-out-stars' },
    ]),
    defaultWidgets: { hpBar: true },
  },
};
