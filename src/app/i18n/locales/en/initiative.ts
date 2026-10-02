import type { Message } from '../../types';

export const initiative = {
  'initiative.card': 'initiative card',
  'initiative.edit': 'Edit Initiative',
  'initiative.editHint': 'Enter to save · Esc to cancel',
  'initiative.remove': 'Remove from Initiative',
  'initiative.roll': 'Roll Initiative',
  'initiative.toBack': 'Move to Back',
  'initiative.toFront': 'Move to Front',
  'initiative.token': 'Token',
} as const satisfies Record<string, Message>;
