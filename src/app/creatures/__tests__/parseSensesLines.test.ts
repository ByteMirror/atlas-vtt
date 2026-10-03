import { describe, expect, it } from 'vitest';
import { DND, FEET, OSE, PATHFINDER, SHADOWDARK, read } from './sensesTestHelpers';

describe('parseSenses brackets', () => {
  it('never takes a bare number in a bracket for a distance', () => {
    expect(read('Perception +33; (35 to Sense Motive) darkvision, scent (imprecise) 60 feet', PATHFINDER))
      .toEqual({ senses: [['Darkvision'], ['Scent', 60]], unknown: ['Perception +33 (35 to Sense Motive)'] });
    expect(read('(35 to Sense Motive) darkvision', PATHFINDER)).toEqual({ senses: [['Darkvision']], unknown: ['(35 to Sense Motive)'] });
    expect(read('darkvision (penetrates magical darkness of 4th rank)', PATHFINDER)).toEqual({ senses: [['Darkvision']], unknown: [] });
    expect(read('truesight (10 minutes)', DND)).toEqual({ senses: [['Truesight']], unknown: [] });
    expect(read('darkvision (60)', DND)).toEqual({ senses: [['Darkvision']], unknown: [] });
  });

  it('takes a bracketed distance that has a unit and follows the name', () => {
    expect(read('darkvision (60 ft.)', DND).senses).toEqual([['Darkvision', 60]]);
    expect(read('darkvision (60 ft.', DND).senses).toEqual([['Darkvision', 60]]);
    expect(read('scent (imprecise 30 feet)', PATHFINDER).senses).toEqual([['Scent', 30]]);
    expect(read('scent (30 feet)', PATHFINDER).senses).toEqual([['Scent', 30]]);
    expect(read('(60 ft.) darkvision', DND)).toEqual({ senses: [['Darkvision']], unknown: ['(60 ft.)'] });
  });

  it('prefers the distance beside the name to one in a bracket', () => {
    expect(read('darkvision 60 feet (120 feet in dim light)', DND).senses).toEqual([['Darkvision', 60]]);
    expect(read('wavesense 120 feet (imprecise)', PATHFINDER).senses).toEqual([['Wavesense', 120]]);
  });

  it('keeps a bracket no sense follows with what stands after it', () => {
    expect(read('Perception +20; (21 initiative) detect magic, greater darkvision', PATHFINDER))
      .toEqual({ senses: [['Greater darkvision']], unknown: ['Perception +20', '(21 initiative) detect magic'] });
    expect(read('Perception +11; (13 to Seek creatures using hearing), low-light vision', PATHFINDER))
      .toEqual({ senses: [['Low-light vision']], unknown: ['Perception +11 (13 to Seek creatures using hearing)'] });
  });
});

describe('parseSenses on lines that run together', () => {
  it('reads senses joined by "and"', () => {
    expect(read('Darkvision 60 ft. and Tremorsense 30 ft.', DND)).toEqual({ senses: [['Darkvision', 60], ['Tremorsense', 30]], unknown: [] });
    expect(read('darkvision and tremorsense', DND)).toEqual({ senses: [['Darkvision'], ['Tremorsense']], unknown: [] });
    expect(read('darkvision & tremorsense 60 ft., passive Perception 10', DND))
      .toEqual({ senses: [['Darkvision'], ['Tremorsense', 60]], unknown: ['passive Perception 10'] });
  });

  it('reads senses with the comma between them missing', () => {
    expect(read('blindsight 10 ft. darkvision 60 ft., passive Perception 14', DND))
      .toEqual({ senses: [['Blindsight', 10], ['Darkvision', 60]], unknown: ['passive Perception 14'] });
    expect(read('keensense 30 ft. darkvision 60 ft.', DND)).toEqual({ senses: [['Darkvision', 60]], unknown: ['keensense 30 ft.'] });
  });

  it('reports what follows a sense and is none itself', () => {
    expect(read('darkvision 60 ft. passive Perception 12', DND)).toEqual({ senses: [['Darkvision', 60]], unknown: ['passive Perception 12'] });
    expect(read('blindsight 10 ft. or 60 ft. while deafened', DND)).toEqual({ senses: [['Blindsight', 10]], unknown: ['or 60 ft. while deafened'] });
    expect(read('tremorsense (imprecise) within their entire bound home', PATHFINDER))
      .toEqual({ senses: [['Tremorsense']], unknown: ['within their entire bound home'] });
  });

  it('leaves a phrase whole that names no sense anywhere', () => {
    expect(read('hears and smells well', DND)).toEqual({ senses: [], unknown: ['hears and smells well'] });
    expect(read('hears heartbeats (imprecise) 60 feet', PATHFINDER)).toEqual({ senses: [], unknown: ['hears heartbeats (imprecise) 60 feet'] });
    expect(read('PASSIVE PERCEPTION 12.', DND)).toEqual({ senses: [], unknown: ['PASSIVE PERCEPTION 12.'] });
  });

  it('ignores stray punctuation after a sense', () => {
    expect(read('darkvision 60 ft..', DND)).toEqual({ senses: [['Darkvision', 60]], unknown: [] });
    expect(read('darkvision 60 ft.) , blindsight 10 ft.', DND)).toEqual({ senses: [['Darkvision', 60], ['Blindsight', 10]], unknown: [] });
  });

  it('reads no sense from a distance of nothing, or one it cannot tell', () => {
    expect(read('darkvision 0 ft.', DND)).toEqual({ senses: [], unknown: ['darkvision 0 ft.'] });
    expect(read('darkvision 1.000 ft.', DND)).toEqual({ senses: [], unknown: ['darkvision 1.000 ft.'] });
    expect(read('darkvision 1.000 ft.', DND, FEET, 'de').senses).toEqual([['Darkvision', 1000]]);
  });
});

describe('parseSenses names from other rulebooks', () => {
  it('reads ultravision as the collection\'s darkvision', () => {
    expect(read('ultravision 60 ft.', DND).senses).toEqual([['Darkvision', 60]]);
    expect(read('Ultravision 90\'', OSE).senses).toEqual([['Infravision', 90]]);
    expect(read('ultravision 60 ft.', SHADOWDARK)).toEqual({ senses: [], unknown: ['ultravision 60 ft.'] });
  });

  it('reads "devil sight" as Devil\'s Sight', () => {
    expect(read('Devil sight 120ft, passive Perception 18', DND)).toEqual({ senses: [['Devil\'s Sight', 120]], unknown: ['passive Perception 18'] });
  });

  it('leaves senses no collection defines unknown', () => {
    expect(read('keensense 30 ft.', DND)).toEqual({ senses: [], unknown: ['keensense 30 ft.'] });
    expect(read('blood sense 90 ft., darkvision 60 ft.', DND)).toEqual({ senses: [['Darkvision', 60]], unknown: ['blood sense 90 ft.'] });
    expect(read('impaired sight 30 ft.', DND)).toEqual({ senses: [], unknown: ['impaired sight 30 ft.'] });
  });
});
