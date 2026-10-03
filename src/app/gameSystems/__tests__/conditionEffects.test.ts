import { describe, expect, it } from 'vitest';
import { BUILT_IN_SYSTEM_PRESETS } from '../builtInPresets';
import { conditionEffect } from '../conditionEffects';
import { parseUserPreset } from '../presetValidation';
import { sameSystemRules } from '../systemRules';

const dnd5e = BUILT_IN_SYSTEM_PRESETS.find((preset) => preset.name === 'D&D 5e')!;
const blinded = dnd5e.rules.conditions.find((condition) => condition.name === 'Blinded')!;

describe('a condition whose effect on sight is switched off', () => {
  it('has no effect, also where the built-in condition of its id has one', () => {
    expect(conditionEffect({ id: blinded.id })).toBe('blinded');
    expect(conditionEffect({ id: blinded.id, effect: 'none' })).toBeUndefined();
    expect(conditionEffect({ id: 'own-1', effect: 'none' })).toBeUndefined();
  });

  it('makes the collection\'s rules differ from its preset\'s, and equal again when set back', () => {
    const without = { ...dnd5e.rules, conditions: dnd5e.rules.conditions.map((condition) => (condition.id === blinded.id ? { ...condition, effect: 'none' as const } : condition)) };
    expect(sameSystemRules(dnd5e.rules, without)).toBe(false);
    const back = { ...dnd5e.rules, conditions: dnd5e.rules.conditions.map(({ effect: _effect, ...condition }) => condition) };
    expect(sameSystemRules(dnd5e.rules, back)).toBe(true);
  });

  it('is kept by a user preset', () => {
    const stored = { id: 'user-1', name: 'Homebrew', rules: { gridDefaults: dnd5e.rules.gridDefaults, conditions: [{ ...blinded, effect: 'none' }] } };
    expect(parseUserPreset(stored)?.rules.conditions[0]!.effect).toBe('none');
  });
});
