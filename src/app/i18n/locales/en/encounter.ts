import type { Message } from '../../types';

export const encounter = {
  'encounter.saveTitle': 'Save as encounter',
  'encounter.createWith': { one: 'Create an encounter with {count} token:', other: 'Create an encounter with {count} tokens:' },
  'encounter.tokens': 'Tokens:',
  'encounter.namePlaceholder': 'Enter encounter name...',
  'encounter.defaultName': 'Encounter {date}',
  'encounter.save': 'Save encounter',
  'encounter.noTokens': 'No tokens to save as an encounter',
  'encounter.description': { one: 'Encounter with {count} token', other: 'Encounter with {count} tokens' },
  'encounter.saved': 'Encounter "{name}" saved successfully!',
  'encounter.saveFailed': 'Failed to save encounter',
  'encounter.noImage': 'Selected tokens have no image and cannot be saved as an encounter',
} as const satisfies Record<string, Message>;
