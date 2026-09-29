import type { Message } from '../../types';

export const tokens = {
  'tokens.showBadges': 'Show instance badges',
  'tokens.showBadgesHint': 'Numbers tokens that share an image',
  'tokens.showHP': 'Show HP bars',
  'tokens.showNameplates': 'Show nameplates',
  'tokens.showSecondary': 'Show secondary resource bars',
} as const satisfies Record<string, Message>;
