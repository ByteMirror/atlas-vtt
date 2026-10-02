import type { Message } from '../../types';

export const link = {
  'link.notFound': 'Statblock not found: {path}',
  'link.alreadyTitle': 'Statblock Already Linked',
  'link.alreadyBody': 'This statblock is already linked to another token. Do you want to unlink it and link to this token instead?',
  'link.linked': 'Token linked to statblock successfully',
  'link.unlinked': 'Token unlinked from statblock',
  'link.created': 'Created token from {name}',
  'link.noneCreated': 'No token created.',
  'link.importFailed': 'Could not import this statblock.',
  'link.unknown': 'Unknown',
} as const satisfies Record<string, Message>;
