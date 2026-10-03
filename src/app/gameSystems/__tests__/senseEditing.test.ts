import { describe, expect, it } from 'vitest';
import { BUILT_IN_SYSTEM_PRESETS } from '../builtInPresets';
import {
  describeSense,
  editedSenses,
  isBuiltInSense,
  newSense,
  senseKind,
  senseProblem,
  senseSummary,
  sensesAreValid,
  takesRange,
  withSenseKind,
} from '../senseEditing';
import { senseWithRole } from '../senseRules';
import { granting } from '../senses/senseHelpers';
import { GENERIC_SENSES } from '../senses/generic';
import type { SenseDefinition } from '../../types/senseTypes';

const dnd5e = BUILT_IN_SYSTEM_PRESETS.find((preset) => preset.name === 'D&D 5e')!.rules.senses!;
const darkvision = senseWithRole(dnd5e, 'darkvision');
const tremorsense = senseWithRole(dnd5e, 'tremorsense');
const witchSight: SenseDefinition = { ...newSense('home-1'), name: 'Witch sight' };

describe('newSense', () => {
  it('starts as a way of seeing in the dark that needs a range, without a name', () => {
    expect(newSense('home-1')).toEqual({
      id: 'home-1', name: '', description: '', lineOfSight: true,
      sees: { bright: 'normal', dim: 'normal', dark: 'as-dim', magicalDark: 'none' },
      look: 'monochrome', reveals: 'all', precise: true, seesInvisible: false, worksWhileBlinded: false, range: 'required',
    });
  });
});

describe('isBuiltInSense', () => {
  it('is true for the senses Atlas ships, of a game system or generic', () => {
    for (const sense of [...dnd5e, ...GENERIC_SENSES]) expect(isBuiltInSense(sense)).toBe(true);
  });

  it('is false for a sense of the collection\'s own, and for a shipped one that was changed', () => {
    expect(isBuiltInSense(witchSight)).toBe(false);
    expect(isBuiltInSense({ ...darkvision, defaultRange: 90 })).toBe(false);
  });
});

describe('senseProblem', () => {
  it('asks for a name', () => {
    expect(senseProblem(newSense('home-1'), dnd5e)).toBe('Give the sense a name.');
    expect(senseProblem({ ...witchSight, name: '   ' }, dnd5e)).toBe('Give the sense a name.');
  });

  it('refuses the name of another sense of the collection, whatever its case', () => {
    const all = [...dnd5e, witchSight];
    expect(senseProblem({ ...witchSight, name: ' darkvision ' }, all)).toBe('Another sense has this name.');
    expect(senseProblem(witchSight, all)).toBeNull();
  });

  it('refuses a sense that perceives nothing in any light', () => {
    const blind = { ...witchSight, sees: { bright: 'none', dim: 'none', dark: 'none', magicalDark: 'none' } } as const;
    expect(senseProblem(blind, [blind])).toBe('Choose a light the sense works in.');
    expect(senseProblem(withSenseKind(blind, 'see-invisible'), [blind])).toBeNull();
  });
});

describe('sensesAreValid', () => {
  it('is true for the senses Atlas ships and for complete senses of the collection\'s own', () => {
    expect(sensesAreValid([...dnd5e, witchSight])).toBe(true);
    expect(sensesAreValid([])).toBe(true);
  });

  it('is false as soon as one of the collection\'s own has no name or another\'s name', () => {
    expect(sensesAreValid([...dnd5e, newSense('home-2')])).toBe(false);
    expect(sensesAreValid([...dnd5e, { ...witchSight, name: 'Darkvision' }])).toBe(false);
  });
});

describe('describeSense', () => {
  it('says what a way of seeing does in dim light and darkness, how it looks and that it has a range', () => {
    expect(describeSense(witchSight)).toBe('Sees in darkness as dim light, in grey, within its range.');
    expect(describeSense(darkvision)).toBe('Sees in dim light as bright light and in darkness as dim light, in grey, within its range.');
  });

  it('says what a sense without a range and without darkness sees', () => {
    const lowLight: SenseDefinition = { ...witchSight, sees: { bright: 'normal', dim: 'as-bright', dark: 'none', magicalDark: 'none' }, range: 'unlimited' };
    expect(describeSense(lowLight)).toBe('Sees in dim light as bright light.');
    expect(describeSense({ ...lowLight, sees: { ...lowLight.sees, dim: 'normal' } })).toBe('Sees what is lit.');
  });

  it('says that a sense feels creatures through walls and shows them as outlines', () => {
    expect(describeSense(tremorsense)).toBe('Senses creatures within its range, through walls, invisible ones too. Works while blinded. They show as outlines.');
  });

  it('names a modifier by what it adds to sight', () => {
    expect(describeSense(withSenseKind(witchSight, 'see-invisible'))).toBe('Lets the token\'s sight see invisible creatures.');
  });

  it('is what the list shows for a sense without a description of its own', () => {
    expect(senseSummary(darkvision)).toBe(darkvision.description);
    expect(senseSummary(witchSight)).toBe(describeSense(witchSight));
  });
});

describe('the kind of a sense', () => {
  it('is a sense unless it only lets sight see invisible creatures', () => {
    expect(senseKind(witchSight)).toBe('sense');
    const modifier = withSenseKind({ ...witchSight, defaultRange: 60 }, 'see-invisible');
    expect(senseKind(modifier)).toBe('see-invisible');
    expect(modifier).toEqual({ id: witchSight.id, name: 'Witch sight', description: '', ...granting('see-invisible') });
    expect(withSenseKind(modifier, 'see-invisible')).toBe(modifier);
  });

  it('starts a modifier that becomes a sense as a new sense, with its name', () => {
    const modifier = withSenseKind(witchSight, 'see-invisible');
    expect(withSenseKind(modifier, 'sense')).toEqual({ ...newSense(witchSight.id), name: 'Witch sight' });
  });

  it('counts the modifiers Atlas ships as its own', () => {
    const shipped = BUILT_IN_SYSTEM_PRESETS.flatMap((preset) => preset.rules.senses ?? []).filter((sense) => sense.grants);
    expect(shipped.length).toBeGreaterThan(0);
    for (const sense of shipped) expect(isBuiltInSense(sense)).toBe(true);
  });

  it('decides whether a token gives the sense a distance', () => {
    expect(takesRange(darkvision)).toBe(true);
    expect(takesRange({ ...witchSight, range: 'optional' })).toBe(true);
    expect(takesRange({ ...witchSight, range: 'unlimited' })).toBe(false);
    expect(takesRange(withSenseKind(witchSight, 'see-invisible'))).toBe(false);
  });
});

describe('editedSenses', () => {
  it('is the list once it differs from the system\'s, and nothing while it is the same', () => {
    expect(editedSenses([...dnd5e, witchSight], dnd5e)).toEqual([...dnd5e, witchSight]);
    expect(editedSenses([...dnd5e], dnd5e)).toBeUndefined();
    expect(editedSenses([...GENERIC_SENSES], undefined)).toBeUndefined();
  });
});
