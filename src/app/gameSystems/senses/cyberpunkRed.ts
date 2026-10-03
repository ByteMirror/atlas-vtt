import { seeing, sensesOf } from './senseHelpers';

/** Cyberpunk RED: the paired cybereye option that takes the penalties of darkness to 0. */
export const CYBERPUNK_RED_SENSES = sensesOf('cyberpunkred', {
  'low-light-ir-uv': {
    name: 'Low light / IR / UV',
    description: 'A cybereye that sees in darkness as well as in light.',
    ...seeing({ bright: 'normal', dim: 'as-bright', dark: 'as-bright', magicalDark: 'none' }),
    range: 'unlimited',
  },
});
