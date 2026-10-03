/** How the dice of a roll are written out, wherever a roll is listed. */

import { explodes } from './diceExplosion';
import type { RolledDie } from './diceFormula';

type ListedDie = Pick<RolledDie, 'value' | 'negative' | 'exploded'>;

/** A die's number; one that exploded is marked as in the notation: `6!`. */
function dieValue(rolls: readonly ListedDie[], index: number): string {
  return `${rolls[index]!.value}${explodes(rolls, index) ? '!' : ''}`;
}

/** The dice of a roll as a sum: `6! + 4 + 3`, or `1! − 7` where a die subtracts. */
export function diceSum(rolls: readonly ListedDie[]): string {
  return rolls
    .map((roll, i) => {
      const value = dieValue(rolls, i);
      if (i === 0) return roll.negative ? `−${value}` : value;
      return roll.negative ? ` − ${value}` : ` + ${value}`;
    })
    .join('');
}

/** One die for a list of the dice rolled: `d6: 6!`, and `−d10: 7` for a die an explosion subtracts. */
export function dieLabel(rolls: readonly RolledDie[], index: number): string {
  const roll = rolls[index]!;
  return `${roll.negative && roll.exploded ? '−' : ''}${roll.die}: ${dieValue(rolls, index)}`;
}
