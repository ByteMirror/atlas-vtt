import { describe, expect, it } from 'vitest';
import { resourceColor, RESOURCE_COLORS } from '../../../src/app/resources/resourceColors';
import { BUILT_IN_SYSTEM_PRESETS } from '../../../src/app/gameSystems/builtInPresets';
import { HP_RESOURCE, STRESS_RESOURCE } from '../../../src/app/resources/resourceDefinitions';

describe('resourceColor', () => {
  it('turns a resource that defeats its token yellow below 70% and red below 30%, as the HP bar always did', () => {
    const at = (current: number): string => resourceColor(HP_RESOURCE, { current, max: 10 });
    expect([at(10), at(7)]).toEqual([HP_RESOURCE.color, HP_RESOURCE.color]);
    expect([at(6), at(3)]).toEqual(['#eab308', '#eab308']);
    expect([at(2), at(0)]).toEqual(['#ef4444', '#ef4444']);
  });

  it('keeps every other resource in its own colour', () => {
    expect(resourceColor(STRESS_RESOURCE, { current: 6, max: 6 })).toBe(STRESS_RESOURCE.color);
    expect(resourceColor({ ...HP_RESOURCE, defeatedWhenSpent: false }, { current: 1, max: 10 })).toBe(HP_RESOURCE.color);
  });

  it('counts what is left of a filling resource', () => {
    const wounds = { ...STRESS_RESOURCE, key: 'wounds', defeatedWhenSpent: true };
    expect(resourceColor(wounds, { current: 1, max: 10 })).toBe(wounds.color);
    expect(resourceColor(wounds, { current: 8, max: 10 })).toBe('#ef4444');
  });
});

describe('the colours a resource may have', () => {
  it('are twenty, each named and none twice', () => {
    expect(RESOURCE_COLORS).toHaveLength(20);
    expect(new Set(RESOURCE_COLORS.map(({ value }) => value)).size).toBe(20);
    expect(new Set(RESOURCE_COLORS.map(({ label }) => label)).size).toBe(20);
    expect(RESOURCE_COLORS.every(({ value }) => /^#[0-9a-f]{6}$/.test(value))).toBe(true);
  });

  it('hold every colour the built-in game systems use, so their resources show as chosen', () => {
    const used = BUILT_IN_SYSTEM_PRESETS.flatMap((preset) => preset.rules.resources ?? []).map(({ color }) => color.toLowerCase());
    const offered = new Set(RESOURCE_COLORS.map(({ value }) => value));
    expect(used.filter((color) => !offered.has(color))).toEqual([]);
  });

  it('leave out the yellow and red a resource takes as a warning when it runs low', () => {
    const low = resourceColor(HP_RESOURCE, { current: 5, max: 10 });
    const critical = resourceColor(HP_RESOURCE, { current: 1, max: 10 });
    expect(RESOURCE_COLORS.map(({ value }) => value)).not.toContain(low);
    expect(RESOURCE_COLORS.map(({ value }) => value)).not.toContain(critical);
  });
});

