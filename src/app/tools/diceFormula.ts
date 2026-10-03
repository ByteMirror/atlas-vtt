/**
 * Parses and rolls dice formulas such as `2d6+3`, `d20+2d6` or `2d6-1d4`.
 * Every term carries its own sign, so the `+2` of `+2d6` is a dice count and
 * never a modifier, and subtracted dice subtract.
 *
 * A dice term may explode (`diceExplosion.ts`): by its own notation, written
 * as Obsidian's Dice Roller writes it since statblocks use that (`2d6!` once,
 * `2d6!3` up to three times, `2d6!i` again and again; `!!` reads the same), or
 * by the collection's rule.
 */

import { parseDefaultRoll } from '../gameSystems/diceRules';
import type { DiceRules, ExplodeRule } from '../types/diceRulesTypes';
import { MAX_EXPLOSIONS, rollExplosions, rollFace, type Explosion } from './diceExplosion';

export interface RolledDie {
  /** e.g. `d20`. */
  die: string;
  value: number;
  max: number;
  /** The die subtracts: it belongs to a subtracted term, e.g. the d4 of `2d6-1d4`, or to an explosion downwards. */
  negative?: true;
  /** The die was rolled because the die before it exploded. */
  exploded?: true;
}

export interface RolledFormula {
  rolls: RolledDie[];
  modifiers: number;
  total: number;
}

const TERM = /([+-]?)\s*(?:(\d*)d(\d+)(?:!{1,2}(i|\d+)?)?|(\d+))/gi;

/** Whether the formula names any dice; a bare `+3` does not. */
export function hasDiceTerm(formula: string): boolean {
  return /\d*d\d+/i.test(formula);
}

/** How a term explodes by its own notation: once, `times` times, or again and again (`i`). */
function notedExplosion(times: string | undefined): Explosion {
  const limit = times === 'i' ? MAX_EXPLOSIONS : Number(times ?? '1');
  return { highFaces: 1, lowFaces: 0, limit };
}

/** How the collection's rule explodes a die it applies to. */
function ruledExplosion({ repeats, highFaces, lowFaces }: ExplodeRule): Explosion {
  return { highFaces, lowFaces, limit: repeats ? MAX_EXPLOSIONS : 1 };
}

/**
 * Rolls every dice term of the formula and adds up the result. Dice with fewer
 * than two sides are skipped. `rules` are the collection's: its exploding rule
 * and the default roll that says which dice a default-dice rule means, the
 * first added dice of its size, as many as it rolls (as for criticals).
 */
export function rollFormula(
  formula: string,
  random: () => number = Math.random,
  rules?: Pick<DiceRules, 'defaultRoll' | 'explode'>,
): RolledFormula {
  const rolls: RolledDie[] = [];
  let modifiers = 0;
  const explode = rules?.explode;
  const defaultRoll = explode?.dice === 'default' ? parseDefaultRoll(rules?.defaultRoll ?? '') : null;
  let defaultDiceLeft = defaultRoll?.count ?? 0;

  for (const [term, sign, count, sides, times, constant] of formula.matchAll(TERM)) {
    const factor = sign === '-' ? -1 : 1;
    if (constant !== undefined) {
      modifiers += factor * Number(constant);
      continue;
    }
    const faces = Number(sides);
    if (faces < 2) continue;
    const noted = term.includes('!') ? notedExplosion(times) : null;
    for (let i = 0; i < Number(count || '1'); i++) {
      const die: RolledDie = {
        die: `d${faces}`,
        value: rollFace(faces, random),
        max: faces,
        ...(factor < 0 && { negative: true as const }),
      };
      rolls.push(die);

      const isDefaultDie = factor > 0 && faces === defaultRoll?.sides && defaultDiceLeft > 0;
      if (isDefaultDie) defaultDiceLeft -= 1;
      const ruled = explode && (explode.dice === 'all' || isDefaultDie) ? ruledExplosion(explode) : null;
      const explosion = noted ?? ruled;
      if (explosion) rolls.push(...rollExplosions(die, explosion, random));
    }
  }

  const dice = rolls.reduce((sum, die) => sum + (die.negative ? -die.value : die.value), 0);
  return { rolls, modifiers, total: dice + modifiers };
}
