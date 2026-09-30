import { describe, expect, it } from 'vitest';
import { BUILT_IN_SYSTEM_PRESETS } from '../../src/app/gameSystems/builtInPresets';
import { parseUserPresets } from '../../src/app/gameSystems/presetValidation';
import {
  describeSystemRules,
  findActivePreset,
  sameSystemRules,
  rulesOfPreset,
  vanillaSystemSettings,
  withSystemWidgets,
} from '../../src/app/gameSystems/systemRules';
import { formatDistance, resolveMeasurementSettings } from '../../src/app/grid/measurementFormat';
import type { SystemPreset, SystemRules } from '../../src/app/types/systemPresetTypes';
import { WIDGET_ICON_PATHS } from '../../src/app/types/widgetIcons';

const [daggerheart, dnd5e] = BUILT_IN_SYSTEM_PRESETS as [SystemPreset, SystemPreset];

function rules(conditions: SystemRules['conditions']): SystemRules {
  return { gridDefaults: structuredClone(dnd5e.rules.gridDefaults), conditions };
}

describe('built-in presets', () => {
  it('name distances with the Daggerheart SRD grid conversion', () => {
    const settings = resolveMeasurementSettings(daggerheart.rules.gridDefaults, null);
    const label = (squares: number): string => formatDistance(squares, settings);
    expect([1, 2, 3, 4, 6, 7, 12, 13, 40].map(label)).toEqual([
      'Melee', 'Very Close', 'Very Close', 'Close', 'Close', 'Far', 'Far', 'Very Far', 'Very Far',
    ]);
  });

  it('name Shadowdark distances close, near, double near and far on 5-foot squares', () => {
    const shadowdark = BUILT_IN_SYSTEM_PRESETS.find((preset) => preset.name === 'Shadowdark')!;
    const settings = resolveMeasurementSettings(shadowdark.rules.gridDefaults, null);
    const label = (squares: number): string => formatDistance(squares, settings);
    expect([1, 2, 6, 7, 12, 13, 30].map(label)).toEqual([
      'Close', 'Near', 'Near', 'Double Near', 'Double Near', 'Far', 'Far',
    ]);
  });

  it('measure Old-School Essentials at its miniatures scale of 5 feet per square', () => {
    const ose = BUILT_IN_SYSTEM_PRESETS.find((preset) => preset.name === 'Old-School Essentials')!;
    const settings = resolveMeasurementSettings(ose.rules.gridDefaults, null);
    // The default encounter movement of 40' covers 8 squares.
    expect(formatDistance(8, settings)).toBe('40ft');
    expect(ose.rules.conditions.map((c) => c.name)).toContain('Paralysed');
  });

  it('measure Cairn in 5-foot squares with its core-rule conditions', () => {
    const cairn = BUILT_IN_SYSTEM_PRESETS.find((preset) => preset.name === 'Cairn')!;
    const settings = resolveMeasurementSettings(cairn.rules.gridDefaults, null);
    // A turn's 40ft of movement covers 8 squares.
    expect(formatDistance(8, settings)).toBe('40ft');
    expect(cairn.rules.conditions.find((c) => c.name === 'Fatigue')?.valued).toBe(true);
    expect(cairn.rules.conditions.map((c) => c.id)).toContain('cairn-critical-damage');
  });

  it('measure Pathfinder 2e in 5-foot squares with 5/10 diagonals and the Remaster conditions', () => {
    const pf2 = BUILT_IN_SYSTEM_PRESETS.find((preset) => preset.name === 'Pathfinder 2e')!;
    const settings = resolveMeasurementSettings(pf2.rules.gridDefaults, null);
    expect(settings.diagonalRule).toBe('alternating');
    expect(formatDistance(6, settings)).toBe('30ft');
    const names = pf2.rules.conditions.map((c) => c.name);
    expect(names).toHaveLength(35);
    expect(names).toContain('Off-Guard');
    expect(names).not.toContain('Flat-Footed');
  });

  it('measure Cyberpunk RED in 2-metre squares where a diagonal step costs one square', () => {
    const cyberpunk = BUILT_IN_SYSTEM_PRESETS.find((preset) => preset.name === 'Cyberpunk RED')!;
    const settings = resolveMeasurementSettings(cyberpunk.rules.gridDefaults, null);
    expect(settings.diagonalRule).toBe('equidistant');
    // MOVE 6 covers 6 squares, 12 m.
    expect(formatDistance(6, settings)).toBe('12m');
    expect(describeSystemRules(cyberpunk.rules)).toBe('2 m squares · 9 conditions');
  });

  it('measure Call of Cthulhu in yards, one per square, along the exact distance', () => {
    const coc = BUILT_IN_SYSTEM_PRESETS.find((preset) => preset.name === 'Call of Cthulhu')!;
    const settings = resolveMeasurementSettings(coc.rules.gridDefaults, null);
    expect(settings.diagonalRule).toBe('euclidean');
    // A .38 revolver's base range of 15 yards.
    expect(formatDistance(15, settings)).toBe('15yd');
    expect(describeSystemRules(coc.rules)).toBe('1 yd squares · 9 conditions');
  });

  it('measure D&D 5e in 5-foot squares with every diagonal counting 5 feet', () => {
    const settings = resolveMeasurementSettings(dnd5e.rules.gridDefaults, null);
    expect(settings.diagonalRule).toBe('equidistant');
    expect(formatDistance(6, settings)).toBe('30ft');
  });

  it('carry the core conditions of each system with known icons and unique ids', () => {
    expect(daggerheart.rules.conditions.map((c) => c.name)).toEqual(['Hidden', 'Restrained', 'Vulnerable']);
    expect(dnd5e.rules.conditions).toHaveLength(15);
    for (const preset of BUILT_IN_SYSTEM_PRESETS) {
      const ids = preset.rules.conditions.map((c) => c.id);
      expect(new Set(ids).size).toBe(ids.length);
      for (const condition of preset.rules.conditions) {
        expect(condition.icon && condition.icon in WIDGET_ICON_PATHS).toBe(true);
      }
    }
  });
});

describe('rulesOfPreset', () => {
  it('copies the preset\'s rules with its own condition ids, so nothing of the previous system carries over', () => {
    const rules = rulesOfPreset(daggerheart);
    expect(rules.conditions.map((c) => c.id)).toEqual(['daggerheart-hidden', 'daggerheart-restrained', 'daggerheart-vulnerable']);
    expect(rules.gridDefaults).toEqual(daggerheart.rules.gridDefaults);
    expect(rules.gridDefaults).not.toBe(daggerheart.rules.gridDefaults);
    expect(rules.conditions[0]).not.toBe(daggerheart.rules.conditions[0]);
  });
});

describe('comparing and describing rules', () => {
  it('ignores condition ids and colour case', () => {
    const a = rules([{ id: 'x', name: 'Prone', color: '#AABBCC' }]);
    const b = rules([{ id: 'y', name: 'Prone', color: '#aabbcc' }]);
    expect(sameSystemRules(a, b)).toBe(true);
    expect(sameSystemRules(a, { ...b, gridDefaults: { ...b.gridDefaults, unitDistance: 10 } })).toBe(false);
  });

  it('summarises measurement and conditions', () => {
    expect(describeSystemRules(dnd5e.rules)).toBe('5 ft squares · 15 conditions');
    expect(describeSystemRules(daggerheart.rules)).toBe('5 range bands · 3 conditions');
  });

  it('finds the recorded preset, or the one whose rules match', () => {
    const edited = rules([]);
    expect(findActivePreset(BUILT_IN_SYSTEM_PRESETS, dnd5e.id, edited)?.id).toBe(dnd5e.id);
    expect(findActivePreset(BUILT_IN_SYSTEM_PRESETS, 'deleted', structuredClone(daggerheart.rules))?.id).toBe(daggerheart.id);
    expect(findActivePreset(BUILT_IN_SYSTEM_PRESETS, undefined, edited)).toBeUndefined();
  });
});

describe('parseUserPresets', () => {
  const valid = {
    id: 'p1',
    name: ' Homebrew ',
    rules: {
      gridDefaults: { unitType: 'meters', unitDistance: 1.5, measurementMode: 'metric' },
      conditions: [
        { id: 'c1', name: 'Dazed', color: '#123456', icon: 'not-an-icon' },
        { id: 'c2', name: 'Broken', color: 'red' },
      ],
    },
  };

  it('keeps usable presets and drops what cannot be used', () => {
    const parsed = parseUserPresets([
      valid,
      { ...valid, name: 'Duplicate id' },
      { ...valid, id: 'builtin:dnd5e' },
      { ...valid, id: 'p2', rules: { ...valid.rules, gridDefaults: { unitType: 'miles' } } },
      'garbage',
    ]);
    expect(parsed).toEqual([{
      id: 'p1',
      name: 'Homebrew',
      builtIn: false,
      rules: {
        gridDefaults: {
          unitType: 'meters', unitDistance: 1.5, measurementMode: 'metric', diagonalRule: 'equidistant', abstractRangeBands: [],
        },
        conditions: [{ id: 'c1', name: 'Dazed', color: '#123456' }],
      },
    }]);
  });

  it('reads anything that is not a list as no presets', () => {
    expect(parseUserPresets(undefined)).toEqual([]);
    expect(parseUserPresets({})).toEqual([]);
  });
});

describe('preset widgets', () => {
  const shadowdark = BUILT_IN_SYSTEM_PRESETS.find((preset) => preset.name === 'Shadowdark')!;
  const torch = shadowdark.rules.widgets![0]!;
  const fear = { id: 'fear', type: 'counter', label: 'Fear', icon: 'skull', visible: true, visibleToPlayers: true, value: 3, order: 4, scope: 'collection' } as const;

  it('gives Shadowdark a shared one-hour torch timer', () => {
    expect(torch).toMatchObject({ type: 'timer', label: 'Torch', icon: 'torch', duration: 3600, value: 3600, scope: 'collection' });
    expect(describeSystemRules(shadowdark.rules)).toBe('4 range bands · 10 conditions · Torch timer');
  });

  it('gives a collection exactly its system\'s widgets and keeps the user\'s own', () => {
    const withTorch = withSystemWidgets({ fear }, BUILT_IN_SYSTEM_PRESETS, shadowdark.id);
    expect(withTorch.fear).toBe(fear);
    expect(withTorch[torch.id]).toMatchObject({ label: 'Torch', order: 5 });

    expect(withSystemWidgets(withTorch, BUILT_IN_SYSTEM_PRESETS, dnd5e.id)).toEqual({ fear });
    expect(withSystemWidgets(withTorch, BUILT_IN_SYSTEM_PRESETS, undefined)).toEqual({ fear });
  });

  it('keeps a running timer and returns the same record when nothing changes', () => {
    const current = { fear, [torch.id]: { ...torch, value: 1200 } };
    expect(withSystemWidgets(current, BUILT_IN_SYSTEM_PRESETS, shadowdark.id)).toBe(current);
  });

  it('reads the widgets of stored presets and drops unusable ones', () => {
    const [preset] = parseUserPresets([{
      id: 'p1',
      name: 'Torchlit',
      rules: {
        gridDefaults: { unitType: 'feet', unitDistance: 5, measurementMode: 'metric' },
        conditions: [],
        widgets: [{ ...torch, scope: 'scene', icon: 'unknown-icon' }, { id: 'x', type: 'timer', label: 'No duration', value: 1 }],
      },
    }]);
    expect(preset?.rules.widgets).toEqual([{ ...torch, icon: 'star' }]);
  });
});

describe('default token vision', () => {
  const withVision = (vision: SystemRules['defaultTokenVision']): SystemRules => ({ ...rules([]), ...(vision && { defaultTokenVision: vision }) });
  const stored = (defaultTokenVision: unknown) => ({
    id: 'p1',
    name: 'Homebrew',
    rules: { gridDefaults: { unitType: 'feet', unitDistance: 5, measurementMode: 'metric' }, conditions: [], defaultTokenVision },
  });

  it('is copied by rulesOfPreset, not shared with the preset', () => {
    const preset: SystemPreset = { id: 'user', name: 'Night', builtIn: false, rules: withVision({ darkvision: 60, angle: 120 }) };
    const copied = rulesOfPreset(preset);
    expect(copied.defaultTokenVision).toEqual({ darkvision: 60, angle: 120 });
    expect(copied.defaultTokenVision).not.toBe(preset.rules.defaultTokenVision);
  });

  it('is left out of rulesOfPreset for a system that sets none', () => {
    expect(rulesOfPreset(dnd5e)).not.toHaveProperty('defaultTokenVision');
  });

  it('is cleared by the vanilla settings', () => {
    expect(vanillaSystemSettings().defaultTokenVision).toBeUndefined();
  });

  it('marks a preset as edited when it changes, and treats none and empty alike', () => {
    expect(sameSystemRules(withVision({ darkvision: 60 }), withVision({ darkvision: 60 }))).toBe(true);
    expect(sameSystemRules(withVision({ darkvision: 60 }), withVision({ darkvision: 30 }))).toBe(false);
    expect(sameSystemRules(withVision({ darkvision: 60 }), withVision(undefined))).toBe(false);
    expect(sameSystemRules(withVision({ tremorsense: 10 }), withVision({ darkvision: 10 }))).toBe(false);
    expect(sameSystemRules(withVision({ range: 30, angle: 90 }), withVision({ angle: 90, range: 30 }))).toBe(true);
    expect(sameSystemRules(withVision({}), withVision(undefined))).toBe(true);
  });

  it('is read field by field from stored presets', () => {
    const [preset] = parseUserPresets([stored({ range: 60, darkvision: 30, tremorsense: 10, angle: 90 })]);
    expect(preset?.rules.defaultTokenVision).toEqual({ range: 60, darkvision: 30, tremorsense: 10, angle: 90 });
  });

  it('drops invalid fields and unknown ones, keeping the valid ones', () => {
    const [preset] = parseUserPresets([stored({ range: -5, darkvision: '60', tremorsense: 0, angle: 0, enabled: true, other: 1 })]);
    expect(preset?.rules.defaultTokenVision).toEqual({ tremorsense: 0 });
    const [wide] = parseUserPresets([stored({ angle: 361, darkvision: Infinity, range: 25 })]);
    expect(wide?.rules.defaultTokenVision).toEqual({ range: 25 });
    const [full] = parseUserPresets([stored({ angle: 360 })]);
    expect(full?.rules.defaultTokenVision).toEqual({ angle: 360 });
  });

  it('is absent when nothing usable is stored', () => {
    for (const raw of [undefined, null, 'dark', [], {}, { angle: 0 }]) {
      const [preset] = parseUserPresets([stored(raw)]);
      expect(preset).toBeDefined();
      expect(preset).not.toHaveProperty('rules.defaultTokenVision');
    }
  });

  it('is never set on a built-in preset unless every character of the system has it, and then it is valid', () => {
    for (const preset of BUILT_IN_SYSTEM_PRESETS) {
      const vision = preset.rules.defaultTokenVision;
      if (!vision) continue;
      const [parsed] = parseUserPresets([{ ...stored(vision), id: 'copy' }]);
      expect(parsed?.rules.defaultTokenVision).toEqual(vision);
    }
  });
});
