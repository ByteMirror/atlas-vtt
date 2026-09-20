export type ActionWidgetPreset = 'generic' | 'd20' | 'narrative' | 'power';

export type ActionWidgetLayout = 'stacked' | 'compact' | 'cards' | 'narrative';

export type ActionFieldKind =
  | 'name'
  | 'type'
  | 'tags'
  | 'check'
  | 'target'
  | 'range'
  | 'damage'
  | 'cost'
  | 'uses'
  | 'trigger'
  | 'requirement'
  | 'effect'
  | 'critical';

export type ActionFieldStyle = 'primary' | 'meta' | 'badge' | 'block';

export interface ActionFieldDefinition {
  kind: ActionFieldKind;
  label: string;
  description: string;
  placeholder: string;
  defaultStyle: ActionFieldStyle;
  supportedStyles: ActionFieldStyle[];
  supportsModifierBaseDice?: boolean;
}

export interface ActionFieldConfig {
  id: string;
  kind: ActionFieldKind;
  label: string;
  enabled: boolean;
  style: ActionFieldStyle;
  modifierBaseDice?: string;
}

export interface ActionWidgetConfig {
  preset: ActionWidgetPreset;
  layout: ActionWidgetLayout;
  repeatable: boolean;
  entryLabel: string;
  fields: ActionFieldConfig[];
}

export interface ActionEntry {
  id: string;
  values: Record<string, string>;
}

export const ACTION_FIELD_DEFINITIONS: Record<ActionFieldKind, ActionFieldDefinition> = {
  name: {
    kind: 'name',
    label: 'Name',
    description: 'Primary title for the action.',
    placeholder: 'Strike',
    defaultStyle: 'primary',
    supportedStyles: ['primary', 'meta'],
  },
  type: {
    kind: 'type',
    label: 'Type',
    description: 'Category, trait, or classification.',
    placeholder: 'Melee',
    defaultStyle: 'badge',
    supportedStyles: ['meta', 'badge'],
  },
  tags: {
    kind: 'tags',
    label: 'Tags',
    description: 'Traits or keywords.',
    placeholder: 'Brutal, Reliable',
    defaultStyle: 'meta',
    supportedStyles: ['meta', 'badge', 'block'],
  },
  check: {
    kind: 'check',
    label: 'Check',
    description: 'Attack bonus, roll, or check notation.',
    placeholder: '+7 to hit',
    defaultStyle: 'badge',
    supportedStyles: ['meta', 'badge'],
    supportsModifierBaseDice: true,
  },
  target: {
    kind: 'target',
    label: 'Target',
    description: 'Defense, save, or target line.',
    placeholder: 'vs AC',
    defaultStyle: 'meta',
    supportedStyles: ['meta', 'badge'],
  },
  range: {
    kind: 'range',
    label: 'Range',
    description: 'Range, reach, or area.',
    placeholder: 'Close',
    defaultStyle: 'meta',
    supportedStyles: ['meta', 'badge'],
  },
  damage: {
    kind: 'damage',
    label: 'Damage',
    description: 'Damage formula or result.',
    placeholder: '2d6+3',
    defaultStyle: 'badge',
    supportedStyles: ['meta', 'badge'],
  },
  cost: {
    kind: 'cost',
    label: 'Cost',
    description: 'Resource cost or price.',
    placeholder: '2 Focus',
    defaultStyle: 'meta',
    supportedStyles: ['meta', 'badge'],
  },
  uses: {
    kind: 'uses',
    label: 'Uses',
    description: 'Recharge, cooldown, or uses.',
    placeholder: 'Recharge 5-6',
    defaultStyle: 'badge',
    supportedStyles: ['meta', 'badge'],
  },
  trigger: {
    kind: 'trigger',
    label: 'Trigger',
    description: 'What causes the action to happen.',
    placeholder: 'When engaged',
    defaultStyle: 'block',
    supportedStyles: ['meta', 'block'],
  },
  requirement: {
    kind: 'requirement',
    label: 'Requirement',
    description: 'Prerequisite to use the action.',
    placeholder: 'Must wield a relic',
    defaultStyle: 'block',
    supportedStyles: ['meta', 'block'],
  },
  effect: {
    kind: 'effect',
    label: 'Effect',
    description: 'Outcome or rules text.',
    placeholder: 'The target is pushed back and knocked prone.',
    defaultStyle: 'block',
    supportedStyles: ['meta', 'block'],
  },
  critical: {
    kind: 'critical',
    label: 'Critical',
    description: 'Critical effect or bonus.',
    placeholder: 'Double damage and stun.',
    defaultStyle: 'block',
    supportedStyles: ['meta', 'block'],
  },
};

export const ACTION_FIELD_LIBRARY: ActionFieldDefinition[] = Object.values(ACTION_FIELD_DEFINITIONS);

export interface ActionWidgetPresetDefinition {
  id: ActionWidgetPreset;
  label: string;
  description: string;
  config: Omit<ActionWidgetConfig, 'fields'> & { fields: Array<Omit<ActionFieldConfig, 'id'>> };
}

export const ACTION_WIDGET_PRESETS: Record<ActionWidgetPreset, ActionWidgetPresetDefinition> = {
  generic: {
    id: 'generic',
    label: 'Generic',
    description: 'A flexible default for most systems.',
    config: {
      preset: 'generic',
      layout: 'stacked',
      repeatable: true,
      entryLabel: 'Action',
      fields: [
        { kind: 'name', label: 'Name', enabled: true, style: 'primary' },
        { kind: 'type', label: 'Type', enabled: true, style: 'badge' },
        { kind: 'range', label: 'Range', enabled: true, style: 'meta' },
        { kind: 'damage', label: 'Damage', enabled: true, style: 'badge' },
        { kind: 'effect', label: 'Effect', enabled: true, style: 'block' },
      ],
    },
  },
  d20: {
    id: 'd20',
    label: 'd20 Attack',
    description: 'Classic attack, range, and damage.',
    config: {
      preset: 'd20',
      layout: 'compact',
      repeatable: true,
      entryLabel: 'Attack',
      fields: [
        { kind: 'name', label: 'Name', enabled: true, style: 'primary' },
        { kind: 'check', label: 'To Hit', enabled: true, style: 'badge', modifierBaseDice: '1d20' },
        { kind: 'range', label: 'Range', enabled: true, style: 'meta' },
        { kind: 'damage', label: 'Damage', enabled: true, style: 'badge' },
        { kind: 'effect', label: 'Effect', enabled: false, style: 'block' },
      ],
    },
  },
  narrative: {
    id: 'narrative',
    label: 'Narrative Move',
    description: 'Trigger and effect focused layout.',
    config: {
      preset: 'narrative',
      layout: 'narrative',
      repeatable: true,
      entryLabel: 'Move',
      fields: [
        { kind: 'name', label: 'Name', enabled: true, style: 'primary' },
        { kind: 'trigger', label: 'Trigger', enabled: true, style: 'block' },
        { kind: 'effect', label: 'Effect', enabled: true, style: 'block' },
        { kind: 'cost', label: 'Cost', enabled: false, style: 'meta' },
      ],
    },
  },
  power: {
    id: 'power',
    label: 'Power',
    description: 'Powers, spells, or techniques with costs.',
    config: {
      preset: 'power',
      layout: 'cards',
      repeatable: true,
      entryLabel: 'Power',
      fields: [
        { kind: 'name', label: 'Name', enabled: true, style: 'primary' },
        { kind: 'type', label: 'Type', enabled: true, style: 'badge' },
        { kind: 'cost', label: 'Cost', enabled: true, style: 'badge' },
        { kind: 'uses', label: 'Uses', enabled: true, style: 'badge' },
        { kind: 'range', label: 'Range', enabled: true, style: 'meta' },
        { kind: 'effect', label: 'Effect', enabled: true, style: 'block' },
      ],
    },
  },
};

export const ACTION_LAYOUT_OPTIONS: Array<{ value: ActionWidgetLayout; label: string }> = [
  { value: 'stacked', label: 'Stacked' },
  { value: 'compact', label: 'Compact' },
  { value: 'cards', label: 'Cards' },
  { value: 'narrative', label: 'Narrative' },
];

function makeId(prefix: string): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return `${prefix}-${crypto.randomUUID().slice(0, 8)}`;
  }
  return `${prefix}-${Math.random().toString(36).slice(2, 10)}`;
}

export function createActionFieldConfig(
  kind: ActionFieldKind,
  overrides: Partial<Omit<ActionFieldConfig, 'kind'>> = {},
): ActionFieldConfig {
  const definition = ACTION_FIELD_DEFINITIONS[kind];
  const normalizedModifierBaseDice = definition.supportsModifierBaseDice
    ? (typeof overrides.modifierBaseDice === 'string' && overrides.modifierBaseDice.trim().length > 0
      ? overrides.modifierBaseDice.trim()
      : '1d20')
    : undefined;
  return {
    id: overrides.id ?? makeId(kind),
    kind,
    label: overrides.label ?? definition.label,
    enabled: overrides.enabled ?? true,
    style: overrides.style ?? definition.defaultStyle,
    ...(normalizedModifierBaseDice !== undefined && { modifierBaseDice: normalizedModifierBaseDice }),
  };
}

export function createActionWidgetConfig(preset: ActionWidgetPreset = 'generic'): ActionWidgetConfig {
  const presetDefinition = ACTION_WIDGET_PRESETS[preset];
  return {
    preset: presetDefinition.config.preset,
    layout: presetDefinition.config.layout,
    repeatable: presetDefinition.config.repeatable,
    entryLabel: presetDefinition.config.entryLabel,
    fields: presetDefinition.config.fields.map((field) => createActionFieldConfig(field.kind, field)),
  };
}

export function normalizeActionFieldConfig(field: Partial<ActionFieldConfig> | undefined): ActionFieldConfig | null {
  if (!field?.kind || !(field.kind in ACTION_FIELD_DEFINITIONS)) return null;
  const definition = ACTION_FIELD_DEFINITIONS[field.kind];
  const style = field.style && definition.supportedStyles.includes(field.style)
    ? field.style
    : definition.defaultStyle;

  const normalizedModifierBaseDice = definition.supportsModifierBaseDice
    ? (typeof field.modifierBaseDice === 'string' && field.modifierBaseDice.trim().length > 0
      ? field.modifierBaseDice.trim()
      : '1d20')
    : undefined;

  return {
    id: field.id ?? makeId(field.kind),
    kind: field.kind,
    label: typeof field.label === 'string' ? field.label : definition.label,
    enabled: field.enabled !== false,
    style,
    ...(normalizedModifierBaseDice !== undefined && { modifierBaseDice: normalizedModifierBaseDice }),
  };
}

export function normalizeActionWidgetConfig(config: Partial<ActionWidgetConfig> | undefined): ActionWidgetConfig {
  if (!config) {
    return createActionWidgetConfig('generic');
  }

  const preset = config.preset && config.preset in ACTION_WIDGET_PRESETS
    ? config.preset
    : 'generic';
  const presetDefinition = ACTION_WIDGET_PRESETS[preset];
  const normalizedFields = (config.fields ?? [])
    .map((field) => normalizeActionFieldConfig(field))
    .filter((field): field is ActionFieldConfig => field !== null);

  return {
    preset,
    layout: config.layout ?? presetDefinition.config.layout,
    repeatable: config.repeatable ?? presetDefinition.config.repeatable,
    entryLabel: config.entryLabel?.trim() || presetDefinition.config.entryLabel,
    fields: normalizedFields.length > 0 ? normalizedFields : createActionWidgetConfig(preset).fields,
  };
}

export function getActionFieldDefinition(kind: ActionFieldKind): ActionFieldDefinition {
  return ACTION_FIELD_DEFINITIONS[kind];
}

export function createActionEntry(config: ActionWidgetConfig, index = 0): ActionEntry {
  const entryLabel = `${config.entryLabel} ${index + 1}`;
  const nameField = config.fields.find((field) => field.kind === 'name');
  return {
    id: makeId('entry'),
    values: nameField ? { [nameField.id]: entryLabel } : {},
  };
}

export function normalizeActionEntries(value: unknown): ActionEntry[] {
  if (!Array.isArray(value)) return [];

  return value.flatMap((entry, index) => {
    if (!entry || typeof entry !== 'object') return [];

    const candidate = entry as Partial<ActionEntry> & { values?: unknown };
    const values = candidate.values && typeof candidate.values === 'object'
      ? Object.entries(candidate.values as Record<string, unknown>).reduce<Record<string, string>>((acc, [key, fieldValue]) => {
          if (typeof fieldValue === 'string') acc[key] = fieldValue;
          else if (typeof fieldValue === 'number') acc[key] = String(fieldValue);
          return acc;
        }, {})
      : {};

    return [{
      id: candidate.id ?? makeId(`entry-${index}`),
      values,
    }];
  });
}
