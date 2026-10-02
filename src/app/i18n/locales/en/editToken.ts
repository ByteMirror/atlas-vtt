import type { Message } from '../../types';

export const editToken = {
  'editToken.none': 'None',
  'editToken.statblockDefault': 'Statblock default: {value}',
  'editToken.title': 'Edit Token',
  'editToken.name': 'Name',
  'editToken.namePlaceholder': 'Token name',
  'editToken.showNameplate': 'Show Nameplate',
  'editToken.resources': 'Resources',
  'editToken.maxHp': 'Max HP',
  'editToken.resetStatblock': 'Reset to statblock default',
  'editToken.maxSecondary': 'Max Secondary Resource',
} as const satisfies Record<string, Message>;
