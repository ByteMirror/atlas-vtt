import type { Message } from '../../types';

export const resource = {
  'resource.edit': 'Edit {label}',
  'resource.current': 'Current {label}',
  'resource.max': 'Maximum {label}',
} as const satisfies Record<string, Message>;
