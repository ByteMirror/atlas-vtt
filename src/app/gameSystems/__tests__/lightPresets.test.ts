import { describe, expect, it } from 'vitest';
import { BUILT_IN_SYSTEM_PRESETS } from '../builtInPresets';
import { GENERIC_LIGHT_PRESETS } from '../lightPresets/generic';
import { collectionLightPresets, sameLightPresets } from '../lightPresetRules';
import { parseLightPresets, readCollectionLightPresets } from '../lightPresetValidation';
import { parseUserPreset } from '../presetValidation';
import { rulesOfPreset, sameSystemRules, vanillaSystemSettings } from '../systemRules';
import { LIGHT_KINDS } from '../../lighting/lightPresets';
import type { LightPresetDefinition } from '../../types/lightPresetTypes';
import type { SystemPreset } from '../../types/systemPresetTypes';

const preset = (name: string): SystemPreset => BUILT_IN_SYSTEM_PRESETS.find((candidate) => candidate.name === name)!;
const lights = (name: string): readonly LightPresetDefinition[] => preset(name).rules.lightPresets ?? [];
/** A table as the rules give it: id, name, bright radius, where the dim light ends, the marker's kind. */
const rows = (table: readonly LightPresetDefinition[]): unknown[] => table.map((light) => [light.id, light.name, light.bright, light.dim, light.kind]);

describe('built-in light presets', () => {
  it('keeps the generic four with their ids, counted in grid cells, the magical light as far as a torch, and adds a Darkness three cells wide', () => {
    expect(rows(GENERIC_LIGHT_PRESETS)).toEqual([
      ['candle', 'Candle', 1, 2, 'candle'],
      ['torch', 'Torch', 4, 8, 'torch'],
      ['lantern', 'Lantern', 6, 12, 'lantern'],
      ['magical', 'Magical light', 4, 8, 'magical'],
      ['darkness', 'Darkness', 0, 3, 'darkness'],
    ]);
    expect(GENERIC_LIGHT_PRESETS.filter((light) => light.darkness).map((light) => light.id)).toEqual(['darkness']);
    expect(new Set(GENERIC_LIGHT_PRESETS.map((light) => light.unit))).toEqual(new Set(['squares']));
  });

  it('says of every game system\'s table that its numbers are feet', () => {
    for (const name of ['D&D 5e', 'Pathfinder 2e', 'Shadowdark', 'Old-School Essentials', 'Cairn']) {
      expect(new Set(lights(name).map((light) => light.unit))).toEqual(new Set(['feet']));
    }
  });

  it('lists D&D 5e\'s light sources (SRD 5.2.1), its Darkness and the bullseye lantern\'s cone', () => {
    expect(rows(lights('D&D 5e'))).toEqual([
      ['dnd5e-candle', 'Candle', 5, 10, 'candle'],
      ['dnd5e-torch', 'Torch', 20, 40, 'torch'],
      ['dnd5e-hooded-lantern', 'Hooded lantern', 30, 60, 'lantern'],
      ['dnd5e-light', 'Light', 20, 40, 'magical'],
      ['dnd5e-lamp', 'Lamp', 15, 45, 'lantern'],
      ['dnd5e-continual-flame', 'Continual Flame', 20, 40, 'magical'],
      ['dnd5e-daylight', 'Daylight', 60, 120, 'magical'],
      ['dnd5e-darkness', 'Darkness', 0, 15, 'darkness'],
      ['dnd5e-bullseye-lantern', 'Bullseye lantern', 60, 120, 'lantern'],
    ]);
    // A 5e cone is as wide as it is long: 53°. Pathfinder's is a quarter circle.
    expect(lights('D&D 5e').filter((light) => light.angle).map((light) => [light.id, light.angle])).toEqual([['dnd5e-bullseye-lantern', 53]]);
    expect(lights('Pathfinder 2e').filter((light) => light.angle).map((light) => [light.id, light.bright, light.dim, light.angle])).toEqual([['pathfinder2e-bullseye-lantern', 60, 120, 90]]);
    // Darkness swallows the light of spells of its level or lower; Daylight, a level above, shines in it.
    const table = lights('D&D 5e');
    expect(table.find((light) => light.id === 'dnd5e-darkness')).toMatchObject({ darkness: true });
    expect(table.filter((light) => light.priority).map((light) => [light.id, light.priority])).toEqual([['dnd5e-daylight', 1]]);
  });

  it('lists Pathfinder 2e\'s light sources, a candle shedding dim light only', () => {
    expect(rows(lights('Pathfinder 2e'))).toEqual([
      ['pathfinder2e-candle', 'Candle', 0, 10, 'candle'],
      ['pathfinder2e-torch', 'Torch', 20, 40, 'torch'],
      ['pathfinder2e-hooded-lantern', 'Hooded lantern', 30, 60, 'lantern'],
      ['pathfinder2e-light', 'Light', 20, 40, 'magical'],
      ['pathfinder2e-everlight-crystal', 'Everlight crystal', 20, 40, 'magical'],
      ['pathfinder2e-glow-rod', 'Glow rod', 20, 60, 'magical'],
      ['pathfinder2e-darkness', 'Darkness', 0, 20, 'darkness'],
      ['pathfinder2e-bullseye-lantern', 'Bull\'s-eye lantern', 60, 120, 'lantern'],
    ]);
  });

  it('names Shadowdark\'s lights by the band they reach, in the collection\'s feet', () => {
    expect(rows(lights('Shadowdark'))).toEqual([
      ['shadowdark-torch', 'Torch (near)', 30, 30, 'torch'],
      ['shadowdark-lantern', 'Lantern (double near)', 60, 60, 'lantern'],
      ['shadowdark-light', 'Light spell (near)', 30, 30, 'magical'],
    ]);
  });

  it('lists the 30-foot lights of Old-School Essentials and Cairn\'s 40-foot torch', () => {
    expect(rows(lights('Old-School Essentials'))).toEqual([['ose-torch', 'Torch', 30, 30, 'torch'], ['ose-lantern', 'Lantern', 30, 30, 'lantern']]);
    expect(rows(lights('Cairn'))).toEqual([['cairn-torch', 'Torch', 40, 40, 'torch']]);
  });

  it('gives the systems without light rules none, so they use the generic ones', () => {
    for (const name of ['Daggerheart', 'Call of Cthulhu', 'Cyberpunk RED']) {
      expect(preset(name).rules).not.toHaveProperty('lightPresets');
      expect(collectionLightPresets({ systemPresetId: preset(name).id }, BUILT_IN_SYSTEM_PRESETS)).toBe(GENERIC_LIGHT_PRESETS);
    }
  });

  it('survives its own validation unchanged, with ids that are unique across all systems', () => {
    const tables = [GENERIC_LIGHT_PRESETS, ...BUILT_IN_SYSTEM_PRESETS.flatMap((system) => (system.rules.lightPresets ? [system.rules.lightPresets] : []))];
    for (const table of tables) expect(parseLightPresets(structuredClone(table))).toEqual(table);
    const ids = tables.flat().map((light) => light.id);
    expect(new Set(ids).size).toBe(ids.length);
    for (const light of tables.flat()) {
      expect(LIGHT_KINDS).toContain(light.kind);
      expect(light.dim).toBeGreaterThanOrEqual(light.bright);
      expect(light.color).toMatch(/^#[0-9a-f]{6}$/);
    }
  });
});

describe('collectionLightPresets', () => {
  const lamp: LightPresetDefinition = { id: 'home-lamp', name: 'Glow moss', bright: 5, dim: 15, color: '#7ee0a8', animation: 'none', kind: 'magical' };

  it('is the collection\'s own, else its preset\'s, else the generic ones', () => {
    const dnd5e = preset('D&D 5e');
    expect(collectionLightPresets({ lightPresets: [lamp], systemPresetId: dnd5e.id }, BUILT_IN_SYSTEM_PRESETS)).toEqual([lamp]);
    expect(collectionLightPresets({ systemPresetId: dnd5e.id }, BUILT_IN_SYSTEM_PRESETS)).toBe(dnd5e.rules.lightPresets);
    expect(collectionLightPresets({}, BUILT_IN_SYSTEM_PRESETS)).toBe(GENERIC_LIGHT_PRESETS);
    expect(collectionLightPresets({ systemPresetId: 'gone' }, BUILT_IN_SYSTEM_PRESETS)).toBe(GENERIC_LIGHT_PRESETS);
  });

  it('never leaves a collection without a light to place: an empty list falls through', () => {
    expect(collectionLightPresets({ lightPresets: [], systemPresetId: preset('Cairn').id }, BUILT_IN_SYSTEM_PRESETS)).toBe(preset('Cairn').rules.lightPresets);
  });

  it('reads stored presets field by field', () => {
    const stored = { systemPresetId: preset('Cairn').id, lightPresets: [{ ...lamp, extra: 1 }, { name: 'No id' }] };
    expect(readCollectionLightPresets(stored, BUILT_IN_SYSTEM_PRESETS)).toEqual([lamp]);
    expect(readCollectionLightPresets({ ...stored, lightPresets: 'torch' }, BUILT_IN_SYSTEM_PRESETS)).toBe(preset('Cairn').rules.lightPresets);
  });
});

describe('parseLightPresets', () => {
  const base = { id: 'a', name: 'Brazier', bright: 10, dim: 20, color: '#FF9A3C', animation: 'torch', kind: 'torch', sourceRadius: 2, intensity: 1.2 };

  it('keeps the unit a preset\'s numbers are in, and takes numbers without a known one as the collection\'s own', () => {
    for (const unit of ['feet', 'yards', 'meters', 'squares']) expect(parseLightPresets([{ ...base, unit }])?.[0]!.unit).toBe(unit);
    for (const unit of ['miles', 'cubits', 5, undefined]) expect(parseLightPresets([{ ...base, unit }])?.[0]).not.toHaveProperty('unit');
  });

  it('keeps a complete preset and is undefined for anything but a list', () => {
    expect(parseLightPresets([base])).toEqual([{ ...base, color: '#ff9a3c' }]);
    expect(parseLightPresets(undefined)).toBeUndefined();
    expect(parseLightPresets({})).toBeUndefined();
  });

  it('drops a preset without an id, a name or a reach, and the second of two with one id', () => {
    const list = [{ ...base, id: '' }, { ...base, id: 'b', name: '  ' }, { ...base, id: 'c', bright: 0, dim: 0 }, { ...base, id: 'd', dim: 'far' }, base, { ...base, name: 'Twin' }];
    expect(parseLightPresets(list)?.map((light) => light.name)).toEqual(['Brazier']);
  });

  it('keeps a beam angle of 1 to 359 degrees, and reads anything else as all around', () => {
    expect(parseLightPresets([{ ...base, angle: 53 }])?.[0]!.angle).toBe(53);
    for (const angle of [360, 0, -20, 'narrow', Number.NaN]) expect(parseLightPresets([{ ...base, angle }])?.[0]).not.toHaveProperty('angle');
  });

  it('keeps a darkness and a priority, and nothing of them that is not a switch or a number', () => {
    expect(parseLightPresets([{ ...base, darkness: true, priority: 2 }])?.[0]).toMatchObject({ darkness: true, priority: 2 });
    const plain = parseLightPresets([{ ...base, darkness: 'yes', priority: 'high' }, { ...base, id: 'b', darkness: false, priority: 0 }, { ...base, id: 'c', priority: Infinity }])!;
    for (const light of plain) {
      expect(light).not.toHaveProperty('darkness');
      expect(light).not.toHaveProperty('priority');
    }
  });

  it('repairs each field it cannot use rather than dropping the light', () => {
    const repaired = parseLightPresets([{ id: 'x', name: ' Glow ', bright: 30, dim: 10, color: 'orange', animation: 'strobe', kind: 'brazier', sourceRadius: 9, intensity: -1 }]);
    expect(repaired).toEqual([{ id: 'x', name: 'Glow', bright: 10, dim: 10, color: '#ffffff', animation: 'none', kind: 'custom', sourceRadius: 5, intensity: 0 }]);
    expect(parseLightPresets([{ ...base, bright: -5, sourceRadius: 0, intensity: 5 }])).toEqual([{ ...base, color: '#ff9a3c', bright: 0, sourceRadius: 0, intensity: 2 }]);
  });
});

describe('light presets in a game system\'s rules', () => {
  const dnd5e = preset('D&D 5e');
  const own: LightPresetDefinition = { id: 'home-1', name: 'Glow moss', bright: 5, dim: 15, color: '#7ee0a8', animation: 'none', kind: 'magical' };

  it('are not copied into a collection: it reads its preset\'s until they are edited', () => {
    expect(rulesOfPreset(dnd5e)).not.toHaveProperty('lightPresets');
    expect(vanillaSystemSettings()).toHaveProperty('lightPresets', undefined);
  });

  it('count as the preset\'s while the collection has none of its own, and as edited once they differ', () => {
    const { lightPresets: _lights, ...withoutLights } = dnd5e.rules;
    expect(sameSystemRules(dnd5e.rules, withoutLights)).toBe(true);
    expect(sameSystemRules(dnd5e.rules, { ...dnd5e.rules, lightPresets: structuredClone(dnd5e.rules.lightPresets!) })).toBe(true);
    expect(sameSystemRules(dnd5e.rules, { ...dnd5e.rules, lightPresets: [...dnd5e.rules.lightPresets!, own] })).toBe(false);
    expect(sameSystemRules(dnd5e.rules, { ...dnd5e.rules, lightPresets: dnd5e.rules.lightPresets!.map((light) => ({ ...light, dim: light.dim + 5 })) })).toBe(false);
  });

  it('compare a system without any as the generic ones', () => {
    expect(sameLightPresets(undefined, GENERIC_LIGHT_PRESETS)).toBe(true);
    expect(sameLightPresets(undefined, [own])).toBe(false);
    expect(sameLightPresets([{ ...own, color: '#7EE0A8' }], [own])).toBe(true);
    expect(sameLightPresets([{ ...own, intensity: 1 }], [own])).toBe(true);
    expect(sameLightPresets([{ ...own, unit: 'feet' }], [own])).toBe(false);
  });

  it('are read from a user preset field by field, and left out when it has none', () => {
    const stored = { id: 'user-1', name: 'Homebrew', rules: { gridDefaults: dnd5e.rules.gridDefaults, conditions: [], lightPresets: [own, { id: 'broken' }] } };
    expect(parseUserPreset(stored)?.rules.lightPresets).toEqual([own]);
    const { lightPresets: _lights, ...rules } = stored.rules;
    expect(parseUserPreset({ ...stored, rules })?.rules).not.toHaveProperty('lightPresets');
  });
});
