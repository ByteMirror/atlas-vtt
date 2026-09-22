/**
 * Turns the Edit Token modal's max HP / max stress inputs into a store update.
 *
 * A value equal to the statblock default (or cleared while a default exists)
 * follows the statblock; any other value is an override that statblock edits
 * leave alone.
 */

import type { Character } from '../../types';
import type { TokenUpdates } from '../../storeFactory';
import type { StatblockVitals } from './statblockFrontmatter';

export interface ResourceDefaults {
  maxHp?: number;
  maxStress?: number;
}

export interface ResourceInput {
  maxHp: number | undefined;
  maxStress: number | undefined;
}

type ResourceToken = Partial<Pick<Character, 'hp' | 'stress' | 'maxStress'>>;

const clamp = (value: number, max: number): number => Math.max(0, Math.min(max, value));

export function statblockResourceDefaults(vitals: StatblockVitals): ResourceDefaults {
  const maxHp = vitals.hp?.max ?? vitals.hp?.current;
  return {
    ...(maxHp !== undefined && { maxHp }),
    ...(vitals.maxStress !== undefined && { maxStress: vitals.maxStress }),
  };
}

export function buildResourceUpdates(token: ResourceToken, input: ResourceInput, defaults: ResourceDefaults): TokenUpdates {
  const maxHp = input.maxHp ?? defaults.maxHp;
  const maxStress = input.maxStress ?? defaults.maxStress;
  const currentHp = typeof token.hp === 'object' ? token.hp.current : token.hp;
  const currentStress = typeof token.stress === 'object' ? token.stress.current : token.stress;

  return {
    hp: maxHp === undefined ? undefined : { current: clamp(currentHp ?? maxHp, maxHp), max: maxHp },
    maxHpOverridden: maxHp !== undefined && maxHp !== defaults.maxHp ? true : undefined,
    stress: maxStress === undefined ? undefined : clamp(currentStress ?? 0, maxStress),
    maxStress,
    maxStressOverridden: maxStress !== undefined && maxStress !== defaults.maxStress ? true : undefined,
  };
}
