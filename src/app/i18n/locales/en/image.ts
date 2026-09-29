import type { Message } from '../../types';

export const image = {
  'image.copy': 'Copy image',
  'image.openDefault': 'Open in default app',
  'image.display': 'Display on player view',
  'image.copied': 'Image copied to clipboard',
  'image.copyFailed': 'Failed to copy image',
  'image.windowClosed': 'Player window is not open. Please open it first.',
  'image.windowUnavailable': 'Player window is not available',
  'image.displayFailed': 'Failed to display image on player view',
  'image.closed': 'Image display closed',
} as const satisfies Record<string, Message>;
