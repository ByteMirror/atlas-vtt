import type { Message } from '../../types';

export const dice = {
  'dice.clearHistory': 'Clear history',
  'dice.clearSelection': 'Clear selection',
  'dice.closeHint': 'Close (Enter or Esc)',
  'dice.details': 'Details',
  'dice.log': 'Dice Log',
  'dice.noRolls': 'No rolls yet',
  'dice.pin': 'Pin panel open',
  'dice.roll': 'Roll dice',
  'dice.rollAgain': 'Roll again',
  'dice.rollShort': 'Roll',
  'dice.selectToRoll': 'Select dice to roll',
  'dice.unknown': 'Unknown',
  'dice.unpin': 'Unpin panel',
  'dice.player': 'Player',
  'dice.rollFormula': 'Roll {formula}',
} as const satisfies Record<string, Message>;
