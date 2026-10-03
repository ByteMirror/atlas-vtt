import { hasVisionDefaults } from '../gameSystems/visionDefaults';
import type { TokenVision, TokenVisionDefaults } from '../types/lightingTypes';

/**
 * The vision a token placed from the library starts with: the collection's default (`defaults`),
 * with vision off. A token's own senses win over its statblock's for good, so a token that links
 * a statblock (`linked`) gets none of the default's senses: it follows its statblock, whatever
 * that says today or after a later edit. Its sight range and cone are stamped all the same.
 * Nothing of the statblock is ever stamped, and it never switches vision on.
 */
export function placementVision(defaults: TokenVisionDefaults | undefined, linked: boolean): TokenVision | undefined {
  if (!defaults) return undefined;
  if (!linked) return { enabled: false, ...structuredClone(defaults) };
  const { senses: _senses, darkvision: _darkvision, tremorsense: _tremorsense, ...rest } = defaults;
  return hasVisionDefaults(rest) ? { enabled: false, ...rest } : undefined;
}
