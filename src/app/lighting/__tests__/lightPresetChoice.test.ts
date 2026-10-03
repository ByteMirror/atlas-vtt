import { describe, expect, it } from 'vitest';
import { BUILT_IN_SYSTEM_PRESETS } from '../../gameSystems/builtInPresets';
import { GENERIC_LIGHT_PRESETS } from '../../gameSystems/lightPresets/generic';
import type { GameUnit } from '../../grid/statedDistance';
import type { LightPresetDefinition } from '../../types/lightPresetTypes';
import type { LightKind } from '../../types/lightingTypes';
import { asCustomLight, chosenLightPreset, defaultLightPreset, emissionOf, lightPresetChips, lightPresetOf, lightPresetsOnMap } from '../lightPresetChoice';
import { LIGHT_PRESETS, lightKindOf } from '../lightPresets';

const dnd5e = BUILT_IN_SYSTEM_PRESETS.find((preset) => preset.name === 'D&D 5e')!.rules.lightPresets!;
const cairn = BUILT_IN_SYSTEM_PRESETS.find((preset) => preset.name === 'Cairn')!.rules.lightPresets!;
const FEET: GameUnit = { unitType: 'feet', unitDistance: 5 };
const named = (table: readonly LightPresetDefinition[], name: string): LightPresetDefinition => table.find((light) => light.name === name)!;
const names = (table: readonly LightPresetDefinition[]): string[] => table.map((light) => light.name);

describe('emissionOf', () => {
  it('is the preset\'s light with its kind and the preset it came from', () => {
    const lamp = named(dnd5e, 'Lamp');
    expect(emissionOf(lamp)).toEqual({ bright: 15, dim: 45, color: lamp.color, intensity: 1, animation: lamp.animation, sourceRadius: lamp.sourceRadius, kind: 'lantern', preset: lamp.id });
  });

  it('carries a darkness and a priority, and names neither on a light that has none', () => {
    expect(emissionOf(named(dnd5e, 'Darkness'))).toMatchObject({ darkness: true, bright: 0, dim: 15, kind: 'darkness', preset: 'dnd5e-darkness' });
    expect(emissionOf(named(dnd5e, 'Daylight'))).toMatchObject({ priority: 1 });
    expect(emissionOf(named(dnd5e, 'Torch'))).not.toHaveProperty('darkness');
    expect(emissionOf(named(dnd5e, 'Torch'))).not.toHaveProperty('priority');
  });

  it('carries the angle of a light that shines one way', () => {
    expect(emissionOf(named(dnd5e, 'Bullseye lantern'))).toMatchObject({ bright: 60, dim: 120, angle: 53, kind: 'lantern', preset: 'dnd5e-bullseye-lantern' });
    expect(emissionOf(named(dnd5e, 'Hooded lantern'))).not.toHaveProperty('angle');
    // A light of that kind without a record is the first of its kind that shines as it does.
    const { preset: _preset, ...unrecorded } = emissionOf(named(dnd5e, 'Bullseye lantern'));
    expect(lightPresetOf(unrecorded, dnd5e)?.name).toBe('Bullseye lantern');
  });

  it('gives a generic preset the light it always had on a 5-foot grid', () => {
    for (const preset of lightPresetsOnMap(GENERIC_LIGHT_PRESETS, FEET, Infinity)) {
      const id = preset.id as keyof typeof LIGHT_PRESETS;
      expect(emissionOf(preset)).toEqual({ ...LIGHT_PRESETS[id].emission, kind: id, preset: id });
    }
  });
});

describe('lightPresetsOnMap', () => {
  const reach = (table: readonly LightPresetDefinition[], unit: GameUnit, name: string, maxRange = Infinity): [number, number] => {
    const light = named(lightPresetsOnMap(table, unit, maxRange), name);
    return [light.bright, light.dim];
  };
  const gridOf = (name: string): GameUnit => BUILT_IN_SYSTEM_PRESETS.find((preset) => preset.name === name)!.rules.gridDefaults;

  it('gives D&D 5e\'s lights in feet to a collection that measures in feet', () => {
    expect(reach(dnd5e, FEET, 'Torch')).toEqual([20, 40]);
    expect(reach(dnd5e, FEET, 'Lamp')).toEqual([15, 45]);
  });

  it('converts them for a collection in metres as the rulebooks do: 5 feet are 1.5 metres', () => {
    const metres: GameUnit = { unitType: 'meters', unitDistance: 1.5 };
    expect(reach(dnd5e, metres, 'Torch')).toEqual([6, 12]);
    expect(reach(dnd5e, metres, 'Daylight')).toEqual([18, 36]);
    expect(reach(dnd5e, metres, 'Candle')).toEqual([1.5, 3]);
  });

  it('counts a 5-foot rules square as one cell where a collection measures in squares', () => {
    expect(reach(dnd5e, { unitType: 'units', unitDistance: 1 }, 'Torch')).toEqual([4, 8]);
    expect(reach(dnd5e, { unitType: 'custom', unitDistance: 2 }, 'Hooded lantern')).toEqual([12, 24]);
  });

  it('gives the generic lights the same cells in every collection: Cyberpunk RED\'s 2 m squares, Call of Cthulhu\'s yards', () => {
    expect(reach(GENERIC_LIGHT_PRESETS, gridOf('Cyberpunk RED'), 'Torch')).toEqual([8, 16]);
    expect(reach(GENERIC_LIGHT_PRESETS, gridOf('Cyberpunk RED'), 'Candle')).toEqual([2, 4]);
    expect(reach(GENERIC_LIGHT_PRESETS, gridOf('Call of Cthulhu'), 'Torch')).toEqual([4, 8]);
    expect(reach(GENERIC_LIGHT_PRESETS, gridOf('Call of Cthulhu'), 'Lantern')).toEqual([6, 12]);
    expect(reach(GENERIC_LIGHT_PRESETS, FEET, 'Magical light')).toEqual([20, 40]);
  });

  it('takes a preset without a unit as the collection\'s own numbers, and names no unit on what it gives', () => {
    const own: LightPresetDefinition = { id: 'home-1', name: 'Glow moss', bright: 3, dim: 7, color: '#7ee0a8', animation: 'none', kind: 'magical' };
    expect(reach([own], { unitType: 'meters', unitDistance: 2 }, 'Glow moss')).toEqual([3, 7]);
    for (const light of lightPresetsOnMap([...dnd5e, own], FEET, Infinity)) expect(light).not.toHaveProperty('unit');
  });

  it('stops a preset at the farthest a light may reach on the map, bright never past dim', () => {
    expect(reach(dnd5e, FEET, 'Daylight', 100)).toEqual([60, 100]);
    expect(reach(dnd5e, FEET, 'Daylight', 45)).toEqual([45, 45]);
    const endless: LightPresetDefinition = { id: 'home-2', name: 'Sun', bright: 1e9, dim: 1e12, color: '#ffffff', animation: 'none', kind: 'magical' };
    expect(reach([endless], FEET, 'Sun', 585)).toEqual([585, 585]);
  });
});

describe('lightPresetOf', () => {
  const lamp = named(dnd5e, 'Lamp');
  const hooded = named(dnd5e, 'Hooded lantern');

  it('is the preset the light records, also once its values were edited', () => {
    expect(lightPresetOf(emissionOf(lamp), dnd5e)).toBe(lamp);
    expect(lightPresetOf({ ...emissionOf(lamp), bright: 25, color: '#ffffff' }, dnd5e)).toBe(lamp);
  });

  it('is the preset a light without a record equals, of its kind where it has one', () => {
    const { preset: _preset, kind: _kind, ...bare } = emissionOf(hooded);
    expect(lightPresetOf(bare, dnd5e)).toBe(hooded);
    expect(lightPresetOf({ ...bare, kind: 'lantern' }, dnd5e)).toBe(hooded);
  });

  it('reads a light from another game system, or from before presets, by its kind', () => {
    const old = { ...LIGHT_PRESETS.lantern.emission, bright: 12, kind: 'lantern' as const };
    expect(lightPresetOf(old, dnd5e)).toBe(hooded);
    expect(lightPresetOf({ ...emissionOf(lamp), bright: 25 }, GENERIC_LIGHT_PRESETS)).toBe(named(GENERIC_LIGHT_PRESETS, 'Lantern'));
    expect(lightPresetOf({ ...old, kind: 'candle' }, cairn)).toBeNull();
  });

  it('is none for a light made custom, also where the collection has a preset with the plain marker that equals it', () => {
    const lamppost: LightPresetDefinition = { id: 'home-post', name: 'Lamppost', bright: 10, dim: 30, color: '#fff1d6', animation: 'none', kind: 'custom' };
    expect(lightPresetOf(emissionOf(lamppost), [...dnd5e, lamppost])).toBe(lamppost);
    expect(lightPresetOf(asCustomLight(emissionOf(lamppost)), [...dnd5e, lamppost])).toBeNull();
  });

  it('is none for a custom light, whatever it equals, and for a light that matches nothing', () => {
    expect(lightPresetOf(asCustomLight(emissionOf(lamp)), dnd5e)).toBeNull();
    expect(lightPresetOf({ ...LIGHT_PRESETS.torch.emission, bright: 3 }, dnd5e)).toBeNull();
    expect(lightPresetOf({ ...LIGHT_PRESETS.torch.emission, bright: 3, kind: 'brazier' as LightKind }, dnd5e)).toBeNull();
  });
});

describe('asCustomLight', () => {
  it('keeps the light as it is, with the plain marker and no preset', () => {
    const custom = asCustomLight(emissionOf(named(dnd5e, 'Torch')));
    expect(custom).toMatchObject({ bright: 20, dim: 40, kind: 'custom' });
    expect(custom).not.toHaveProperty('preset');
    expect(lightKindOf(custom)).toBe('custom');
  });

  it('keeps a darkness a darkness: its marker says what it does, whatever kind it was given', () => {
    const custom = asCustomLight(emissionOf(named(dnd5e, 'Darkness')));
    expect(custom).toMatchObject({ darkness: true, kind: 'custom' });
    expect(lightKindOf(custom)).toBe('darkness');
    expect(lightPresetOf(custom, dnd5e)).toBeNull();
    expect(lightPresetOf(emissionOf(named(dnd5e, 'Darkness')), dnd5e)).toBe(named(dnd5e, 'Darkness'));
    // A light is never read as the darkness preset, nor a darkness as a light's.
    const { kind: _kind, preset: _preset, ...bare } = emissionOf(named(dnd5e, 'Torch'));
    expect(lightPresetOf({ ...bare, darkness: true }, dnd5e)?.name).toBe('Darkness');
  });
});

describe('the preset a tool places', () => {
  it('is the chosen one while the collection has it, else its torch, else its first light', () => {
    expect(chosenLightPreset(dnd5e, named(dnd5e, 'Daylight').id).name).toBe('Daylight');
    expect(chosenLightPreset(dnd5e, 'cairn-torch').name).toBe('Torch');
    expect(chosenLightPreset(dnd5e, null).name).toBe('Torch');
    expect(defaultLightPreset([named(dnd5e, 'Candle'), named(dnd5e, 'Lamp')]).name).toBe('Candle');
  });
});

describe('lightPresetChips', () => {
  it('shows every preset as a chip while five or fewer', () => {
    expect(lightPresetChips(GENERIC_LIGHT_PRESETS)).toEqual({ chips: GENERIC_LIGHT_PRESETS, more: [] });
    expect(lightPresetChips(cairn)).toEqual({ chips: cairn, more: [] });
  });

  it('shows the first preset of each kind as a chip, so no two chips share a glyph, and the others under More', () => {
    const { chips, more } = lightPresetChips(dnd5e);
    expect(names(chips)).toEqual(['Candle', 'Torch', 'Hooded lantern', 'Light', 'Darkness']);
    expect(names(more)).toEqual(['Lamp', 'Continual Flame', 'Daylight', 'Bullseye lantern']);
  });

  it('fills up to five chips when the presets have fewer kinds, and keeps the chips in list order', () => {
    const torches = ['a', 'b', 'c', 'd', 'e', 'f', 'g'].map((id): LightPresetDefinition => ({ ...named(dnd5e, 'Torch'), id, name: id }));
    const { chips, more } = lightPresetChips([...torches.slice(0, 6), { ...torches[6]!, kind: 'candle' }]);
    expect(names(chips)).toEqual(['a', 'b', 'c', 'd', 'g']);
    expect(names(more)).toEqual(['e', 'f']);
  });
});
