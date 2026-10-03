import { afterEach, describe, expect, it, vi } from 'vitest';
import { BUILT_IN_SENSES } from '../../gameSystems/senses';
import type { GameUnit } from '../../grid/statedDistance';
import type { TokenVision } from '../../types/lightingTypes';
import type { SenseDefinition, TokenSense } from '../../types/senseTypes';
import * as parser from '../parseSenses';
import { creatureSenses, effectiveSenses, effectiveVision, inheritedSensesOf, type SensedCreature } from '../creatureSenses';
import { sensesTextOf } from '../sensesText';

const FEET: GameUnit = { unitType: 'feet', unitDistance: 5 };
const METRES: GameUnit = { unitType: 'meters', unitDistance: 1.5 };
const DND = BUILT_IN_SENSES['builtin:dnd5e']!;
const PATHFINDER = BUILT_IN_SENSES['builtin:pathfinder2e']!;

const NOTE = 'Bestiary/Goblin.md';

function creature(fields: Record<string, unknown>): SensedCreature {
  return { fields };
}

function token(vision?: TokenVision, statblockPath: string | null = NOTE): { vision?: TokenVision; statblockPath?: string } {
  return { ...(vision && { vision }), ...(statblockPath && { statblockPath }) };
}

function named(senses: readonly TokenSense[], definitions: readonly SenseDefinition[] = DND): Array<[string, number?]> {
  return senses.map((sense) => {
    const name = definitions.find((definition) => definition.id === sense.id)?.name ?? `? ${sense.id}`;
    return sense.range === undefined ? [name] : [name, sense.range];
  });
}

function sense(name: string, range?: number, definitions: readonly SenseDefinition[] = DND): TokenSense {
  const id = definitions.find((definition) => definition.name === name)!.id;
  return range === undefined ? { id } : { id, range };
}

const GOBLIN = creature({ name: 'Goblin', senses: 'darkvision 60 ft., passive Perception 9' });
const GRIMLOCK = creature({ senses: 'blindsight 30 ft. or 10 ft. while deafened (blind beyond this radius), passive Perception 13' });

afterEach(() => vi.restoreAllMocks());

describe('sensesTextOf', () => {
  it('is the senses line of a statblock, from frontmatter, a fence or the bestiary alike', () => {
    expect(sensesTextOf({ senses: 'darkvision 60 ft., passive Perception 9' })).toBe('darkvision 60 ft., passive Perception 9');
  });

  it('joins a list of senses', () => {
    expect(sensesTextOf({ senses: ['darkvision 60 ft.', 'passive Perception 9'] })).toBe('darkvision 60 ft., passive Perception 9');
    expect(sensesTextOf({ senses: [{ name: 'Darkvision', desc: '60 ft.' }, { name: 'scent (imprecise)', desc: '30 feet' }] }))
      .toBe('Darkvision 60 ft., scent (imprecise) 30 feet');
  });

  it('reads senses kept by name', () => {
    expect(sensesTextOf({ senses: { darkvision: '120 ft.', blindsight: 60, low_light_vision: true, passive_perception: 20, tremorsense: null } }))
      .toBe('darkvision 120 ft., blindsight 60, low light vision, passive perception 20');
  });

  it('takes the senses after the modifier of a Pathfinder perception line', () => {
    expect(sensesTextOf({ perception: [{ name: 'Perception', desc: '+7; low-light vision, scent (imprecise) 30 feet' }] }))
      .toBe('low-light vision, scent (imprecise) 30 feet');
    expect(sensesTextOf({ perception: 'Perception +2; darkvision' })).toBe('darkvision');
    expect(sensesTextOf({ perception: [{ name: 'Perception', desc: '+5' }] })).toBeNull();
    expect(sensesTextOf({ modifier: 7, senses: 'low-light vision', perception: [{ name: 'Perception', desc: '+7; darkvision' }] })).toBe('low-light vision');
  });

  it('is null for a statblock without senses', () => {
    for (const fields of [{}, { senses: '' }, { senses: '  ' }, { senses: [] }, { senses: null }, { senses: 12 }, { senses: {} }, { experience: 'Keen Senses +3' }]) {
      expect(sensesTextOf(fields)).toBeNull();
    }
  });
});

describe('creatureSenses', () => {
  it('parses the creature\'s senses line with the collection\'s senses and unit', () => {
    expect(named(creatureSenses(GOBLIN, DND, FEET).senses)).toEqual([['Darkvision', 60]]);
    expect(named(creatureSenses(GOBLIN, DND, METRES).senses)).toEqual([['Darkvision', 18]]);
    expect(named(creatureSenses(creature({ perception: [{ name: 'Perception', desc: '+7; low-light vision, scent (imprecise) 30 feet' }] }), PATHFINDER, FEET).senses, PATHFINDER))
      .toEqual([['Low-light vision'], ['Scent', 30]]);
  });

  it('has nothing for a creature that is missing, unread, or without a senses line', () => {
    for (const record of [null, undefined, creature({ name: 'Bear' })]) {
      expect(creatureSenses(record, DND, FEET)).toEqual({ senses: [], unknown: [] });
    }
  });

  it('parses a creature record once for the same senses and unit', () => {
    const parse = vi.spyOn(parser, 'parseSenses');
    const record = creature({ senses: 'darkvision 60 ft.' });
    const first = creatureSenses(record, DND, FEET);
    expect(creatureSenses(record, DND, FEET)).toBe(first);
    expect(creatureSenses(record, [...DND], { ...FEET })).toBe(first);
    expect(parse).toHaveBeenCalledTimes(1);
  });

  it('parses again when the record is replaced, as the index does after a note edit', () => {
    const parse = vi.spyOn(parser, 'parseSenses');
    const before = creature({ senses: 'darkvision 60 ft.' });
    const after = creature({ senses: 'darkvision 120 ft.' });
    expect(named(creatureSenses(before, DND, FEET).senses)).toEqual([['Darkvision', 60]]);
    expect(named(creatureSenses(after, DND, FEET).senses)).toEqual([['Darkvision', 120]]);
    expect(parse).toHaveBeenCalledTimes(2);
  });

  it('parses again when the collection\'s senses or its unit change', () => {
    const parse = vi.spyOn(parser, 'parseSenses');
    const record = creature({ senses: 'darkvision 60 ft., scent 30 ft.' });
    expect(named(creatureSenses(record, DND, FEET).senses)).toEqual([['Darkvision', 60]]);
    expect(named(creatureSenses(record, PATHFINDER, FEET).senses, PATHFINDER)).toEqual([['Darkvision', 60], ['Scent', 30]]);
    expect(named(creatureSenses(record, PATHFINDER, METRES).senses, PATHFINDER)).toEqual([['Darkvision', 18], ['Scent', 9]]);
    expect(named(creatureSenses(record, PATHFINDER, { unitType: 'meters', unitDistance: 3 }).senses, PATHFINDER)).toEqual([['Darkvision', 18], ['Scent', 9]]);
    expect(parse).toHaveBeenCalledTimes(4);
  });

  it('hands out results nobody can change', () => {
    const parsed = creatureSenses(GOBLIN, DND, FEET);
    expect(() => parsed.senses.push({ id: 'x' })).toThrow();
    expect(() => { parsed.senses[0]!.range = 1; }).toThrow();
  });
});

describe('effectiveSenses', () => {
  it('are the token\'s own senses once it has any, whatever its statblock says', () => {
    const own = [sense('Truesight', 120)];
    expect(effectiveSenses(token({ enabled: true, senses: own }), GOBLIN, DND, FEET)).toEqual(own);
    expect(effectiveVision(token({ enabled: true, senses: own }), GOBLIN, DND, FEET)).toMatchObject({ senses: own, source: 'token', blindBeyond: false, pending: false });
  });

  it('are none for a token whose senses were emptied by hand', () => {
    expect(effectiveSenses(token({ enabled: true, senses: [] }), GOBLIN, DND, FEET)).toEqual([]);
    expect(effectiveVision(token({ enabled: true, senses: [], darkvision: 30 }), GOBLIN, DND, FEET).source).toBe('token');
  });

  it('follow the statblock when what the token stores as senses is no list', () => {
    const broken = token({ enabled: true, senses: 'darkvision' as unknown as TokenSense[] });
    expect(effectiveVision(broken, GOBLIN, DND, FEET).source).toBe('statblock');
  });

  it('are the old darkvision and tremorsense fields before the statblock', () => {
    expect(named(effectiveSenses(token({ enabled: true, darkvision: 30, tremorsense: 15 }), GOBLIN, DND, FEET))).toEqual([['Darkvision', 30], ['Tremorsense', 15]]);
    expect(effectiveVision(token({ enabled: true, tremorsense: 15 }), GOBLIN, DND, FEET)).toMatchObject({ source: 'token', blindBeyond: false });
  });

  it('follow the linked statblock while the token has none of its own, with vision on or off', () => {
    expect(named(effectiveSenses(token({ enabled: true, range: 120, angle: 90 }), GOBLIN, DND, FEET))).toEqual([['Darkvision', 60]]);
    expect(named(effectiveSenses(token({ enabled: false }), GOBLIN, DND, FEET))).toEqual([['Darkvision', 60]]);
    expect(named(effectiveSenses(token(), GOBLIN, DND, FEET))).toEqual([['Darkvision', 60]]);
    expect(effectiveVision(token({ enabled: true }), GOBLIN, DND, FEET)).toMatchObject({ source: 'statblock', blindBeyond: false });
  });

  it('are none without a linked statblock, without a statblock in the note, or when it names no sense', () => {
    const none = { senses: [], source: 'none', blindBeyond: false, pending: false };
    expect(effectiveVision(token({ enabled: true }, null), GOBLIN, DND, FEET)).toMatchObject(none);
    expect(effectiveVision(token({ enabled: true }), null, DND, FEET)).toMatchObject(none);
    expect(effectiveVision(token({ enabled: true }), creature({ senses: 'passive Perception 10' }), DND, FEET)).toMatchObject(none);
  });

  it('are pending while the statblock a token follows has not been read', () => {
    expect(effectiveVision(token({ enabled: true }), undefined, DND, FEET)).toMatchObject({ senses: [], source: 'pending', pending: true });
    expect(effectiveVision(token({ enabled: true, range: 60 }), undefined, DND, FEET)).toMatchObject({ source: 'pending', pending: true, sightRange: 60 });
  });

  it('wait for the statblock of a token with senses of its own only while it could still limit its sight', () => {
    expect(effectiveVision(token({ enabled: true, senses: [] }), undefined, DND, FEET)).toMatchObject({ source: 'token', pending: true });
    expect(effectiveVision(token({ enabled: true, senses: [], range: 60 }), undefined, DND, FEET)).toMatchObject({ source: 'token', pending: false });
    expect(effectiveVision(token({ enabled: true, senses: [] }, null), undefined, DND, FEET)).toMatchObject({ source: 'token', pending: false });
  });

  it('never read vision as switched on by a statblock', () => {
    const placed = token({ enabled: false });
    effectiveSenses(placed, GOBLIN, DND, FEET);
    expect(placed.vision).toEqual({ enabled: false });
  });

  it('give the same list for the same record, so sight can compare by reference', () => {
    const first = effectiveSenses(token({ enabled: true }), GOBLIN, DND, FEET);
    expect(effectiveSenses(token({ enabled: true, range: 30 }), GOBLIN, DND, FEET)).toBe(first);
  });
});

describe('effectiveVision sight range', () => {
  const NO_VISION = creature({ senses: 'Perception +3; motion sense 60 feet, no vision' });
  const MANDRAKE = creature({ senses: 'tremorsense 60 ft. (blind beyond this radius), passive Perception 9' });

  it('is unlimited for a creature that sees, and the token\'s own range where it has one', () => {
    expect(effectiveVision(token({ enabled: true }), GOBLIN, DND, FEET)).not.toHaveProperty('sightRange');
    expect(effectiveVision(token({ enabled: true, range: 120 }), GOBLIN, DND, FEET).sightRange).toBe(120);
    expect(effectiveVision(token({ enabled: true, range: 120 }, null), null, DND, FEET).sightRange).toBe(120);
  });

  it('ends where the statblock says the creature is blind beyond', () => {
    const vision = effectiveVision(token({ enabled: true }), GRIMLOCK, DND, FEET);
    expect(named(vision.senses)).toEqual([['Blindsight', 30]]);
    expect(vision).toMatchObject({ source: 'statblock', blindBeyond: true, sightRange: 30 });
    expect(effectiveVision(token({ enabled: true }), GRIMLOCK, DND, METRES).sightRange).toBe(9);
  });

  it('is 0 for a creature without normal sight at all', () => {
    expect(effectiveVision(token({ enabled: true }), NO_VISION, DND, FEET)).toMatchObject({ senses: [], source: 'statblock', blindBeyond: true, sightRange: 0 });
    expect(effectiveVision(token({ enabled: true }), MANDRAKE, DND, FEET)).toMatchObject({ blindBeyond: true, sightRange: 0 });
  });

  it('stays limited once the token has senses of its own, even none', () => {
    expect(effectiveVision(token({ enabled: true, senses: [] }), GRIMLOCK, DND, FEET)).toMatchObject({ senses: [], source: 'token', blindBeyond: true, sightRange: 30 });
    expect(effectiveVision(token({ enabled: true, senses: [sense('Darkvision', 60)] }), NO_VISION, DND, FEET)).toMatchObject({ source: 'token', sightRange: 0 });
    expect(effectiveVision(token({ enabled: true, darkvision: 60 }), GRIMLOCK, DND, FEET)).toMatchObject({ source: 'token', sightRange: 30 });
  });

  it('gives way to a sight range set on the token', () => {
    expect(effectiveVision(token({ enabled: true, range: 90 }), GRIMLOCK, DND, FEET)).toMatchObject({ blindBeyond: true, sightRange: 90 });
    expect(effectiveVision(token({ enabled: true, range: 90, senses: [] }), NO_VISION, DND, FEET).sightRange).toBe(90);
  });
});

describe('effectiveVision key', () => {
  const key = (vision: TokenVision | undefined, record: SensedCreature | null | undefined, unit = FEET): string => effectiveVision(token(vision), record, DND, unit).key;

  it('is the same for the same senses and sight range, whoever asks', () => {
    expect(key({ enabled: true }, GOBLIN)).toBe(key({ enabled: false, angle: 90 }, creature({ senses: 'Darkvision 60 ft.; Passive Perception 9' })));
    expect(key({ enabled: true, senses: [sense('Darkvision', 60)] }, null)).toBe(key({ enabled: true }, GOBLIN));
  });

  it('changes with a sense, a distance, the sight range and the wait for the statblock', () => {
    const keys = [
      key({ enabled: true }, GOBLIN),
      key({ enabled: true }, creature({ senses: 'darkvision 120 ft.' })),
      key({ enabled: true }, creature({ senses: 'darkvision 60 ft., blindsight 10 ft.' })),
      key({ enabled: true }, creature({ senses: 'blindsight 60 ft.' })),
      key({ enabled: true }, GOBLIN, METRES),
      key({ enabled: true, range: 30 }, GOBLIN),
      key({ enabled: true }, GRIMLOCK),
      key({ enabled: true }, undefined),
      key({ enabled: true }, null),
    ];
    expect(new Set(keys).size).toBe(keys.length);
  });
});

describe('creatureSenses for several collections', () => {
  it('keeps one reading per senses and unit, so the lists keep their identity while two collections share a note', () => {
    const parse = vi.spyOn(parser, 'parseSenses');
    const record = creature({ senses: 'darkvision 60 ft., tremorsense 30 ft.' });
    const dnd = creatureSenses(record, DND, FEET);
    const pathfinder = creatureSenses(record, PATHFINDER, FEET);
    const metres = creatureSenses(record, DND, METRES);
    for (let rebuild = 0; rebuild < 3; rebuild++) {
      expect(creatureSenses(record, DND, FEET)).toBe(dnd);
      expect(creatureSenses(record, PATHFINDER, FEET)).toBe(pathfinder);
      expect(creatureSenses(record, DND, METRES)).toBe(metres);
    }
    expect(parse).toHaveBeenCalledTimes(3);
  });
});

describe('inheritedSensesOf', () => {
  it('lists what a token takes from its statblock, and what was not recognised', () => {
    const inherited = inheritedSensesOf(token({ enabled: true }), creature({ senses: 'darkvision 60 ft., keen smell, passive Perception 9' }), DND, FEET);
    expect(named(inherited!.senses)).toEqual([['Darkvision', 60]]);
    expect(inherited).toMatchObject({ notRecognised: ['keen smell'], blindBeyond: false });
  });

  it('leaves perception scores out of what was not recognised', () => {
    expect(inheritedSensesOf(token(), creature({ senses: 'Perception +7; low-light vision, motion sense 60 feet' }), DND, FEET))
      .toEqual({ senses: [], notRecognised: ['low-light vision', 'motion sense 60 feet'], blindBeyond: false });
    expect(inheritedSensesOf(token(), creature({ senses: 'Passive Perception 10' }), DND, FEET)).toBeNull();
  });

  it('says where the creature is blind beyond its senses', () => {
    expect(inheritedSensesOf(token(), GRIMLOCK, DND, FEET)).toMatchObject({ blindBeyond: true, blindBeyondRange: 30 });
  });

  it('gives a list the editor may keep', () => {
    const inherited = inheritedSensesOf(token(), GOBLIN, DND, FEET)!;
    inherited.senses.push({ id: 'x' });
    expect(inheritedSensesOf(token(), GOBLIN, DND, FEET)!.senses).toHaveLength(1);
  });

  it('is null for a token with senses of its own, without a statblock, or with one that says nothing', () => {
    expect(inheritedSensesOf(token({ enabled: true, senses: [] }), GOBLIN, DND, FEET)).toBeNull();
    expect(inheritedSensesOf(token({ enabled: true, darkvision: 60 }), GOBLIN, DND, FEET)).toBeNull();
    expect(inheritedSensesOf(token(undefined, null), GOBLIN, DND, FEET)).toBeNull();
    expect(inheritedSensesOf(token(), undefined, DND, FEET)).toBeNull();
    expect(inheritedSensesOf(token(), creature({ name: 'Bear' }), DND, FEET)).toBeNull();
  });
});
