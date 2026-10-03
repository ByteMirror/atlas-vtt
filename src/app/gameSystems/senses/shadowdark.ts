import { seeing, sensesOf } from './senseHelpers';

/**
 * Shadowdark: "All characters need light to see, but that's not true for the darkness-adapted
 * beings of the Shadowdark." Characters have no such sense; that is the rule.
 */
export const SHADOWDARK_SENSES = sensesOf('shadowdark', {
  'darkness-adapted': {
    name: 'Darkness-adapted',
    description: 'Sees in darkness as well as in light.',
    ...seeing({ bright: 'normal', dim: 'as-bright', dark: 'as-bright', magicalDark: 'none' }),
    range: 'unlimited',
  },
});
