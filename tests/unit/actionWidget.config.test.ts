import { describe, expect, it } from 'vitest';
import {
  createActionFieldConfig,
  createActionWidgetConfig,
  normalizeActionWidgetConfig,
} from '../../src/app/types/actionWidget';

describe('actionWidget config helpers', () => {
  it('creates a generic config with the expected default field set', () => {
    const config = createActionWidgetConfig('generic');

    expect(config.preset).toBe('generic');
    expect(config.layout).toBe('stacked');
    expect(config.entryLabel).toBe('Action');
    expect(config.repeatable).toBe(true);
    expect(config.fields.map((field) => field.kind)).toEqual([
      'name',
      'type',
      'range',
      'damage',
      'effect',
    ]);
    expect(createActionFieldConfig('check')).toMatchObject({
      modifierBaseDice: '1d20',
    });
  });

  it('normalizes invalid styles and falls back to preset defaults when fields are missing', () => {
    const config = normalizeActionWidgetConfig({
      preset: 'narrative',
      fields: [
        createActionFieldConfig('check', { style: 'block' as any, modifierBaseDice: '' }),
        createActionFieldConfig('effect', { enabled: false }),
      ],
    });

    expect(config.preset).toBe('narrative');
    expect(config.layout).toBe('narrative');
    expect(config.fields).toHaveLength(2);
    expect(config.fields[0]).toMatchObject({
      kind: 'check',
      style: 'badge',
      enabled: true,
      modifierBaseDice: '1d20',
    });
    expect(config.fields[1]).toMatchObject({
      kind: 'effect',
      enabled: false,
      style: 'block',
    });

    const fallback = normalizeActionWidgetConfig({
      preset: 'power',
      fields: [],
    });

    expect(fallback.fields.map((field) => field.kind)).toEqual([
      'name',
      'type',
      'cost',
      'uses',
      'range',
      'effect',
    ]);
  });
});
