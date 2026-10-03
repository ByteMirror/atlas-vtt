import { IN_ANY_LIGHT, granting, seeing, sensing, sensesOf } from './senseHelpers';

/**
 * Pathfinder 2e (Player Core, Monster Core). Vision has no distance; the other senses take the
 * one a stat block lists, with a default where the rules name a usual one.
 */
export const PATHFINDER_2E_SENSES = sensesOf('pathfinder2e', {
  // Dim light "as though it were bright light".
  'low-light-vision': {
    name: 'Low-light vision',
    description: 'Sees in dim light as well as in bright light.',
    ...seeing({ bright: 'normal', dim: 'as-bright', dark: 'none', magicalDark: 'none' }),
    range: 'unlimited',
  },
  // "Perfectly well in areas of darkness and dim light", "in black and white only". In 4th-rank
  // darkness it "can barely see through the darkness", with targets concealed.
  darkvision: {
    name: 'Darkvision',
    description: 'Sees in darkness and dim light as well as in bright light, in black and white.',
    ...seeing({ bright: 'normal', dim: 'as-bright', dark: 'as-bright', magicalDark: 'as-dim' }, 'black-and-white'),
    range: 'unlimited',
    role: 'darkvision',
  },
  'greater-darkvision': {
    name: 'Greater darkvision',
    description: 'Sees like darkvision, and as well through magical darkness.',
    ...seeing(IN_ANY_LIGHT, 'black-and-white'),
    range: 'unlimited',
  },
  // Subjects "on the same surface", moving along or burrowing through it.
  tremorsense: {
    name: 'Tremorsense',
    description: 'Feels creatures moving on the ground within its range, through walls. They show as outlines.',
    ...sensing(),
    range: 'required',
    defaultRange: 30,
    ignores: 'airborne',
    role: 'tremorsense',
  },
  scent: {
    name: 'Scent',
    description: 'Smells creatures within its range, through walls. They show as outlines.',
    ...sensing(),
    range: 'required',
    defaultRange: 30,
  },
  // Atlas has no walls for sound, so hearing passes every wall.
  hearing: {
    name: 'Hearing',
    description: 'Hears creatures within its range, also through walls, but imprecisely: they show as outlines.',
    ...sensing(),
    range: 'required',
  },
  lifesense: {
    name: 'Lifesense',
    description: 'Senses living and undead creatures within its range, through walls. They show as outlines.',
    ...sensing(),
    range: 'required',
  },
  wavesense: {
    name: 'Wavesense',
    description: 'Feels creatures moving in the same water within its range. They show as outlines.',
    ...sensing(),
    range: 'required',
  },
  // Hearing as a precise sense: creatures are shown as they are, so walls stop it.
  echolocation: {
    name: 'Echolocation',
    description: 'Hears creatures within its range well enough to show them, also in darkness. Walls stop it.',
    ...sensing(true),
    lineOfSight: true,
    range: 'required',
    defaultRange: 20,
  },
  // The spell lets the eyes see invisible creatures; they stay concealed, which Atlas does not draw.
  'see-the-unseen': {
    name: 'See the Unseen',
    description: 'Sees invisible creatures wherever its eyes see.',
    ...granting('see-invisible'),
  },
});
