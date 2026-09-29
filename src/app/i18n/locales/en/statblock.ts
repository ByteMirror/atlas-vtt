import type { Message } from '../../types';

export const statblock = {
  'statblock.assignToken': 'Assign token',
  'statblock.assignTokenHint': 'Assign a token to this statblock',
  'statblock.changeToken': 'Change token for this statblock',
  'statblock.creature': 'Creature',
  'statblock.decrease': 'Decrease {label}',
  'statblock.editNamed': 'Edit {name}',
  'statblock.editValue': 'Edit value',
  'statblock.increase': 'Increase {label}',
  'statblock.loading': 'Loading statblock…',
  'statblock.locate': 'Locate {label} on map',
  'statblock.pip': '{label} {n} of {max}',
  'statblock.pipDamage': '{label} damage {n} of {max}',
  'statblock.pluginMissing': 'Install and enable the Fantasy Statblocks plugin to preview statblocks.',
  'statblock.spellcasting': 'Spellcasting',
  'statblock.traitDescription': 'trait description',
  'statblock.traitName': 'trait name',
  'statblock.valueN': 'value {n}',
} as const satisfies Record<string, Message>;
