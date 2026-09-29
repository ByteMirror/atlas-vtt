import type { Message } from '../../types';

export const picker = {
  'picker.none.bases': 'No bases match “{query}”',
  'picker.none.notes': 'No notes match “{query}”',
  'picker.recent': 'Recently modified',
  'picker.results': 'Results',
  'picker.search.bases': 'Search bases',
  'picker.search.notes': 'Search notes',
  'picker.searchPlaceholder.bases': 'Search bases...',
  'picker.searchPlaceholder.notes': 'Search notes...',
  'picker.token.title': 'Select Token for {name}',
  'picker.token.failed': 'Failed to load token picker',
  'picker.token.search': 'Search tokens...',
  'picker.token.removeCurrent': 'Remove current token assignment',
  'picker.token.current': 'Currently assigned:',
  'picker.token.loading': 'Loading tokens...',
  'picker.token.noMatch': 'No tokens found matching your search.',
  'picker.token.none': 'No tokens available.',
  'picker.token.select': 'Select a token to assign:',
  'picker.token.reassign': 'Select a different token to reassign:',
} as const satisfies Record<string, Message>;
