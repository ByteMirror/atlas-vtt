import { describe, expect, it } from 'vitest';
import { buildResourceUpdates, statblockResourceDefaults } from '../../src/app/pixi/token-renderer/tokenResourceEdits';

describe('buildResourceUpdates', () => {
  it('sets resources on a token without a statblock', () => {
    expect(buildResourceUpdates({}, { maxHp: 12, maxStress: 4 }, {})).toEqual({
      hp: { current: 12, max: 12 },
      maxHpOverridden: true,
      stress: 0,
      maxStress: 4,
      maxStressOverridden: true,
    });
  });

  it('clears resources when inputs are empty and there is no default', () => {
    const updates = buildResourceUpdates({ hp: { current: 3, max: 10 }, stress: 2, maxStress: 5 }, { maxHp: undefined, maxStress: undefined }, {});
    expect(updates).toEqual({ hp: undefined, maxHpOverridden: undefined, stress: undefined, maxStress: undefined, maxStressOverridden: undefined });
  });

  it('keeps current values and clamps them to the new max', () => {
    const updates = buildResourceUpdates({ hp: { current: 8, max: 10 }, stress: 5, maxStress: 6 }, { maxHp: 5, maxStress: 3 }, {});
    expect(updates.hp).toEqual({ current: 5, max: 5 });
    expect(updates.stress).toBe(3);
  });

  it('follows the statblock default without marking an override', () => {
    const defaults = { maxHp: 20, maxStress: 6 };
    const cleared = buildResourceUpdates({ hp: { current: 7, max: 30 }, stress: 1, maxStress: 9 }, { maxHp: undefined, maxStress: undefined }, defaults);
    expect(cleared).toEqual({ hp: { current: 7, max: 20 }, maxHpOverridden: undefined, stress: 1, maxStress: 6, maxStressOverridden: undefined });

    const typedDefault = buildResourceUpdates({ hp: { current: 7, max: 30 } }, { maxHp: 20, maxStress: 6 }, defaults);
    expect(typedDefault.maxHpOverridden).toBeUndefined();
    expect(typedDefault.maxStressOverridden).toBeUndefined();
  });

  it('marks an override when the value differs from the statblock default', () => {
    const updates = buildResourceUpdates({ hp: { current: 7, max: 20 } }, { maxHp: 25, maxStress: undefined }, { maxHp: 20 });
    expect(updates.hp).toEqual({ current: 7, max: 25 });
    expect(updates.maxHpOverridden).toBe(true);
  });
});

describe('statblockResourceDefaults', () => {
  it('reads max HP and max stress from statblock vitals', () => {
    expect(statblockResourceDefaults({ hp: { current: 10, max: 20 }, maxStress: 6 })).toEqual({ maxHp: 20, maxStress: 6 });
    expect(statblockResourceDefaults({ hp: { current: 10 } })).toEqual({ maxHp: 10 });
    expect(statblockResourceDefaults({})).toEqual({});
  });
});
