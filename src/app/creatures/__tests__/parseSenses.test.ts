import { describe, expect, it } from 'vitest';
import { GENERIC_SENSES } from '../../gameSystems/senses';
import type { SenseDefinition } from '../../types/senseTypes';
import { parseSenses } from '../parseSenses';
import { SENSES_FIXTURES, type FixtureSystem } from './sensesFixtures';
import { SENSES_REGRESSIONS } from './sensesRegressions';
import { DND, FEET, METRES, OSE, PATHFINDER, SHADOWDARK, SQUARES, SYSTEMS, read } from './sensesTestHelpers';

describe('parseSenses on published creatures', () => {
  it('has at least 25 lines, each from a named creature and source', () => {
    expect(SENSES_FIXTURES.length).toBeGreaterThanOrEqual(25);
    for (const fixture of SENSES_FIXTURES) {
      expect(fixture.creature).not.toBe('');
      expect(fixture.source).not.toBe('');
    }
  });

  for (const system of Object.keys(SYSTEMS) as FixtureSystem[]) {
    describe(`in a ${system} collection`, () => {
      it.each(SENSES_FIXTURES.map((fixture) => [`${fixture.creature} (${fixture.source})`, fixture] as const))('%s', (_label, fixture) => {
        expect(read(fixture.text, SYSTEMS[system])).toEqual(fixture[system]);
      });
    });
  }
});

describe('parseSenses on lines it once read wrong', () => {
  it.each(SENSES_REGRESSIONS.map((line) => [`${line.creature} (${line.source})`, line] as const))('%s', (_label, line) => {
    const { senses, unknown, blindBeyond } = line;
    expect(read(line.text, SYSTEMS[line.system])).toEqual({ senses, unknown, ...(blindBeyond !== undefined && { blindBeyond }) });
  });

  it('gives every creature whose bracket once became a distance the sense without one', () => {
    const bracketed = SENSES_REGRESSIONS.filter((line) => /; \(\d+ [^)]*\) (?:greater )?(?:darkvision|low-light vision)/.test(line.text));
    expect(bracketed.length).toBeGreaterThanOrEqual(23);
    for (const line of bracketed) {
      const first = parseSenses(line.text, SYSTEMS[line.system], FEET, 'en').senses[0]!;
      expect(first, line.creature).not.toHaveProperty('range');
    }
  });
});

describe('parseSenses grammar', () => {
  it('separates senses at commas and semicolons, not inside brackets or numbers', () => {
    expect(read('darkvision 60 ft.; blindsight 10 ft., truesight 30 ft.', DND).senses)
      .toEqual([['Darkvision', 60], ['Blindsight', 10], ['Truesight', 30]]);
    expect(read('blindsight 30 ft. (hearing, smell; blind beyond this radius)', DND)).toEqual({ senses: [['Blindsight', 30]], unknown: [], blindBeyond: 30 });
    expect(read('tremorsense (imprecise) 1,000 feet', PATHFINDER).senses).toEqual([['Tremorsense', 1000]]);
  });

  it('reads a sense without a distance as one that takes none', () => {
    expect(parseSenses('darkvision, low-light vision', PATHFINDER, FEET).senses.every((sense) => !('range' in sense))).toBe(true);
    expect(read('darkvision', DND).senses).toEqual([['Darkvision']]);
  });

  it('finds the distance before the name, in brackets, or after a colon', () => {
    expect(read('60 ft. darkvision', DND).senses).toEqual([['Darkvision', 60]]);
    expect(read('120-foot darkvision', DND).senses).toEqual([['Darkvision', 120]]);
    expect(read('darkvision (60 ft.)', DND).senses).toEqual([['Darkvision', 60]]);
    expect(read('Darkvision: 60 ft.', DND).senses).toEqual([['Darkvision', 60]]);
    expect(read('Senses darkvision 60 ft.', DND).senses).toEqual([['Darkvision', 60]]);
  });

  it('knows the names statblocks use for a sense, whatever their case and spacing', () => {
    for (const phrase of ['Darkvision 60 ft.', 'DARK VISION 60 ft.', 'superior darkvision 60 ft.', 'infravision 60 ft.']) {
      expect(read(phrase, DND).senses).toEqual([['Darkvision', 60]]);
    }
    expect(read('blindsense 30 ft.', DND).senses).toEqual([['Blindsight', 30]]);
    expect(read('blind sight 30 ft.', DND).senses).toEqual([['Blindsight', 30]]);
    expect(read('tremor sense 60 ft.', DND).senses).toEqual([['Tremorsense', 60]]);
    expect(read('true sight 120 ft.', DND).senses).toEqual([['Truesight', 120]]);
    expect(read('true seeing', GENERIC_SENSES).senses).toEqual([['Truesight']]);
    expect(read('Devil’s Sight 120 ft.', DND).senses).toEqual([['Devil\'s Sight', 120]]);
    expect(read('devils sight', DND).senses).toEqual([['Devil\'s Sight']]);
    expect(read('Low-Light Vision', PATHFINDER).senses).toEqual([['Low-light vision']]);
    expect(read('lowlight vision', GENERIC_SENSES).senses).toEqual([['Low-light vision']]);
    expect(read('wavesense (imprecise) 30 feet, life sense 10 feet, hearing 60 feet', PATHFINDER).senses)
      .toEqual([['Wavesense', 30], ['Lifesense', 10], ['Hearing', 60]]);
  });

  it('finds the collection\'s modifier that lets the eyes see invisible creatures, whatever it is called', () => {
    for (const phrase of ['see invisibility', 'See the Unseen', 'sees invisible', 'see invisible']) {
      expect(read(phrase, DND).senses).toEqual([['See Invisibility']]);
      expect(read(phrase, PATHFINDER).senses).toEqual([['See the Unseen']]);
      expect(read(phrase, GENERIC_SENSES).senses).toEqual([['See invisible']]);
      expect(read(phrase, OSE)).toEqual({ senses: [], unknown: [phrase] });
    }
    const secondSight: SenseDefinition = { ...GENERIC_SENSES.find((sense) => sense.grants === 'see-invisible')!, id: 'made-up', name: 'Second sight' };
    expect(read('see invisibility, second sight', [secondSight]).senses).toEqual([['Second sight']]);
  });

  it('gives a modifier no distance', () => {
    expect(parseSenses('darkvision 60 ft., see invisibility 120 ft.', DND, FEET).senses.map((sense) => 'range' in sense)).toEqual([true, false]);
  });

  it('matches a sense the collection defines itself by its name', () => {
    const thermal: SenseDefinition = { ...GENERIC_SENSES[0]!, id: 'made-up', name: 'Thermal vision' };
    delete thermal.role;
    expect(read('thermal vision 30 ft., darkvision 60 ft.', [thermal])).toEqual({ senses: [['Thermal vision', 30]], unknown: ['darkvision 60 ft.'] });
    expect(read('Darkness-adapted', SHADOWDARK).senses).toEqual([['Darkness-adapted']]);
  });

  it('gives the closest sense of the collection: greater darkvision is darkvision where there is no greater one', () => {
    expect(read('greater darkvision', PATHFINDER).senses).toEqual([['Greater darkvision']]);
    expect(read('greater darkvision', GENERIC_SENSES).senses).toEqual([['Darkvision']]);
    expect(read('darkvision 60 ft.', SHADOWDARK)).toEqual({ senses: [], unknown: ['darkvision 60 ft.'] });
  });

  it('never maps a phrase onto a sense only the generic set has', () => {
    expect(read('blindsight 30 ft.', PATHFINDER)).toEqual({ senses: [], unknown: ['blindsight 30 ft.'] });
    expect(read('darkvision 60 ft.', [])).toEqual({ senses: [], unknown: ['darkvision 60 ft.'] });
  });

  it('lists a sense once, with the first distance given', () => {
    expect(read('darkvision 60 ft., superior darkvision 120 ft.', DND).senses).toEqual([['Darkvision', 60]]);
  });

  it('reports what names no sense of the collection as it is written, without links', () => {
    expect(read('[[Rules/Senses#Darkvision|darkvision]] 60 ft., [thoughtsense](rules.md) (imprecise) 60 feet', DND))
      .toEqual({ senses: [['Darkvision', 60]], unknown: ['thoughtsense (imprecise) 60 feet'] });
    expect(read('<STATBLOCK-WIKI-LINK>Senses/Scent|scent<STATBLOCK-WIKI-LINK> (imprecise) 30 feet', PATHFINDER).senses).toEqual([['Scent', 30]]);
    expect(read('  keen   smell ,, ', DND)).toEqual({ senses: [], unknown: ['keen smell'] });
  });

  it('has nothing to say about an empty line or a placeholder', () => {
    for (const text of ['', '   ', '-', '—', 'none', 'None.']) {
      expect(parseSenses(text, DND, FEET)).toEqual({ senses: [], unknown: [] });
    }
  });
});

describe('parseSenses units', () => {
  it('keeps feet in a collection that measures in feet', () => {
    expect(read('darkvision 60 ft., blindsight 30 feet, tremorsense 60\'', DND, FEET).senses)
      .toEqual([['Darkvision', 60], ['Blindsight', 30], ['Tremorsense', 60]]);
  });

  it('converts feet to a collection that measures in metres, and metres back', () => {
    expect(read('darkvision 60 ft., blindsight 10 ft.', DND, METRES).senses).toEqual([['Darkvision', 18], ['Blindsight', 3]]);
    expect(read('darkvision 18 m, blindsight 3 Meter', DND, METRES).senses).toEqual([['Darkvision', 18], ['Blindsight', 3]]);
    expect(read('darkvision 18 m', DND, FEET).senses).toEqual([['Darkvision', 60]]);
  });

  it('counts squares by the collection\'s grid', () => {
    expect(read('darkvision 12 squares', DND, FEET).senses).toEqual([['Darkvision', 60]]);
    expect(read('darkvision 12 squares', DND, METRES).senses).toEqual([['Darkvision', 18]]);
    expect(read('darkvision 60 ft.', DND, SQUARES).senses).toEqual([['Darkvision', 12]]);
  });

  it('takes a number without a unit as the collection\'s own', () => {
    expect(read('darkvision 60', DND, FEET).senses).toEqual([['Darkvision', 60]]);
    expect(read('darkvision 18', DND, METRES).senses).toEqual([['Darkvision', 18]]);
  });

  it('converts the radius a creature is blind beyond', () => {
    expect(read('blindsight 60 ft. (blind beyond this radius)', DND, METRES)).toEqual({ senses: [['Blindsight', 18]], unknown: [], blindBeyond: 18 });
  });
});

describe('parseSenses blind beyond', () => {
  it('is unset for a creature that sees', () => {
    const parsed = parseSenses('darkvision 60 ft., passive Perception 9', DND, FEET);
    expect(parsed.blindBeyond).toBeUndefined();
    expect(parsed.blindBeyondRange).toBeUndefined();
  });

  it('is the largest radius where several senses say so', () => {
    expect(read('blindsight 30 ft. (blind beyond this radius), truesight 60 ft. (blind beyond this radius)', DND).blindBeyond).toBe(60);
  });

  it('has no radius after a sense that shows no map: the creature has no sight at all', () => {
    expect(read('tremorsense 60 ft. (blind beyond this radius), passive Perception 11', DND))
      .toEqual({ senses: [['Tremorsense', 60]], unknown: ['passive Perception 11'], blindBeyond: true });
    expect(read('blindsight 30 ft. (blind beyond this radius), tremorsense 60 ft. (blind beyond this radius)', DND).blindBeyond).toBe(30);
  });

  it('keeps the radius after such a sense where the creature has eyes to see with', () => {
    expect(read('darkvision 60 ft., tremorsense 120 ft. (blind beyond this radius), passive Perception 13', DND).blindBeyond).toBe(120);
  });

  it('is the radius of the sense an "or" clause belongs to', () => {
    expect(read('blindsight 30 ft., or 10 ft. while deafened (blind beyond this radius), passive Perception 14', DND))
      .toEqual({ senses: [['Blindsight', 30]], unknown: ['or 10 ft. while deafened (blind beyond this radius)', 'passive Perception 14'], blindBeyond: 30 });
    expect(read('blindsight 60\' or 20\' while deafened (blind beyond), passive Perception 17', DND))
      .toEqual({ senses: [['Blindsight', 60]], unknown: ['or 20\' while deafened (blind beyond)', 'passive Perception 17'], blindBeyond: 60 });
  });

  it('reads "can\'t sense beyond this radius" alike, also after a sense the collection lacks', () => {
    expect(read('keensense 60 ft. (can\'t sense beyond this radius)', DND))
      .toEqual({ senses: [], unknown: ['keensense 60 ft. (can\'t sense beyond this radius)'], blindBeyond: 60 });
    expect(read('blindsight 30 ft. (can’t sense beyond this radius)', DND)).toEqual({ senses: [['Blindsight', 30]], unknown: [], blindBeyond: 30 });
    expect(read('sight 20 ft. (blind beyond the radius of its own light), passive Perception 10', DND).blindBeyond).toBe(20);
  });

  it('takes the usual distance of a sense that gives none', () => {
    expect(read('blindsight (blind beyond this radius)', DND).blindBeyond).toBe(60);
  });

  it('has no radius for a creature without vision at all', () => {
    expect(read('no vision', PATHFINDER)).toEqual({ senses: [], unknown: [], blindBeyond: true });
    expect(read('tremorsense (imprecise) 60 feet, no vision', PATHFINDER)).toEqual({ senses: [['Tremorsense', 60]], unknown: [], blindBeyond: true });
  });
});
