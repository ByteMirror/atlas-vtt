import type { DiceRollResult } from './DiceTool';

export type DiceCrit = 'high' | 'low' | null;

/** Classifies a roll for the toast highlight and the result sound. */
export function getDiceCrit(result: DiceRollResult): DiceCrit {
  if (result.total >= 20 && result.rolls.some((r) => r.die === 'd20' && r.value === 20)) {
    return 'high';
  }
  if (result.total === 1 && result.rolls.some((r) => r.value === 1)) {
    return 'low';
  }
  return null;
}
