import { describe, expect, it } from 'vitest';
import { parseResourceDefinition, sameResourceDefinitions } from '../../../src/app/resources/resourceDefinitions';
import { slottedResources } from '../../../src/app/resources/resourceSlots';
import { visibleResources } from '../../../src/app/resources/visibleResources';
import { AMMO, HP, STR } from '../../mocks/resourceFixtures';

const LUCK = { ...AMMO, key: 'luck', name: 'Luck', field: 'luck' };
const places = (definitions: Parameters<typeof slottedResources>[0]): Array<[string, number]> =>
  slottedResources(definitions).map(({ definition, slot }) => [definition.key, slot]);

describe('the socket of a resource', () => {
  it('is its place in the list where none is stored, as for presets and older lists', () => {
    expect(places([HP, STR, AMMO])).toEqual([['hp', 0], ['str', 1], ['ammo', 2]]);
  });

  it('is the stored one, with the others filling the free sockets in list order', () => {
    expect(places([{ ...LUCK, slot: 5 }, HP, { ...AMMO, slot: 0 }, STR])).toEqual([['ammo', 0], ['hp', 1], ['str', 2], ['luck', 5]]);
  });

  it('gives the first free socket to a resource whose stored one is taken or is no socket', () => {
    expect(places([{ ...HP, slot: 3 }, { ...STR, slot: 3 }, { ...AMMO, slot: 9 }, { ...LUCK, slot: 1.5 }]))
      .toEqual([['str', 0], ['ammo', 1], ['luck', 2], ['hp', 3]]);
  });

  it('leaves out what has no socket left', () => {
    const seven = ['a', 'b', 'c', 'd', 'e', 'f', 'g'].map((key) => ({ ...AMMO, key }));
    expect(places(seven).map(([key]) => key)).toEqual(['a', 'b', 'c', 'd', 'e', 'f']);
  });

  it('is read from a stored definition only when it is one', () => {
    const stored = { key: 'luck', name: 'Luck', field: 'luck', direction: 'drains', color: '#3898ec', visibleToPlayers: false };
    expect(parseResourceDefinition({ ...stored, slot: 4 })?.slot).toBe(4);
    expect(parseResourceDefinition(stored)).not.toHaveProperty('slot');
    expect(parseResourceDefinition({ ...stored, slot: 6 })).not.toHaveProperty('slot');
    expect(parseResourceDefinition({ ...stored, slot: '2' })).not.toHaveProperty('slot');
  });

  it('is part of what makes two lists the same: a moved resource is an edit', () => {
    expect(sameResourceDefinitions([HP, STR], [{ ...HP, slot: 0 }, { ...STR, slot: 1 }])).toBe(true);
    expect(sameResourceDefinitions([HP, STR], [{ ...STR, slot: 1 }, { ...HP, slot: 0 }])).toBe(true);
    expect(sameResourceDefinitions([HP, STR], [HP, { ...STR, slot: 4 }])).toBe(false);
  });

  it('decides where a token shows the resource', () => {
    const holder = { resources: { hp: { current: 3, max: 8 }, luck: { current: 1, max: 2 } } };
    expect(visibleResources(holder, [HP, { ...LUCK, slot: 5 }], 'dm').map((r) => [r.definition.key, r.slot])).toEqual([['hp', 0], ['luck', 5]]);
  });
});
