import type { SystemPreset } from '../../types/systemPresetTypes';
import { builtInPresetId, conditionsOf } from './presetHelpers';

/**
 * Old-School Essentials: the rules' miniatures scale is 1" = 5' (5 yards
 * outdoors), and melee reaches 5'. They have no diagonal rule; every diagonal
 * counts 1 like the other presets. OSE has no conditions chapter: these are the
 * states its spells and monsters put on creatures, in its British spelling.
 * Asleep (the Sleep spell's "magical slumber") and Fleeing (fear and morale)
 * name effects the text describes without an adjective.
 */
export const OLD_SCHOOL_ESSENTIALS: SystemPreset = {
  id: builtInPresetId('ose'),
  name: 'Old-School Essentials',
  builtIn: true,
  rules: {
    gridDefaults: {
      unitType: 'feet',
      unitDistance: 5,
      measurementMode: 'metric',
      diagonalRule: 'equidistant',
      abstractRangeBands: [],
    },
    conditions: conditionsOf('ose', [
      { name: 'Paralysed', color: '#38bdf8', icon: 'frozen-body' },
      { name: 'Petrified', color: '#78716c', icon: 'stoned-skull' },
      { name: 'Charmed', color: '#db2777', icon: 'heart' },
      { name: 'Asleep', color: '#1e3a8a', icon: 'sleepy' },
      { name: 'Blinded', color: '#475569', icon: 'blindfold' },
      { name: 'Invisible', color: '#c7d2fe', icon: 'invisible' },
      { name: 'Entangled', color: '#0d9488', icon: 'spider-web' },
      { name: 'Fleeing', color: '#7c3aed', icon: 'run' },
      { name: 'Surprised', color: '#f59e0b', icon: 'surprised' },
    ]),
    defaultWidgets: { hpBar: true },
  },
};
