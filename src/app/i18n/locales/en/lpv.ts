import type { Message } from '../../types';

export const lpv = {
  'lpv.alreadyOpen': 'Player window is already open',
  'lpv.interface': 'Interface',
  'lpv.notePreviews': 'Note previews',
  'lpv.notePreviewsHint': 'Note previews are not shared with the player window.',
  'lpv.openWindow': 'Open player window',
  'lpv.showDiceRolls': 'Show dice rolls',
  'lpv.showInitiative': 'Show initiative panel',
  'lpv.showWidgets': 'Show widgets',
  'lpv.tokens': 'Tokens',
} as const satisfies Record<string, Message>;
