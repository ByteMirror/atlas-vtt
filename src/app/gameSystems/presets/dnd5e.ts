import type { SystemPreset } from '../../types/systemPresetTypes';
import { builtInPresetId, conditionsOf } from './presetHelpers';

/** D&D 5th edition: 5-foot squares, every diagonal counts 5 feet, the 15 SRD conditions. */
export const DND_5E: SystemPreset = {
  id: builtInPresetId('dnd5e'),
  name: 'D&D 5e',
  builtIn: true,
  rules: {
    gridDefaults: {
      unitType: 'feet',
      unitDistance: 5,
      measurementMode: 'metric',
      diagonalRule: 'equidistant',
      abstractRangeBands: [],
    },
    conditions: conditionsOf('dnd5e', [
      { name: 'Blinded', color: '#475569', icon: 'blindfold' },
      { name: 'Charmed', color: '#db2777', icon: 'heart' },
      { name: 'Deafened', color: '#0891b2', icon: 'hearing-disabled' },
      { name: 'Exhaustion', color: '#92400e', icon: 'tired-eye', valued: true },
      { name: 'Frightened', color: '#7c3aed', icon: 'terror' },
      { name: 'Grappled', color: '#ea580c', icon: 'grab' },
      { name: 'Incapacitated', color: '#b91c1c', icon: 'knockout' },
      { name: 'Invisible', color: '#c7d2fe', icon: 'invisible' },
      { name: 'Paralyzed', color: '#38bdf8', icon: 'frozen-body' },
      { name: 'Petrified', color: '#78716c', icon: 'stoned-skull' },
      { name: 'Poisoned', color: '#16a34a', icon: 'poison' },
      { name: 'Prone', color: '#d97706', icon: 'foot-trip' },
      { name: 'Restrained', color: '#0d9488', icon: 'imprisoned' },
      { name: 'Stunned', color: '#facc15', icon: 'knocked-out-stars' },
      { name: 'Unconscious', color: '#1e3a8a', icon: 'sleepy' },
    ]),
    defaultWidgets: { hpBar: true },
  },
};
