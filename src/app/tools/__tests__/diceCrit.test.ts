import { describe, it, expect } from 'vitest';
import { getDiceCrit } from '../diceCrit';
import type { DiceRollResult } from '../DiceTool';

function roll(rolls: DiceRollResult['rolls'], modifiers = 0): DiceRollResult {
  const total = rolls.reduce((sum, r) => sum + r.value, 0) + modifiers;
  return { id: 'r', timestamp: 0, formula: '', rolls, modifiers, total };
}

describe('getDiceCrit', () => {
  it('is high for a natural 20 on a d20', () => {
    expect(getDiceCrit(roll([{ die: 'd20', value: 20, max: 20 }]))).toBe('high');
  });

  it('is low for a total of 1', () => {
    expect(getDiceCrit(roll([{ die: 'd20', value: 1, max: 20 }]))).toBe('low');
  });

  it('is null for a maxed damage die and for a 20 reached through modifiers', () => {
    expect(getDiceCrit(roll([{ die: 'd6', value: 6, max: 6 }]))).toBeNull();
    expect(getDiceCrit(roll([{ die: 'd20', value: 15, max: 20 }], 5))).toBeNull();
  });
});
