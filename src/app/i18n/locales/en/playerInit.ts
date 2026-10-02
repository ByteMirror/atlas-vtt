import type { Message } from '../../types';

export const playerInit = {
  'playerInit.order': 'Initiative order',
  'playerInit.round': 'Round {round}',
} as const satisfies Record<string, Message>;
