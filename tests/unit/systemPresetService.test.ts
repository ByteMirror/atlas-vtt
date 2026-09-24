import { describe, expect, it } from 'vitest';
import { BUILT_IN_SYSTEM_PRESETS } from '../../src/app/gameSystems/builtInPresets';
import { SystemPresetService } from '../../src/app/services/SystemPresetService';
import type { SystemRules } from '../../src/app/types/systemPresetTypes';
import { memorySettings } from '../mocks/memorySettings';

const rules: SystemRules = structuredClone(BUILT_IN_SYSTEM_PRESETS[1]!.rules);

describe('SystemPresetService', () => {
  it('lists built-in presets first, then the user presets by name', () => {
    const service = new SystemPresetService(memorySettings());
    service.create('Zeta', rules);
    service.create('Alpha', rules);
    expect(service.list().map((p) => p.name)).toEqual([...BUILT_IN_SYSTEM_PRESETS.map((p) => p.name), 'Alpha', 'Zeta']);
  });

  it('rejects empty and taken names, ignoring case', () => {
    const service = new SystemPresetService(memorySettings());
    const preset = service.create('Homebrew', rules);
    expect(service.nameError('  ')).toBe('Enter a name');
    expect(service.nameError('daggerheart')).toBe('A preset with this name already exists');
    expect(service.nameError('HOMEBREW')).toBe('A preset with this name already exists');
    expect(service.nameError('Homebrew', preset.id)).toBeNull();
    expect(() => service.create('homebrew', rules)).toThrow();
  });

  it('renames, updates and deletes user presets but never built-in ones', () => {
    const service = new SystemPresetService(memorySettings());
    const preset = service.create('Homebrew', rules);
    service.rename(preset.id, 'House Rules');
    service.update(preset.id, { ...rules, conditions: [] });
    expect(service.list().find((p) => p.id === preset.id)).toMatchObject({ name: 'House Rules', rules: { conditions: [] } });
    expect(() => service.rename(BUILT_IN_SYSTEM_PRESETS[0]!.id, 'Mine')).toThrow();
    service.delete(BUILT_IN_SYSTEM_PRESETS[0]!.id);
    service.delete(preset.id);
    expect(service.list()).toHaveLength(BUILT_IN_SYSTEM_PRESETS.length);
  });

  it('keeps fields a newer version stored when editing a preset', () => {
    const settings = memorySettings({ systemPresets: [{ id: 'p1', name: 'Future', addedLater: true, rules: { ...rules, vision: { enabled: true } } }] });
    const service = new SystemPresetService(settings);
    service.update('p1', rules);
    expect(settings.current.systemPresets?.[0]).toMatchObject({ addedLater: true, rules: { vision: { enabled: true } } });
  });

  it('stores a copy, so later edits to the rules do not leak into the preset', () => {
    const service = new SystemPresetService(memorySettings());
    const draft = structuredClone(rules);
    const preset = service.create('Snapshot', draft);
    draft.conditions.pop();
    expect(service.list().find((p) => p.id === preset.id)?.rules.conditions).toHaveLength(15);
  });
});
