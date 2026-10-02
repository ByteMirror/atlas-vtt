import type { Message } from '../../types';

export const wall = {
  'wall.placeDoor': 'Place door',
  'wall.placeSecretDoor': 'Place secret door',
  'wall.direction': 'Light direction',
  'wall.blockBoth': 'Block both sides',
  'wall.allowLeft': 'Allow from left',
  'wall.allowRight': 'Allow from right',
  'wall.deleteMany': { one: 'Delete ({count} wall)', other: 'Delete ({count} walls)' },
} as const satisfies Record<string, Message>;
