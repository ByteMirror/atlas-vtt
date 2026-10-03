import type { SenseDefinition } from '../../types/senseTypes';
import { BY_LIGHT, IN_ANY_LIGHT, granting, seeing, sensing } from './senseHelpers';

/**
 * The sight every token with vision has: what is lit, as far as its sight range. Not a sense a
 * token is given, so no collection lists it; sight rules treat it as the first sense of all.
 */
export const NORMAL_SIGHT: SenseDefinition = {
  id: 'sight',
  name: 'Sight',
  description: 'Sees what is lit, as far as its sight range.',
  ...seeing(BY_LIGHT),
  range: 'optional',
};

/**
 * The senses of a collection without a game system, and of a system whose rules have none.
 * Darkvision and tremorsense behave as the token fields of those names did before senses.
 */
export const GENERIC_SENSES: readonly SenseDefinition[] = [
  {
    id: 'darkvision',
    name: 'Darkvision',
    description: 'Sees in the dark within its range, in shades of grey.',
    ...seeing({ bright: 'normal', dim: 'normal', dark: 'as-dim', magicalDark: 'none' }, 'monochrome'),
    range: 'required',
    role: 'darkvision',
  },
  {
    id: 'low-light-vision',
    name: 'Low-light vision',
    description: 'Sees in dim light as well as in bright light.',
    ...seeing({ bright: 'normal', dim: 'as-bright', dark: 'none', magicalDark: 'none' }),
    range: 'unlimited',
  },
  {
    id: 'blindsight',
    name: 'Blindsight',
    description: 'Perceives everything within its range without light, invisible creatures too. Walls stop it.',
    ...seeing(IN_ANY_LIGHT),
    seesInvisible: true,
    worksWhileBlinded: true,
    range: 'required',
  },
  {
    id: 'tremorsense',
    name: 'Tremorsense',
    description: 'Feels creatures on the ground within its range, through walls. They show as outlines.',
    ...sensing(),
    range: 'required',
    ignores: 'airborne',
    role: 'tremorsense',
  },
  {
    id: 'truesight',
    name: 'Truesight',
    description: 'Sees in any darkness within its range, and invisible creatures.',
    ...seeing(IN_ANY_LIGHT),
    seesInvisible: true,
    range: 'required',
  },
  {
    id: 'see-invisible',
    name: 'See invisible',
    description: 'Sees invisible creatures wherever its eyes see.',
    ...granting('see-invisible'),
  },
];
