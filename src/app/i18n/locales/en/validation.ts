import type { Message } from '../../types';

export const validation = {
  'validation.mapBackground': 'Map Background',
  'validation.missing': 'Missing assets detected:',
  'validation.tokenImages': { one: '{count} token image', other: '{count} token images' },
  'validation.backgrounds': { one: '{count} map background', other: '{count} map backgrounds' },
  'validation.placeholders': 'Missing assets will display as placeholders.',
} as const satisfies Record<string, Message>;
