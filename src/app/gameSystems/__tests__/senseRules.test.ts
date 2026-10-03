import { describe, expect, it } from 'vitest';
import { BUILT_IN_SYSTEM_PRESETS } from '../builtInPresets';
import { BUILT_IN_SENSES, GENERIC_SENSES, NORMAL_SIGHT } from '../senses';
import { collectionSenses, findSense, perceivedLevel, sameSenses, senseWithRole } from '../senseRules';
import type { LightLevel, SenseDefinition } from '../../types/senseTypes';

const preset = (name: string): (typeof BUILT_IN_SYSTEM_PRESETS)[number] => BUILT_IN_SYSTEM_PRESETS.find((candidate) => candidate.name === name)!;
const dnd5e = preset('D&D 5e');
const cairn = preset('Cairn');
const shadowdark = preset('Shadowdark');
const DND_SENSES = BUILT_IN_SENSES[dnd5e.id]!;

const homebrew: SenseDefinition = {
  id: 'home-1', name: 'Witch sight', description: 'Sees in the dark within its range.', lineOfSight: true,
  sees: { bright: 'normal', dim: 'normal', dark: 'as-dim', magicalDark: 'none' }, look: 'colour', reveals: 'all', precise: true,
  seesInvisible: false, worksWhileBlinded: false, range: 'required',
};

describe('collectionSenses', () => {
  it('are the collection\'s own when it has any, even an empty list', () => {
    expect(collectionSenses({ senses: [homebrew], systemPresetId: dnd5e.id }, BUILT_IN_SYSTEM_PRESETS)).toEqual([homebrew]);
    expect(collectionSenses({ senses: [], systemPresetId: dnd5e.id }, BUILT_IN_SYSTEM_PRESETS)).toEqual([]);
  });

  it('are those of its recorded preset otherwise', () => {
    expect(collectionSenses({ systemPresetId: dnd5e.id }, BUILT_IN_SYSTEM_PRESETS)).toBe(dnd5e.rules.senses);
    expect(collectionSenses({ systemPresetId: shadowdark.id }, BUILT_IN_SYSTEM_PRESETS).map((sense) => sense.id)).toEqual(['shadowdark-darkness-adapted']);
  });

  it('are the generic set without a system, with a system that has none, and with a preset that is gone', () => {
    expect(collectionSenses({}, BUILT_IN_SYSTEM_PRESETS)).toBe(GENERIC_SENSES);
    expect(collectionSenses({ systemPresetId: cairn.id }, BUILT_IN_SYSTEM_PRESETS)).toBe(GENERIC_SENSES);
    expect(collectionSenses({ systemPresetId: 'deleted' }, BUILT_IN_SYSTEM_PRESETS)).toBe(GENERIC_SENSES);
  });
});

describe('findSense', () => {
  it('finds the collection\'s sense, else the generic one of that id', () => {
    expect(findSense(DND_SENSES, 'dnd5e-truesight')?.name).toBe('Truesight');
    expect(findSense(DND_SENSES, 'blindsight')).toBe(GENERIC_SENSES.find((sense) => sense.id === 'blindsight'));
    expect(findSense([{ ...homebrew, id: 'darkvision' }], 'darkvision')?.name).toBe('Witch sight');
  });

  it('knows no other system\'s senses and no made-up ids', () => {
    expect(findSense(DND_SENSES, 'pathfinder2e-scent')).toBeUndefined();
    expect(findSense(DND_SENSES, 'sight')).toBeUndefined();
    expect(findSense([], '')).toBeUndefined();
  });
});

describe('senseWithRole', () => {
  it('is the collection\'s darkvision or tremorsense where it has one', () => {
    expect(senseWithRole(DND_SENSES, 'darkvision').id).toBe('dnd5e-darkvision');
    expect(senseWithRole(DND_SENSES, 'tremorsense').id).toBe('dnd5e-tremorsense');
    expect(senseWithRole(BUILT_IN_SENSES['builtin:ose']!, 'darkvision').id).toBe('ose-infravision');
  });

  it('is the generic one where the collection has none', () => {
    expect(senseWithRole(BUILT_IN_SENSES[shadowdark.id]!, 'darkvision').id).toBe('darkvision');
    expect(senseWithRole(BUILT_IN_SENSES['builtin:ose']!, 'tremorsense').id).toBe('tremorsense');
    expect(senseWithRole([], 'darkvision').id).toBe('darkvision');
  });
});

describe('sameSenses', () => {
  it('compares every field of every sense, in order', () => {
    expect(sameSenses(DND_SENSES, structuredClone(DND_SENSES))).toBe(true);
    expect(sameSenses(DND_SENSES, [...DND_SENSES].reverse())).toBe(false);
    expect(sameSenses(DND_SENSES, DND_SENSES.slice(1))).toBe(false);
    const changes: Partial<SenseDefinition>[] = [
      { id: 'other' }, { name: 'Other' }, { description: 'Other.' }, { lineOfSight: false }, { reveals: 'creatures' }, { precise: false },
      { seesInvisible: true }, { worksWhileBlinded: true }, { range: 'optional' }, { defaultRange: 30 }, { ignores: 'airborne' },
      { look: 'heat' }, { role: 'darkvision' }, { grants: 'see-invisible' }, { sees: { ...homebrew.sees, dim: 'as-bright' } }, { sees: { ...homebrew.sees, magicalDark: 'as-dim' } },
    ];
    for (const change of changes) expect(sameSenses([homebrew], [{ ...homebrew, ...change }])).toBe(false);
    expect(sameSenses([homebrew], [{ ...homebrew, sees: { ...homebrew.sees } }])).toBe(true);
  });

  it('reads no senses as the generic set, as a collection does', () => {
    expect(sameSenses(undefined, undefined)).toBe(true);
    expect(sameSenses(undefined, GENERIC_SENSES)).toBe(true);
    expect(sameSenses(undefined, [])).toBe(false);
    expect(sameSenses(undefined, DND_SENSES)).toBe(false);
  });
});

describe('perceivedLevel', () => {
  const LEVELS: readonly LightLevel[] = ['bright', 'dim', 'dark', 'magical-dark'];
  const perceived = (id: string): (string | null)[] => {
    const sense = [NORMAL_SIGHT, ...GENERIC_SENSES, ...Object.values(BUILT_IN_SENSES).flat()].find((candidate) => candidate.id === id)!;
    return LEVELS.map((level) => perceivedLevel(sense, level));
  };

  it.each([
    ['normal sight sees bright and dim light as they are and nothing in darkness', 'sight', ['bright', 'dim', null, null]],
    ['D&D 5e darkvision sees dim light as bright and darkness as dim, but not magical darkness', 'dnd5e-darkvision', ['bright', 'bright', 'dim', null]],
    ['D&D 5e blindsight perceives the same in every light', 'dnd5e-blindsight', ['bright', 'bright', 'bright', 'bright']],
    ['D&D 5e truesight sees in normal and magical darkness', 'dnd5e-truesight', ['bright', 'bright', 'bright', 'bright']],
    ['D&D 5e devil\'s sight sees normally in dim light and in darkness, magical or not', 'dnd5e-devils-sight', ['bright', 'bright', 'bright', 'bright']],
    ['Pathfinder low-light vision sees dim light as bright and nothing in darkness', 'pathfinder2e-low-light-vision', ['bright', 'bright', null, null]],
    ['Pathfinder darkvision sees perfectly well in darkness and barely through magical darkness', 'pathfinder2e-darkvision', ['bright', 'bright', 'bright', 'dim']],
    ['a sense that only lets the eyes see invisible things perceives nothing by itself', 'dnd5e-see-invisibility', [null, null, null, null]],
    ['Pathfinder greater darkvision sees through magical darkness too', 'pathfinder2e-greater-darkvision', ['bright', 'bright', 'bright', 'bright']],
    ['Old-School Essentials infravision works only in darkness', 'ose-infravision', [null, null, 'dim', null]],
    ['Shadowdark\'s darkness-adapted beings see in light and darkness', 'shadowdark-darkness-adapted', ['bright', 'bright', 'bright', null]],
    ['the generic darkvision sees darkness as dim and leaves dim light as it is, as darkvision did before senses', 'darkvision', ['bright', 'dim', 'dim', null]],
  ])('%s', (_rule, id, expected) => {
    expect(perceived(id)).toEqual(expected);
  });
});
