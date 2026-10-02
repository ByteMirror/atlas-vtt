import { describe, expect, it } from 'vitest';
import {
  abilityScores,
  parseSaves,
} from '../../src/app/react/components/statblock/abilityScores';

describe('parseSaves', () => {
  it('reads the comma-separated string form', () => {
    expect(parseSaves('Dex +6, Wis +6, Con +9')).toEqual({ dex: 6, wis: 6, con: 9 });
  });

  it('reads an array of one-key objects, keyed by full ability name', () => {
    expect(parseSaves([{ dexterity: 6 }, { wisdom: '+6' }])).toEqual({ dex: 6, wis: 6 });
  });

  it('reads a single object', () => {
    expect(parseSaves({ con: 9, cha: -1 })).toEqual({ con: 9, cha: -1 });
  });

  it('ignores keys that name no ability', () => {
    expect(parseSaves('Perception +10, Dex +6')).toEqual({ dex: 6 });
  });

  it('is empty for a creature with no saves', () => {
    expect(parseSaves(undefined)).toEqual({});
    expect(parseSaves('')).toEqual({});
  });
});

describe('abilityScores', () => {
  const aboleth = {
    name: 'Aboleth',
    stats: [21, 9, 15, 18, 15, 18],
    saves: ['Dex +5', 'Int +8', 'Wis +6'],
  };

  it('reads the six scores from `stats`, in order', () => {
    expect(abilityScores(aboleth)?.map((score) => [score.label, score.score])).toEqual([
      ['STR', 21],
      ['DEX', 9],
      ['CON', 15],
      ['INT', 18],
      ['WIS', 15],
      ['CHA', 18],
    ]);
  });

  it('carries the declared saving throws and leaves the rest unproficient', () => {
    const scores = abilityScores(aboleth) ?? [];
    expect(scores.find((score) => score.key === 'int')?.save).toBe(8);
    expect(scores.find((score) => score.key === 'str')?.save).toBeNull();
  });

  it('falls back to the spelled-out properties when there is no `stats` array', () => {
    const scores = abilityScores({
      strength: 10,
      dexterity: 12,
      constitution: 14,
      intelligence: 8,
      wisdom: 13,
      charisma: 11,
    });
    expect(scores?.map((score) => score.score)).toEqual([10, 12, 14, 8, 13, 11]);
  });

  it('reads scores written as strings', () => {
    expect(abilityScores({ stats: ['21', '9', '15', '18', '15', '18'] })?.[0]?.score).toBe(21);
  });

  it('is null for a creature from a system without ability scores', () => {
    expect(abilityScores({ name: 'Adversary', difficulty: 14 })).toBeNull();
  });

  it('is null when `stats` holds fewer than six scores', () => {
    expect(abilityScores({ stats: [21, 9, 15] })).toBeNull();
  });
});
