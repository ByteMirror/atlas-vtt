import type { DiceRollResult } from './DiceTool';

export interface ParsedFormula {
  /** Faces of each die to roll, in formula order: `2d6+d20` is [6, 6, 20]. */
  sides: number[];
  /** Sum of the flat modifiers: `1d20+5-1` is 4. */
  modifiers: number;
}

const DICE_TERM = /(\d+)?d(\d+)/gi;
const MODIFIER_TERM = /[+-]\s*\d+/g;

/** Reads a formula like `2d6+1d8+3` into its dice and flat modifier. */
export function parseDiceFormula(formula: string): ParsedFormula {
  const sides: number[] = [];
  for (const match of formula.matchAll(DICE_TERM)) {
    const count = parseInt(match[1] || '1', 10);
    const faces = parseInt(match[2] || '6', 10);
    for (let i = 0; i < count; i++) sides.push(faces);
  }

  // Dice terms go first, so the count of `+2d8` is never read as a modifier.
  const rest = formula.replace(DICE_TERM, '');
  const modifiers = (rest.match(MODIFIER_TERM) ?? [])
    .reduce((sum, term) => sum + parseInt(term.replace(/\s/g, ''), 10), 0);

  return { sides, modifiers };
}

export function rollRandomDie(sides: number): number {
  return Math.floor(Math.random() * sides) + 1;
}

/** A roll result from dice values already known, one per entry of `sides`. */
export function buildRollResult(formula: string, parsed: ParsedFormula, values: readonly number[]): DiceRollResult {
  const rolls = parsed.sides.map((max, i) => ({ die: `d${max}`, value: values[i] ?? 0, max }));
  const diceTotal = rolls.reduce((sum, roll) => sum + roll.value, 0);
  return {
    id: `roll_${Date.now()}_${Math.random().toString(36).slice(2, 11)}`,
    timestamp: Date.now(),
    formula,
    rolls,
    modifiers: parsed.modifiers,
    total: diceTotal + parsed.modifiers,
    player: 'Player', // TODO: Get actual player name from session
  };
}
