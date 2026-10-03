import { seeing, sensesOf } from './senseHelpers';

/**
 * Old-School Essentials: infravision sees "the heat energy that radiates off of living things",
 * 60' unless noted, without fine detail, and "only functions in darkness".
 */
export const OLD_SCHOOL_ESSENTIALS_SENSES = sensesOf('ose', {
  infravision: {
    name: 'Infravision',
    description: 'Sees heat in the dark within its range, without fine detail. Light switches it off.',
    ...seeing({ bright: 'none', dim: 'none', dark: 'as-dim', magicalDark: 'none' }, 'heat'),
    range: 'required',
    defaultRange: 60,
    role: 'darkvision',
  },
});
