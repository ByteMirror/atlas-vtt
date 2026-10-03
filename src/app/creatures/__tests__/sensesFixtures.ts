/**
 * Senses lines of published creatures, and what each should read as in a collection of every
 * game system that has senses. Expectations name senses, never ids.
 *
 * Where each line comes from:
 * - `VAULT`: copied from the statblock notes of the test vault (SRD 5.1 text, Fantasy Statblocks'
 *   Basic 5e Layout, in frontmatter or a ```statblock fence).
 * - `SRD_2024`: the senses Open5e lists for the creature in the SRD 5.2.1, written in that
 *   document's layout ("Blindsight 60 ft., Darkvision 120 ft.; Passive Perception 21").
 * - `MONSTER_CORE`: the senses the pf2e system's data lists for the creature, written as a
 *   Pathfinder stat block prints them ("Perception +7; low-light vision, scent (imprecise) 30 feet").
 * - `OSE`: Old-School Essentials gives creatures no senses line; these are the class texts.
 */

const VAULT = 'test vault, 5e SRD';
const SRD_2024 = 'SRD 5.2.1';
const MONSTER_CORE = 'Pathfinder Monster Core';
const OSE = 'Old-School Essentials';

/** A sense by the name of its definition, with the distance the line gives it. */
export type ExpectedSense = [name: string, range?: number];

export interface ExpectedSenses {
  senses: ExpectedSense[];
  unknown: string[];
  /** Blind beyond this many game units; `true` when the line names no distance. */
  blindBeyond?: number | true;
}

export type FixtureSystem = 'dnd5e' | 'pathfinder2e' | 'ose' | 'generic';

export interface SensesFixture extends Record<FixtureSystem, ExpectedSenses> {
  creature: string;
  source: string;
  text: string;
}

function reads(senses: ExpectedSense[], unknown: string[] = [], blindBeyond?: number | true): ExpectedSenses {
  return { senses, unknown, ...(blindBeyond !== undefined && { blindBeyond }) };
}

export const SENSES_FIXTURES: readonly SensesFixture[] = [
  {
    creature: 'Goblin', source: VAULT, text: 'darkvision 60 ft., passive Perception 9',
    dnd5e: reads([['Darkvision', 60]], ['passive Perception 9']),
    pathfinder2e: reads([['Darkvision', 60]], ['passive Perception 9']),
    ose: reads([['Infravision', 60]], ['passive Perception 9']),
    generic: reads([['Darkvision', 60]], ['passive Perception 9']),
  },
  {
    creature: 'Adult Black Dragon', source: VAULT, text: 'blindsight 60 ft., darkvision 120 ft., passive Perception 21',
    dnd5e: reads([['Blindsight', 60], ['Darkvision', 120]], ['passive Perception 21']),
    pathfinder2e: reads([['Darkvision', 120]], ['blindsight 60 ft.', 'passive Perception 21']),
    ose: reads([['Infravision', 120]], ['blindsight 60 ft.', 'passive Perception 21']),
    generic: reads([['Blindsight', 60], ['Darkvision', 120]], ['passive Perception 21']),
  },
  {
    creature: 'Grimlock', source: VAULT,
    text: 'blindsight 30 ft. or 10 ft. while deafened (blind beyond this radius), passive Perception 13',
    dnd5e: reads([['Blindsight', 30]], ['or 10 ft. while deafened (blind beyond this radius)', 'passive Perception 13'], 30),
    pathfinder2e: reads([], ['blindsight 30 ft. or 10 ft. while deafened (blind beyond this radius)', 'passive Perception 13'], 30),
    ose: reads([], ['blindsight 30 ft. or 10 ft. while deafened (blind beyond this radius)', 'passive Perception 13'], 30),
    generic: reads([['Blindsight', 30]], ['or 10 ft. while deafened (blind beyond this radius)', 'passive Perception 13'], 30),
  },
  {
    creature: 'Wererat', source: VAULT, text: 'darkvision 60 ft. (rat form only), passive Perception 12',
    dnd5e: reads([['Darkvision', 60]], ['passive Perception 12']),
    pathfinder2e: reads([['Darkvision', 60]], ['passive Perception 12']),
    ose: reads([['Infravision', 60]], ['passive Perception 12']),
    generic: reads([['Darkvision', 60]], ['passive Perception 12']),
  },
  {
    creature: 'Purple Worm', source: VAULT, text: 'blindsight 30 ft., tremorsense 60 ft., passive Perception 9',
    dnd5e: reads([['Blindsight', 30], ['Tremorsense', 60]], ['passive Perception 9']),
    pathfinder2e: reads([['Tremorsense', 60]], ['blindsight 30 ft.', 'passive Perception 9']),
    ose: reads([], ['blindsight 30 ft.', 'tremorsense 60 ft.', 'passive Perception 9']),
    generic: reads([['Blindsight', 30], ['Tremorsense', 60]], ['passive Perception 9']),
  },
  {
    creature: 'Solar', source: VAULT, text: 'truesight 120 ft., passive Perception 24',
    dnd5e: reads([['Truesight', 120]], ['passive Perception 24']),
    pathfinder2e: reads([], ['truesight 120 ft.', 'passive Perception 24']),
    ose: reads([], ['truesight 120 ft.', 'passive Perception 24']),
    generic: reads([['Truesight', 120]], ['passive Perception 24']),
  },
  {
    creature: 'Ankheg', source: VAULT, text: 'darkvision 60 ft., tremorsense 60 ft., passive Perception 11',
    dnd5e: reads([['Darkvision', 60], ['Tremorsense', 60]], ['passive Perception 11']),
    pathfinder2e: reads([['Darkvision', 60], ['Tremorsense', 60]], ['passive Perception 11']),
    ose: reads([['Infravision', 60]], ['tremorsense 60 ft.', 'passive Perception 11']),
    generic: reads([['Darkvision', 60], ['Tremorsense', 60]], ['passive Perception 11']),
  },
  {
    creature: 'Behir', source: VAULT, text: 'darkvision 90 ft., passive Perception 16',
    dnd5e: reads([['Darkvision', 90]], ['passive Perception 16']),
    pathfinder2e: reads([['Darkvision', 90]], ['passive Perception 16']),
    ose: reads([['Infravision', 90]], ['passive Perception 16']),
    generic: reads([['Darkvision', 90]], ['passive Perception 16']),
  },
  {
    creature: 'Giant Bat', source: VAULT, text: 'blindsight 60 ft., passive Perception 11',
    dnd5e: reads([['Blindsight', 60]], ['passive Perception 11']),
    pathfinder2e: reads([], ['blindsight 60 ft.', 'passive Perception 11']),
    ose: reads([], ['blindsight 60 ft.', 'passive Perception 11']),
    generic: reads([['Blindsight', 60]], ['passive Perception 11']),
  },
  {
    creature: 'Shrieker', source: VAULT, text: 'blindsight 30 ft. (blind beyond this radius), passive Perception 6',
    dnd5e: reads([['Blindsight', 30]], ['passive Perception 6'], 30),
    pathfinder2e: reads([], ['blindsight 30 ft. (blind beyond this radius)', 'passive Perception 6'], 30),
    ose: reads([], ['blindsight 30 ft. (blind beyond this radius)', 'passive Perception 6'], 30),
    generic: reads([['Blindsight', 30]], ['passive Perception 6'], 30),
  },
  {
    creature: 'Gelatinous Cube', source: VAULT, text: 'blindsight 60 ft. (blind beyond this radius), passive Perception 8',
    dnd5e: reads([['Blindsight', 60]], ['passive Perception 8'], 60),
    pathfinder2e: reads([], ['blindsight 60 ft. (blind beyond this radius)', 'passive Perception 8'], 60),
    ose: reads([], ['blindsight 60 ft. (blind beyond this radius)', 'passive Perception 8'], 60),
    generic: reads([['Blindsight', 60]], ['passive Perception 8'], 60),
  },
  {
    creature: 'Killer Whale', source: VAULT, text: 'blindsight 120 ft., passive Perception 13',
    dnd5e: reads([['Blindsight', 120]], ['passive Perception 13']),
    pathfinder2e: reads([], ['blindsight 120 ft.', 'passive Perception 13']),
    ose: reads([], ['blindsight 120 ft.', 'passive Perception 13']),
    generic: reads([['Blindsight', 120]], ['passive Perception 13']),
  },
  {
    creature: 'Commoner', source: VAULT, text: 'passive Perception 10',
    dnd5e: reads([], ['passive Perception 10']),
    pathfinder2e: reads([], ['passive Perception 10']),
    ose: reads([], ['passive Perception 10']),
    generic: reads([], ['passive Perception 10']),
  },
  {
    creature: 'Giant Inferno Spider', source: 'test vault, statblock fence in "A Most Potent Brew"',
    text: 'blindsight 10 ft., darkvision 60 ft., passive Perception 10',
    dnd5e: reads([['Blindsight', 10], ['Darkvision', 60]], ['passive Perception 10']),
    pathfinder2e: reads([['Darkvision', 60]], ['blindsight 10 ft.', 'passive Perception 10']),
    ose: reads([['Infravision', 60]], ['blindsight 10 ft.', 'passive Perception 10']),
    generic: reads([['Blindsight', 10], ['Darkvision', 60]], ['passive Perception 10']),
  },
  {
    creature: 'Adult Black Dragon', source: SRD_2024, text: 'Blindsight 60 ft., Darkvision 120 ft.; Passive Perception 21',
    dnd5e: reads([['Blindsight', 60], ['Darkvision', 120]], ['Passive Perception 21']),
    pathfinder2e: reads([['Darkvision', 120]], ['Blindsight 60 ft.', 'Passive Perception 21']),
    ose: reads([['Infravision', 120]], ['Blindsight 60 ft.', 'Passive Perception 21']),
    generic: reads([['Blindsight', 60], ['Darkvision', 120]], ['Passive Perception 21']),
  },
  {
    creature: 'Bulette', source: SRD_2024, text: 'Darkvision 60 ft., Tremorsense 120 ft.; Passive Perception 16',
    dnd5e: reads([['Darkvision', 60], ['Tremorsense', 120]], ['Passive Perception 16']),
    pathfinder2e: reads([['Darkvision', 60], ['Tremorsense', 120]], ['Passive Perception 16']),
    ose: reads([['Infravision', 60]], ['Tremorsense 120 ft.', 'Passive Perception 16']),
    generic: reads([['Darkvision', 60], ['Tremorsense', 120]], ['Passive Perception 16']),
  },
  {
    creature: 'Lich', source: SRD_2024, text: 'Truesight 120 ft.; Passive Perception 19',
    dnd5e: reads([['Truesight', 120]], ['Passive Perception 19']),
    pathfinder2e: reads([], ['Truesight 120 ft.', 'Passive Perception 19']),
    ose: reads([], ['Truesight 120 ft.', 'Passive Perception 19']),
    generic: reads([['Truesight', 120]], ['Passive Perception 19']),
  },
  {
    creature: 'Giant Bat', source: SRD_2024, text: 'Blindsight 120 ft.; Passive Perception 11',
    dnd5e: reads([['Blindsight', 120]], ['Passive Perception 11']),
    pathfinder2e: reads([], ['Blindsight 120 ft.', 'Passive Perception 11']),
    ose: reads([], ['Blindsight 120 ft.', 'Passive Perception 11']),
    generic: reads([['Blindsight', 120]], ['Passive Perception 11']),
  },
  {
    creature: 'Xorn', source: SRD_2024, text: 'Darkvision 60 ft., Tremorsense 60 ft.; Passive Perception 16',
    dnd5e: reads([['Darkvision', 60], ['Tremorsense', 60]], ['Passive Perception 16']),
    pathfinder2e: reads([['Darkvision', 60], ['Tremorsense', 60]], ['Passive Perception 16']),
    ose: reads([['Infravision', 60]], ['Tremorsense 60 ft.', 'Passive Perception 16']),
    generic: reads([['Darkvision', 60], ['Tremorsense', 60]], ['Passive Perception 16']),
  },
  {
    creature: 'Commoner', source: SRD_2024, text: 'Passive Perception 10',
    dnd5e: reads([], ['Passive Perception 10']),
    pathfinder2e: reads([], ['Passive Perception 10']),
    ose: reads([], ['Passive Perception 10']),
    generic: reads([], ['Passive Perception 10']),
  },
  {
    creature: 'Goblin Warrior', source: MONSTER_CORE, text: 'Perception +2; darkvision',
    dnd5e: reads([['Darkvision']], ['Perception +2']),
    pathfinder2e: reads([['Darkvision']], ['Perception +2']),
    ose: reads([['Infravision']], ['Perception +2']),
    generic: reads([['Darkvision']], ['Perception +2']),
  },
  {
    creature: 'Wolf', source: MONSTER_CORE, text: 'Perception +7; low-light vision, scent (imprecise) 30 feet',
    dnd5e: reads([], ['Perception +7', 'low-light vision', 'scent (imprecise) 30 feet']),
    pathfinder2e: reads([['Low-light vision'], ['Scent', 30]], ['Perception +7']),
    ose: reads([], ['Perception +7', 'low-light vision', 'scent (imprecise) 30 feet']),
    generic: reads([['Low-light vision']], ['Perception +7', 'scent (imprecise) 30 feet']),
  },
  {
    creature: 'Giant Bat', source: MONSTER_CORE, text: 'Perception +11; echolocation (precise) 40 feet, low-light vision',
    dnd5e: reads([], ['Perception +11', 'echolocation (precise) 40 feet', 'low-light vision']),
    pathfinder2e: reads([['Echolocation', 40], ['Low-light vision']], ['Perception +11']),
    ose: reads([], ['Perception +11', 'echolocation (precise) 40 feet', 'low-light vision']),
    generic: reads([['Low-light vision']], ['Perception +11', 'echolocation (precise) 40 feet']),
  },
  {
    creature: 'Ankhrav', source: MONSTER_CORE, text: 'Perception +7; darkvision, tremorsense (imprecise) 60 feet',
    dnd5e: reads([['Darkvision'], ['Tremorsense', 60]], ['Perception +7']),
    pathfinder2e: reads([['Darkvision'], ['Tremorsense', 60]], ['Perception +7']),
    ose: reads([['Infravision']], ['Perception +7', 'tremorsense (imprecise) 60 feet']),
    generic: reads([['Darkvision'], ['Tremorsense', 60]], ['Perception +7']),
  },
  {
    creature: 'Wraith', source: MONSTER_CORE, text: 'Perception +14; darkvision, lifesense 60 feet',
    dnd5e: reads([['Darkvision']], ['Perception +14', 'lifesense 60 feet']),
    pathfinder2e: reads([['Darkvision'], ['Lifesense', 60]], ['Perception +14']),
    ose: reads([['Infravision']], ['Perception +14', 'lifesense 60 feet']),
    generic: reads([['Darkvision']], ['Perception +14', 'lifesense 60 feet']),
  },
  {
    creature: 'Caligni Skulker', source: MONSTER_CORE, text: 'Perception +8; greater darkvision',
    dnd5e: reads([['Darkvision']], ['Perception +8']),
    pathfinder2e: reads([['Greater darkvision']], ['Perception +8']),
    ose: reads([['Infravision']], ['Perception +8']),
    generic: reads([['Darkvision']], ['Perception +8']),
  },
  {
    creature: 'Great White Shark', source: MONSTER_CORE, text: 'Perception +11; blood scent, scent (imprecise) 100 feet',
    dnd5e: reads([], ['Perception +11', 'blood scent', 'scent (imprecise) 100 feet']),
    pathfinder2e: reads([['Scent', 100]], ['Perception +11', 'blood scent']),
    ose: reads([], ['Perception +11', 'blood scent', 'scent (imprecise) 100 feet']),
    generic: reads([], ['Perception +11', 'blood scent', 'scent (imprecise) 100 feet']),
  },
  {
    creature: 'Sewer Ooze', source: MONSTER_CORE, text: 'Perception +3; motion sense 60 feet, no vision',
    dnd5e: reads([], ['Perception +3', 'motion sense 60 feet'], true),
    pathfinder2e: reads([], ['Perception +3', 'motion sense 60 feet'], true),
    ose: reads([], ['Perception +3', 'motion sense 60 feet'], true),
    generic: reads([], ['Perception +3', 'motion sense 60 feet'], true),
  },
  {
    creature: 'Cave Worm', source: MONSTER_CORE, text: 'Perception +20; darkvision, tremorsense (imprecise) 100 feet',
    dnd5e: reads([['Darkvision'], ['Tremorsense', 100]], ['Perception +20']),
    pathfinder2e: reads([['Darkvision'], ['Tremorsense', 100]], ['Perception +20']),
    ose: reads([['Infravision']], ['Perception +20', 'tremorsense (imprecise) 100 feet']),
    generic: reads([['Darkvision'], ['Tremorsense', 100]], ['Perception +20']),
  },
  {
    creature: 'Grim Reaper', source: MONSTER_CORE, text: 'Perception +41; darkvision, status sight, truesight (precise) 60 feet',
    dnd5e: reads([['Darkvision'], ['Truesight', 60]], ['Perception +41', 'status sight']),
    pathfinder2e: reads([['Darkvision']], ['Perception +41', 'status sight', 'truesight (precise) 60 feet']),
    ose: reads([['Infravision']], ['Perception +41', 'status sight', 'truesight (precise) 60 feet']),
    generic: reads([['Darkvision'], ['Truesight', 60]], ['Perception +41', 'status sight']),
  },
  {
    creature: 'Banshee', source: MONSTER_CORE, text: 'Perception +32; darkvision, hears heartbeats (imprecise) 60 feet',
    dnd5e: reads([['Darkvision']], ['Perception +32', 'hears heartbeats (imprecise) 60 feet']),
    pathfinder2e: reads([['Darkvision']], ['Perception +32', 'hears heartbeats (imprecise) 60 feet']),
    ose: reads([['Infravision']], ['Perception +32', 'hears heartbeats (imprecise) 60 feet']),
    generic: reads([['Darkvision']], ['Perception +32', 'hears heartbeats (imprecise) 60 feet']),
  },
  {
    creature: 'Bottlenose Dolphin', source: MONSTER_CORE, text: 'Perception +7; echolocation (precise) 120 feet, low-light vision',
    dnd5e: reads([], ['Perception +7', 'echolocation (precise) 120 feet', 'low-light vision']),
    pathfinder2e: reads([['Echolocation', 120], ['Low-light vision']], ['Perception +7']),
    ose: reads([], ['Perception +7', 'echolocation (precise) 120 feet', 'low-light vision']),
    generic: reads([['Low-light vision']], ['Perception +7', 'echolocation (precise) 120 feet']),
  },
  {
    creature: 'Dwarf', source: OSE, text: 'infravision 60\'',
    dnd5e: reads([['Darkvision', 60]]),
    pathfinder2e: reads([['Darkvision', 60]]),
    ose: reads([['Infravision', 60]]),
    generic: reads([['Darkvision', 60]]),
  },
  {
    creature: 'Elf', source: OSE, text: 'Infravision to 60′',
    dnd5e: reads([['Darkvision', 60]]),
    pathfinder2e: reads([['Darkvision', 60]]),
    ose: reads([['Infravision', 60]]),
    generic: reads([['Darkvision', 60]]),
  },
];
