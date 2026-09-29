import { describe, expect, it } from 'vitest';
import { buildRollResult, parseDiceFormula } from '../../src/app/tools/diceFormula';
import { readTableDice, tableDiceFor } from '../../src/app/physical-dice/physicalDiceValues';

describe('parseDiceFormula', () => {
  it('reads every die and the flat modifier', () => {
    expect(parseDiceFormula('2d6+1d20+3')).toEqual({ sides: [6, 6, 20], modifiers: 3 });
    expect(parseDiceFormula('d20 - 2')).toEqual({ sides: [20], modifiers: -2 });
  });

  it('never reads the count of a later dice term as a modifier', () => {
    expect(parseDiceFormula('d6+2d8')).toEqual({ sides: [6, 8, 8], modifiers: 0 });
  });
});

describe('buildRollResult', () => {
  it('totals the given values and the modifier', () => {
    const parsed = parseDiceFormula('2d6+1');
    const result = buildRollResult('2d6+1', parsed, [3, 5]);
    expect(result.rolls).toEqual([{ die: 'd6', value: 3, max: 6 }, { die: 'd6', value: 5, max: 6 }]);
    expect(result.total).toBe(9);
  });
});

describe('physical dice values', () => {
  it('throws a percentile die as the tens die and a d10', () => {
    expect(tableDiceFor(100)).toEqual(['d100', 'd10']);
    expect(tableDiceFor(20)).toEqual(['d20']);
    expect(tableDiceFor(3)).toBeNull();
  });

  it('reads a d10 zero as 10', () => {
    expect(readTableDice(10, [0])).toBe(10);
    expect(readTableDice(10, [7])).toBe(7);
  });

  it('reads percentile dice as tens plus ones, with 00 and 0 as 100', () => {
    expect(readTableDice(100, [40, 7])).toBe(47);
    expect(readTableDice(100, [0, 5])).toBe(5);
    expect(readTableDice(100, [90, 0])).toBe(90);
    expect(readTableDice(100, [0, 0])).toBe(100);
  });
});
