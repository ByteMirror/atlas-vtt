import { describe, expect, it } from 'vitest';
import {
  MAX_DICE, MAX_MODIFIER, MAX_PER_DIE, addDie, clampModifier, removeDie, trayDiceCount, trayFormula, type TrayPool,
} from '../../src/app/react/components/dice/diceTrayPool';

describe('dice tray', () => {
  it('writes the dice in ascending order whatever order they were picked in', () => {
    let pool: TrayPool = {};
    for (const sides of [20, 6, 100, 6] as const) pool = addDie(pool, sides);
    expect(trayFormula(pool, 0)).toBe('2d6 + 1d20 + 1d100');
    expect(trayFormula(pool, 3)).toBe('2d6 + 1d20 + 1d100 + 3');
    expect(trayFormula(pool, -2)).toBe('2d6 + 1d20 + 1d100 - 2');
  });

  it('writes nothing without dice, even with a modifier', () => {
    expect(trayFormula({}, 4)).toBe('');
    expect(trayFormula({ 8: 0 }, 0)).toBe('');
  });

  it('takes dice back one at a time and never below zero', () => {
    const pool = removeDie(removeDie({ 8: 1 }, 8), 8);
    expect(pool[8]).toBe(0);
  });

  it('holds at most 20 of a kind and 100 in all', () => {
    let pool: TrayPool = {};
    for (let i = 0; i < 30; i++) pool = addDie(pool, 6);
    expect(pool[6]).toBe(MAX_PER_DIE);
    for (const sides of [4, 8, 10, 12, 20, 100] as const) for (let i = 0; i < 30; i++) pool = addDie(pool, sides);
    expect(trayDiceCount(pool)).toBe(MAX_DICE);
  });

  it('keeps the modifier within ±20', () => {
    expect(clampModifier(25)).toBe(MAX_MODIFIER);
    expect(clampModifier(-25)).toBe(-MAX_MODIFIER);
  });
});
