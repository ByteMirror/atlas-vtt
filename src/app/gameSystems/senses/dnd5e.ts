import { IN_ANY_LIGHT, granting, seeing, sensing, sensesOf } from './senseHelpers';

/**
 * D&D 5e (SRD 5.2.1 glossary). Default distances are the most common ones in the SRD's
 * stat blocks; devil's sight is the invocation's 120 feet.
 */
export const DND_5E_SENSES = sensesOf('dnd5e', {
  // "Dim Light as if it were Bright Light and Darkness as if it were Dim Light", the latter "only as shades of gray".
  darkvision: {
    name: 'Darkvision',
    description: 'Sees dim light as bright and darkness as dim within its range, in shades of grey.',
    ...seeing({ bright: 'normal', dim: 'as-bright', dark: 'as-dim', magicalDark: 'none' }, 'monochrome'),
    range: 'required',
    defaultRange: 60,
    role: 'darkvision',
  },
  // "Anything that isn't behind Total Cover", also in darkness, while blinded, and what is invisible.
  blindsight: {
    name: 'Blindsight',
    description: 'Perceives everything within its range without light, invisible creatures too. Walls stop it.',
    ...seeing(IN_ANY_LIGHT),
    seesInvisible: true,
    worksWhileBlinded: true,
    range: 'required',
    defaultRange: 60,
  },
  // Creatures on the same surface; "can't detect creatures or objects in the air"; "doesn't count as a form of sight".
  tremorsense: {
    name: 'Tremorsense',
    description: 'Feels creatures on the ground within its range, through walls. They show as outlines.',
    ...sensing(),
    range: 'required',
    defaultRange: 60,
    ignores: 'airborne',
    role: 'tremorsense',
  },
  // "Normal and magical Darkness", and what is invisible.
  truesight: {
    name: 'Truesight',
    description: 'Sees in darkness, magical darkness too, and invisible creatures within its range.',
    ...seeing(IN_ANY_LIGHT),
    seesInvisible: true,
    range: 'required',
    defaultRange: 120,
  },
  // "See normally in Dim Light and Darkness, both magical and nonmagical".
  'devils-sight': {
    name: 'Devil\'s Sight',
    description: 'Sees normally in darkness and magical darkness within its range.',
    ...seeing(IN_ANY_LIGHT),
    range: 'required',
    defaultRange: 120,
  },
  // The spell: "you see creatures and objects that have the Invisible condition as if they were visible".
  'see-invisibility': {
    name: 'See Invisibility',
    description: 'Sees invisible creatures wherever its eyes see.',
    ...granting('see-invisible'),
  },
});
