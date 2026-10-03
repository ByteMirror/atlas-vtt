/**
 * The senses that ship with Atlas: the generic set and those of the built-in game systems, one
 * file per system. Their ids never change.
 */

import type { SenseDefinition } from '../../types/senseTypes';
import { BUILT_IN_SYSTEM_PRESETS } from '../builtInPresets';

export { GENERIC_SENSES, NORMAL_SIGHT } from './generic';

/** The senses of each built-in preset that has its own, by preset id. */
export const BUILT_IN_SENSES: Readonly<Record<string, readonly SenseDefinition[]>> = Object.fromEntries(
  BUILT_IN_SYSTEM_PRESETS.flatMap((preset) => (preset.rules.senses ? [[preset.id, preset.rules.senses]] : [])),
);
