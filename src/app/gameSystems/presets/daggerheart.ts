import type { SystemPreset } from '../../types/systemPresetTypes';
import { builtInPresetId, conditionsOf } from './presetHelpers';

/**
 * Daggerheart measures in range bands. The SRD's optional grid conversion
 * (1-inch squares of about 5 feet): Melee 1 square, Very Close 3, Close 6,
 * Far 12, Very Far 13 or more.
 */
export const DAGGERHEART: SystemPreset = {
  id: builtInPresetId('daggerheart'),
  name: 'Daggerheart',
  builtIn: true,
  rules: {
    gridDefaults: {
      unitType: 'feet',
      unitDistance: 5,
      measurementMode: 'abstract',
      diagonalRule: 'equidistant',
      abstractRangeBands: [
        { name: 'Melee', maxSquares: 1 },
        { name: 'Very Close', maxSquares: 3 },
        { name: 'Close', maxSquares: 6 },
        { name: 'Far', maxSquares: 12 },
        // The last band also names every longer distance.
        { name: 'Very Far', maxSquares: 13 },
      ],
    },
    conditions: conditionsOf('daggerheart', [
      { name: 'Hidden', color: '#475569', icon: 'hidden' },
      { name: 'Restrained', color: '#0d9488', icon: 'imprisoned' },
      { name: 'Vulnerable', color: '#dc2626', icon: 'cracked-shield' },
    ]),
    // Every Daggerheart character and adversary tracks Hit Points and Stress.
    defaultWidgets: { hpBar: true, stressBar: true },
  },
};
