/**
 * Senses lines the parser once read wrong, from the review of this parser against Open5e's
 * documents (D&D 5e, read with the 5e senses) and the Archives of Nethys (Pathfinder 2e; its
 * creature data puts the note on the Perception score in front of the senses). Each keeps the
 * reading that is right: no number in a bracket taken for a distance, no sense lost where a
 * comma is missing, nothing after a sense dropped without a word, and "blind beyond this radius"
 * meaning the sense it stands with.
 */

import type { ExpectedSenses } from './sensesFixtures';

export interface SensesRegression extends ExpectedSenses {
  creature: string;
  source: string;
  system: 'dnd5e' | 'pathfinder2e';
  text: string;
}

export const SENSES_REGRESSIONS: readonly SensesRegression[] = [
  {
    creature: 'Whisper Archdragon', source: 'Archives of Nethys', system: 'pathfinder2e',
    text: 'Perception +33; (35 to Sense Motive) darkvision, scent (imprecise) 60 feet',
    senses: [['Darkvision'], ['Scent', 60]], unknown: ['Perception +33 (35 to Sense Motive)'],
  },
  {
    creature: 'Young Brine Dragon', source: 'Archives of Nethys', system: 'pathfinder2e',
    text: 'Perception +16; (18 to Sense Motive) aquatic echolocation 120 feet, darkvision',
    senses: [['Darkvision']], unknown: ['Perception +16', '(18 to Sense Motive) aquatic echolocation 120 feet'],
  },
  {
    creature: 'Adult Brine Dragon', source: 'Archives of Nethys', system: 'pathfinder2e',
    text: 'Perception +22; (24 to Sense Motive) aquatic echolocation 120 feet, darkvision',
    senses: [['Darkvision']], unknown: ['Perception +22', '(24 to Sense Motive) aquatic echolocation 120 feet'],
  },
  {
    creature: 'Ancient Brine Dragon', source: 'Archives of Nethys', system: 'pathfinder2e',
    text: 'Perception +29; (31 to Sense Motive) aquatic echolocation 120 feet, greater darkvision',
    senses: [['Greater darkvision']], unknown: ['Perception +29', '(31 to Sense Motive) aquatic echolocation 120 feet'],
  },
  {
    creature: 'Brine Archdragon', source: 'Archives of Nethys', system: 'pathfinder2e',
    text: 'Perception +36; (38 to Sense Motive) aquatic echolocation 120 feet, greater darkvision',
    senses: [['Greater darkvision']], unknown: ['Perception +36', '(38 to Sense Motive) aquatic echolocation 120 feet'],
  },
  {
    creature: 'Young Time Dragon', source: 'Archives of Nethys', system: 'pathfinder2e',
    text: 'Perception +20; (21 initiative)  detect magic , greater darkvision',
    senses: [['Greater darkvision']], unknown: ['Perception +20', '(21 initiative) detect magic'],
  },
  {
    creature: 'Adult Time Dragon', source: 'Archives of Nethys', system: 'pathfinder2e',
    text: 'Perception +26; (28 initiative)  detect magic , greater darkvision',
    senses: [['Greater darkvision']], unknown: ['Perception +26', '(28 initiative) detect magic'],
  },
  {
    creature: 'Ancient Time Dragon', source: 'Archives of Nethys', system: 'pathfinder2e',
    text: 'Perception +33; (36 initiative)  detect magic , greater darkvision',
    senses: [['Greater darkvision']], unknown: ['Perception +33', '(36 initiative) detect magic'],
  },
  {
    creature: 'Time Archdragon', source: 'Archives of Nethys', system: 'pathfinder2e',
    text: 'Perception +38; (42 initiative)  detect magic , greater darkvision',
    senses: [['Greater darkvision']], unknown: ['Perception +38', '(42 initiative) detect magic'],
  },
  {
    creature: 'Conspirator Archdragon', source: 'Archives of Nethys', system: 'pathfinder2e',
    text: 'Perception +36; (38 to Sense Motive) darkvision, scent (imprecise) 60 feet',
    senses: [['Darkvision'], ['Scent', 60]], unknown: ['Perception +36 (38 to Sense Motive)'],
  },
  {
    creature: 'Deimavigga', source: 'Archives of Nethys', system: 'pathfinder2e',
    text: 'Perception +32; (36 to Sense Motive) greater darkvision',
    senses: [['Greater darkvision']], unknown: ['Perception +32 (36 to Sense Motive)'],
  },
  {
    creature: 'Stoneriver', source: 'Archives of Nethys', system: 'pathfinder2e',
    text: 'Perception +23; (33 to detect lies and illusions) darkvision, scent (imprecise) 60 feet',
    senses: [['Darkvision'], ['Scent', 60]], unknown: ['Perception +23 (33 to detect lies and illusions)'],
  },
  {
    creature: 'Balisse', source: 'Archives of Nethys', system: 'pathfinder2e',
    text: 'Perception +18; (20 to detect lies and illusions) darkvision',
    senses: [['Darkvision']], unknown: ['Perception +18 (20 to detect lies and illusions)'],
  },
  {
    creature: 'Young Conspirator Dragon', source: 'Archives of Nethys', system: 'pathfinder2e',
    text: 'Perception +16; (18 to Sense Motive) darkvision, scent (imprecise) 60 feet',
    senses: [['Darkvision'], ['Scent', 60]], unknown: ['Perception +16 (18 to Sense Motive)'],
  },
  {
    creature: 'Adult Conspirator Dragon', source: 'Archives of Nethys', system: 'pathfinder2e',
    text: 'Perception +23; (25 to Sense Motive) darkvision, scent (imprecise) 60 feet',
    senses: [['Darkvision'], ['Scent', 60]], unknown: ['Perception +23 (25 to Sense Motive)'],
  },
  {
    creature: 'Ancient Conspirator Dragon', source: 'Archives of Nethys', system: 'pathfinder2e',
    text: 'Perception +30; (32 to Sense Motive) darkvision, scent (imprecise) 60 feet',
    senses: [['Darkvision'], ['Scent', 60]], unknown: ['Perception +30 (32 to Sense Motive)'],
  },
  {
    creature: 'Faydhaan', source: 'Archives of Nethys', system: 'pathfinder2e',
    text: 'Perception +16; (18 to Sense Motive) darkvision, wavesense (imprecise) 60 feet',
    senses: [['Darkvision'], ['Wavesense', 60]], unknown: ['Perception +16 (18 to Sense Motive)'],
  },
  {
    creature: 'Vatumledor', source: 'Archives of Nethys', system: 'pathfinder2e',
    text: 'Perception +30; (32 to Sense Motive) darkvision, scent (imprecise) 60 feet',
    senses: [['Darkvision'], ['Scent', 60]], unknown: ['Perception +30 (32 to Sense Motive)'],
  },
  {
    creature: 'Saviya', source: 'Archives of Nethys', system: 'pathfinder2e',
    text: 'Perception +34; (37 to Seek) darkvision, perfect scent 60 feet',
    senses: [['Darkvision']], unknown: ['Perception +34 (37 to Seek)', 'perfect scent 60 feet'],
  },
  {
    creature: 'Planetar', source: 'Archives of Nethys', system: 'pathfinder2e',
    text: 'Perception +28; (32 to detect illusions) darkvision,  true seeing ',
    senses: [['Darkvision']], unknown: ['Perception +28 (32 to detect illusions)', 'true seeing'],
  },
  {
    creature: 'Domovoi', source: 'Archives of Nethys', system: 'pathfinder2e',
    text: 'Perception +11; tremorsense (imprecise) within their entire bound home',
    senses: [['Tremorsense']], unknown: ['Perception +11', 'within their entire bound home'],
  },
  {
    creature: 'Dvorovoi', source: 'Archives of Nethys', system: 'pathfinder2e',
    text: 'Perception +12; tremorsense (imprecise) within their entire bound yard',
    senses: [['Tremorsense']], unknown: ['Perception +12', 'within their entire bound yard'],
  },
  {
    creature: 'Ovinnik', source: 'Archives of Nethys', system: 'pathfinder2e',
    text: 'Perception +14; tremorsense (imprecise) within their entire bound granary or storeroom',
    senses: [['Tremorsense']], unknown: ['Perception +14', 'within their entire bound granary or storeroom'],
  },
  {
    creature: 'Lovelorn', source: 'Archives of Nethys', system: 'pathfinder2e',
    text: 'Perception +10; (12 to Sense Motive) darkvision, lifesense 30 feet',
    senses: [['Darkvision'], ['Lifesense', 30]], unknown: ['Perception +10 (12 to Sense Motive)'],
  },
  {
    creature: 'Nyktera', source: 'Archives of Nethys', system: 'pathfinder2e',
    text: 'Perception +6; (8 to Seek creatures using hearing) low-light vision',
    senses: [['Low-light vision']], unknown: ['Perception +6 (8 to Seek creatures using hearing)'],
  },
  {
    creature: 'Young Whisper Dragon', source: 'Archives of Nethys', system: 'pathfinder2e',
    text: 'Perception +15; (17 to Sense Motive) darkvision, scent (imprecise) 60 feet',
    senses: [['Darkvision'], ['Scent', 60]], unknown: ['Perception +15 (17 to Sense Motive)'],
  },
  {
    creature: 'Adult Whisper Dragon', source: 'Archives of Nethys', system: 'pathfinder2e',
    text: 'Perception +21; (23 to Sense Motive) darkvision, scent (imprecise) 60 feet',
    senses: [['Darkvision'], ['Scent', 60]], unknown: ['Perception +21 (23 to Sense Motive)'],
  },
  {
    creature: 'Ancient Whisper Dragon', source: 'Archives of Nethys', system: 'pathfinder2e',
    text: 'Perception +28; (30 to Sense Motive) darkvision, scent (imprecise) 60 feet',
    senses: [['Darkvision'], ['Scent', 60]], unknown: ['Perception +28 (30 to Sense Motive)'],
  },
  {
    creature: 'Odvolos', source: 'Archives of Nethys', system: 'pathfinder2e',
    text: 'Perception +12; (14 to detect concealed objects) fevered consciousness, scent (imprecise) 30 feet',
    senses: [['Scent', 30]], unknown: ['Perception +12', '(14 to detect concealed objects) fevered consciousness'],
  },
  {
    creature: 'Kuworsys', source: 'Archives of Nethys', system: 'pathfinder2e',
    text: 'Perception +22; (26 vs traps) infect scent (imprecise) 60 feet',
    senses: [], unknown: ['Perception +22', '(26 vs traps) infect scent (imprecise) 60 feet'],
  },
  {
    creature: 'Elk', source: 'Archives of Nethys', system: 'pathfinder2e',
    text: 'Perception +7; low-light vision, scent (imprecise 30 feet) ',
    senses: [['Low-light vision'], ['Scent', 30]], unknown: ['Perception +7'],
  },
  {
    creature: 'Cadaverous Rake', source: 'Archives of Nethys', system: 'pathfinder2e',
    text: 'Perception +16; (18 to initiative) darkvision',
    senses: [['Darkvision']], unknown: ['Perception +16 (18 to initiative)'],
  },
  {
    creature: 'Peerless Duelist', source: 'Archives of Nethys', system: 'pathfinder2e',
    text: 'Perception +24; (27 for initiative) tremorsense 30 feet',
    senses: [['Tremorsense', 30]], unknown: ['Perception +24 (27 for initiative)'],
  },
  {
    creature: 'Forlorn Artist', source: 'Archives of Nethys', system: 'pathfinder2e',
    text: 'Perception +7; (9 to notice unusual artwork) low-light vision',
    senses: [['Low-light vision']], unknown: ['Perception +7 (9 to notice unusual artwork)'],
  },
  {
    creature: 'Halfling Head Chef', source: 'Archives of Nethys', system: 'pathfinder2e',
    text: 'Perception +7; (15 to smell and taste) keen eyes, scent (imprecise) 30 feet',
    senses: [['Scent', 30]], unknown: ['Perception +7', '(15 to smell and taste) keen eyes'],
  },
  {
    creature: 'Kobold Trapper', source: 'Archives of Nethys', system: 'pathfinder2e',
    text: 'Perception +7; (9 to Seek for traps) darkvision',
    senses: [['Darkvision']], unknown: ['Perception +7 (9 to Seek for traps)'],
  },
  {
    creature: 'Swarm Voice', source: 'Archives of Nethys', system: 'pathfinder2e',
    text: 'Perception +9; (18 to Sense Motive) low-light vision',
    senses: [['Low-light vision']], unknown: ['Perception +9 (18 to Sense Motive)'],
  },
  {
    creature: 'Gambling Companion', source: 'Archives of Nethys', system: 'pathfinder2e',
    text: 'Perception +12; (14 to Sense Motive) low-light vision',
    senses: [['Low-light vision']], unknown: ['Perception +12 (14 to Sense Motive)'],
  },
  {
    creature: 'Emorga All-Seer', source: 'Archives of Nethys', system: 'pathfinder2e',
    text: 'Perception +21; (11 for initiative) low-light vision, scent (imprecise) 30 feet',
    senses: [['Low-light vision'], ['Scent', 30]], unknown: ['Perception +21 (11 for initiative)'],
  },
  {
    creature: 'Bonebleacher Bugbear', source: 'Archives of Nethys', system: 'pathfinder2e',
    text: 'Perception +25; darkvision, scent (30 feet)',
    senses: [['Darkvision'], ['Scent', 30]], unknown: ['Perception +25'],
  },
  {
    creature: 'Chimeric Phantom', source: 'Open5e, tob2', system: 'dnd5e',
    text: 'darkvision 60 ft. passive Perception 11',
    senses: [['Darkvision', 60]], unknown: ['passive Perception 11'],
  },
  {
    creature: 'Stone Creeper', source: 'Open5e, tob2', system: 'dnd5e',
    text: 'tremorsense 60 ft. (blind beyond this radius), passive Perception 8',
    senses: [['Tremorsense', 60]], unknown: ['passive Perception 8'], blindBeyond: true,
  },
  {
    creature: 'Swamp Lily', source: 'Open5e, tob2', system: 'dnd5e',
    text: 'tremorsense 60 ft. (blind beyond this radius), passive Perception 11',
    senses: [['Tremorsense', 60]], unknown: ['passive Perception 11'], blindBeyond: true,
  },
  {
    creature: 'Tetomatli', source: 'Open5e, tob2', system: 'dnd5e',
    text: 'tremorsense 90 ft. (blind beyond this radius), passive Perception 13',
    senses: [['Tremorsense', 90]], unknown: ['passive Perception 13'], blindBeyond: true,
  },
  {
    creature: 'Gloomflower', source: 'Open5e, cc', system: 'dnd5e',
    text: 'blindsight 120 ft. passive Perception 8',
    senses: [['Blindsight', 120]], unknown: ['passive Perception 8'],
  },
  {
    creature: 'Great Mandrake', source: 'Open5e, cc', system: 'dnd5e',
    text: 'tremorsense 60 ft. (blind beyond this radius), passive Perception 11',
    senses: [['Tremorsense', 60]], unknown: ['passive Perception 11'], blindBeyond: true,
  },
  {
    creature: 'Jaanavar Jal', source: 'Open5e, cc', system: 'dnd5e',
    text: 'blindsense 60 ft., passive Perception 14',
    senses: [['Blindsight', 60]], unknown: ['passive Perception 14'],
  },
  {
    creature: 'Jinmenju', source: 'Open5e, cc', system: 'dnd5e',
    text: 'darkvision 60 ft., tremorsense 120 ft. (blind beyond this radius), passive Perception 13',
    senses: [['Darkvision', 60], ['Tremorsense', 120]], unknown: ['passive Perception 13'], blindBeyond: 120,
  },
  {
    creature: 'Mandrake', source: 'Open5e, cc', system: 'dnd5e',
    text: 'tremorsense 60 ft. (blind beyond this radius), passive Perception 9',
    senses: [['Tremorsense', 60]], unknown: ['passive Perception 9'], blindBeyond: true,
  },
  {
    creature: 'Aural Hunter', source: 'Open5e, tob3', system: 'dnd5e',
    text: 'blindsight 60\' or 20\' while deafened (blind beyond), passive Perception 17',
    senses: [['Blindsight', 60]], unknown: ['or 20\' while deafened (blind beyond)', 'passive Perception 17'], blindBeyond: 60,
  },
  {
    creature: 'Dragonette, Shovel', source: 'Open5e, tob3', system: 'dnd5e',
    text: 'tremorsense 60\', darkvision 60\' passive Perception 13',
    senses: [['Tremorsense', 60], ['Darkvision', 60]], unknown: ['passive Perception 13'],
  },
  {
    creature: 'Hvalfiskr', source: 'Open5e, tob3', system: 'dnd5e',
    text: 'blindsight 120\' (whale form only), darkvision 120\' passive Perception 17',
    senses: [['Blindsight', 120], ['Darkvision', 120]], unknown: ['passive Perception 17'],
  },
  {
    creature: 'Grimlock', source: 'Open5e, wotc-srd', system: 'dnd5e',
    text: 'blindsight 30 ft. or 10 ft. while deafened (blind beyond this radius), passive Perception 13',
    senses: [['Blindsight', 30]], unknown: ['or 10 ft. while deafened (blind beyond this radius)', 'passive Perception 13'], blindBeyond: 30,
  },
  {
    creature: 'Grimlock', source: 'Open5e, menagerie', system: 'dnd5e',
    text: 'blindsight 30 ft., or 10 ft. while deafened (blind beyond this radius), passive Perception 14',
    senses: [['Blindsight', 30]], unknown: ['or 10 ft. while deafened (blind beyond this radius)', 'passive Perception 14'], blindBeyond: 30,
  },
  {
    creature: 'Baba Yaga\'s Horsemen, Black Night', source: 'Open5e, tob', system: 'dnd5e',
    text: 'Devil sight 120ft, passive Perception 18',
    senses: [['Devil\'s Sight', 120]], unknown: ['passive Perception 18'],
  },
  {
    creature: 'Blood Hag', source: 'Open5e, tob', system: 'dnd5e',
    text: 'blood sense 90 ft., darkvision 60 ft., passive Perception 19',
    senses: [['Darkvision', 60]], unknown: ['blood sense 90 ft.', 'passive Perception 19'],
  },
  {
    creature: 'Hulking Whelp', source: 'Open5e, tob', system: 'dnd5e',
    text: 'impaired sight 30 ft., passive Perception 12',
    senses: [], unknown: ['impaired sight 30 ft.', 'passive Perception 12'],
  },
  {
    creature: 'Lindwurm', source: 'Open5e, tob', system: 'dnd5e',
    text: 'darkvision 60 ft., tremorsense 120 ft. on ice, passive Perception 14',
    senses: [['Darkvision', 60], ['Tremorsense', 120]], unknown: ['on ice', 'passive Perception 14'],
  },
  {
    creature: 'Living Wick', source: 'Open5e, tob', system: 'dnd5e',
    text: 'sight 20 ft. (blind beyond the radius of its own light), passive Perception 10',
    senses: [], unknown: ['sight 20 ft. (blind beyond the radius of its own light)', 'passive Perception 10'], blindBeyond: 20,
  },
  {
    creature: 'Sea Dragon Wyrmling', source: 'Open5e, tob', system: 'dnd5e',
    text: 'blindsight 10 ft. darkvision 60 ft., passive Perception 14',
    senses: [['Blindsight', 10], ['Darkvision', 60]], unknown: ['passive Perception 14'],
  },
  {
    creature: 'Sharkjaw Skeleton', source: 'Open5e, tob', system: 'dnd5e',
    text: 'darkvision 60 ft., blindsense 30 ft., passive Perception 11',
    senses: [['Darkvision', 60], ['Blindsight', 30]], unknown: ['passive Perception 11'],
  },
  {
    creature: 'Young Sea Dragon', source: 'Open5e, tob', system: 'dnd5e',
    text: 'blindsight 30 ft. darkvision 120 ft., passive Perception 19',
    senses: [['Blindsight', 30], ['Darkvision', 120]], unknown: ['passive Perception 19'],
  },
  {
    creature: 'Animated Armor', source: 'Open5e, blackflag', system: 'dnd5e',
    text: 'keensense 60 ft. (can\'t sense beyond this radius)',
    senses: [], unknown: ['keensense 60 ft. (can\'t sense beyond this radius)'], blindBeyond: 60,
  },
  {
    creature: 'Crimson Jelly', source: 'Open5e, blackflag', system: 'dnd5e',
    text: 'keensense 10 ft. (can\'t sense beyond this radius)',
    senses: [], unknown: ['keensense 10 ft. (can\'t sense beyond this radius)'], blindBeyond: 10,
  },
  {
    creature: 'Grimlock', source: 'Open5e, blackflag', system: 'dnd5e',
    text: 'keensense 30 ft. (can\'t sense beyond this radius)',
    senses: [], unknown: ['keensense 30 ft. (can\'t sense beyond this radius)'], blindBeyond: 30,
  },
  {
    creature: 'Mycolid Commoner', source: 'Open5e, blackflag', system: 'dnd5e',
    text: 'keensense 120 ft. (can\'t sense beyond this radius)',
    senses: [], unknown: ['keensense 120 ft. (can\'t sense beyond this radius)'], blindBeyond: 120,
  },
  {
    creature: 'Shrieker', source: 'Open5e, blackflag', system: 'dnd5e',
    text: 'keensense 30 ft. (blind beyond this radius)',
    senses: [], unknown: ['keensense 30 ft. (blind beyond this radius)'], blindBeyond: 30,
  },
];
