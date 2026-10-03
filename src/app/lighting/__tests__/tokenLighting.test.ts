import { describe, expect, it } from 'vitest';
import { BUILT_IN_SYSTEM_PRESETS } from '../../gameSystems/builtInPresets';
import { GENERIC_SENSES } from '../../gameSystems/senses/generic';
import { senseWithRole } from '../../gameSystems/senseRules';
import { emissionOf } from '../lightPresetChoice';
import {
  lightForm,
  lightFromForm,
  senseRows,
  sensesFromRows,
  visionDefaultsForm,
  visionDefaultsFromForm,
  visionForm,
  visionFromForm,
  type VisionForm,
} from '../tokenLighting';

const dnd5e = BUILT_IN_SYSTEM_PRESETS.find((preset) => preset.name === 'D&D 5e')!.rules.senses!;
const lights = BUILT_IN_SYSTEM_PRESETS.find((preset) => preset.name === 'D&D 5e')!.rules.lightPresets!;
const darkvision = senseWithRole(dnd5e, 'darkvision').id;
const tremorsense = senseWithRole(dnd5e, 'tremorsense').id;

function form(overrides: Partial<VisionForm> = {}): VisionForm {
  return { enabled: true, range: '', angle: '', senses: null, ...overrides };
}

describe('visionFromForm', () => {
  it('reads the sight range typed in game units', () => {
    expect(visionFromForm(form({ range: '60' }))).toEqual({ enabled: true, range: 60 });
  });

  it('drops a cleared range, which means unlimited sight', () => {
    expect(visionFromForm(form())).toEqual({ enabled: true });
  });

  it('ignores a range that is not a positive number', () => {
    for (const range of ['-5', 'far', '0']) expect(visionFromForm(form({ enabled: false, range }))).toEqual({ enabled: false });
  });

  it('keeps an angle below a full turn, never under one degree', () => {
    expect(visionFromForm(form({ angle: '90' }))).toEqual({ enabled: true, angle: 90 });
    expect(visionFromForm(form({ angle: '0.4' }))).toEqual({ enabled: true, angle: 1 });
  });

  it('drops an angle of a full turn or more, blank or not positive: the token sees all around', () => {
    for (const angle of ['', '360', '400', '0', '-90', 'wide']) expect(visionFromForm(form({ angle }))).toEqual({ enabled: true });
  });

  it('writes the senses of the list, each with its distance when one is typed', () => {
    const senses = [{ id: darkvision, range: '60' }, { id: tremorsense, range: '' }];
    expect(visionFromForm(form({ senses }))).toEqual({ enabled: true, senses: [{ id: darkvision, range: 60 }, { id: tremorsense }] });
  });

  it('writes an emptied list as no senses, so the token stops following its statblock', () => {
    expect(visionFromForm(form({ senses: [] }))).toEqual({ enabled: true, senses: [] });
  });

  it('writes no senses for a token that has none of its own, so it keeps following its statblock', () => {
    expect(visionFromForm(form({ senses: null }))).not.toHaveProperty('senses');
  });
});

describe('visionForm', () => {
  it('shows a token without vision as off, blank and without senses of its own', () => {
    expect(visionForm(undefined, dnd5e)).toEqual({ enabled: false, range: '', angle: '', senses: null });
    expect(visionForm({ enabled: true, range: 30 }, dnd5e).senses).toBeNull();
  });

  it('shows a token\'s senses as rows, an empty list too', () => {
    const vision = { enabled: true, senses: [{ id: darkvision, range: 60 }, { id: tremorsense }] };
    expect(visionForm(vision, dnd5e).senses).toEqual([{ id: darkvision, range: '60' }, { id: tremorsense, range: '' }]);
    expect(visionForm({ enabled: true, senses: [] }, dnd5e).senses).toEqual([]);
  });

  it('shows the old darkvision and tremorsense numbers as the collection\'s senses of those kinds', () => {
    const old = { enabled: true, range: 120, darkvision: 60, tremorsense: 10, angle: 90 };
    expect(visionForm(old, dnd5e)).toEqual({
      enabled: true, range: '120', angle: '90',
      senses: [{ id: darkvision, range: '60' }, { id: tremorsense, range: '10' }],
    });
    const generic = visionForm({ enabled: true, darkvision: 30 }, GENERIC_SENSES).senses;
    expect(generic).toEqual([{ id: senseWithRole(GENERIC_SENSES, 'darkvision').id, range: '30' }]);
  });

  it('saves a token with the old fields as senses, without the old fields', () => {
    const saved = visionFromForm(visionForm({ enabled: true, darkvision: 60, tremorsense: 10 }, dnd5e));
    expect(saved).toEqual({ enabled: true, senses: [{ id: darkvision, range: 60 }, { id: tremorsense, range: 10 }] });
  });

  it('round-trips a token with senses and one without', () => {
    const vision = { enabled: true, range: 60, angle: 120, senses: [{ id: darkvision, range: 60 }] };
    expect(visionFromForm(visionForm(vision, dnd5e))).toEqual(vision);
    expect(visionFromForm(visionForm({ enabled: false }, dnd5e))).toEqual({ enabled: false });
  });
});

describe('sense rows', () => {
  it('keep the first of two rows for one sense and drop a distance that is not above 0', () => {
    const rows = [{ id: darkvision, range: '0' }, { id: darkvision, range: '90' }, { id: tremorsense, range: 'x' }];
    expect(sensesFromRows(rows)).toEqual([{ id: darkvision }, { id: tremorsense }]);
  });

  it('show each sense with its distance as typed text', () => {
    expect(senseRows([{ id: darkvision, range: 60 }, { id: tremorsense }])).toEqual([{ id: darkvision, range: '60' }, { id: tremorsense, range: '' }]);
  });
});

describe('the carried light form', () => {
  const lamp = lights.find((preset) => preset.name === 'Lamp')!;

  it('shows a token without a light as off, with the collection\'s torch ready to switch on', () => {
    const form = lightForm(undefined, lights);
    expect(form.on).toBe(false);
    expect(form.emission).toEqual(emissionOf(lights.find((preset) => preset.name === 'Torch')!));
    expect(lightFromForm(form)).toBeUndefined();
    expect(lightFromForm({ ...form, on: true })).toEqual(form.emission);
  });

  it('round-trips the light a token carries, whatever was edited on it', () => {
    const light = { ...emissionOf(lamp), bright: 25, color: '#123456', intensity: 0.5, sourceRadius: 3, animation: 'pulse' as const };
    const form = lightForm(light, lights);
    expect(form).toEqual({ on: true, emission: light });
    expect(lightFromForm(form)).toEqual(light);
  });

  it('keeps the light\'s settings while it is switched off in the form, and saves none', () => {
    const form = { ...lightForm(emissionOf(lamp), lights), on: false };
    expect(form.emission).toEqual(emissionOf(lamp));
    expect(lightFromForm(form)).toBeUndefined();
  });
});

describe('visionDefaultsFromForm', () => {
  it('reads sight range, angle and senses, without the on switch', () => {
    const defaults = { range: '60', angle: '90', senses: [{ id: darkvision, range: '60' }] };
    expect(visionDefaultsFromForm(defaults)).toEqual({ range: 60, angle: 90, senses: [{ id: darkvision, range: 60 }] });
  });

  it('is empty when every field is blank or unusable and no sense is listed', () => {
    expect(visionDefaultsFromForm({ range: '', angle: '360', senses: [] })).toEqual({});
  });

  it('shows old default distances as senses and round-trips them as senses', () => {
    const shown = visionDefaultsForm({ range: 60, darkvision: 30, angle: 120 }, dnd5e);
    expect(shown).toEqual({ range: '60', angle: '120', senses: [{ id: darkvision, range: '30' }] });
    expect(visionDefaultsFromForm(shown)).toEqual({ range: 60, angle: 120, senses: [{ id: darkvision, range: 30 }] });
    expect(visionDefaultsForm(undefined, dnd5e)).toEqual({ range: '', angle: '', senses: [] });
  });
});
