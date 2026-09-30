import { describe, expect, it } from 'vitest';
import { carriedLight, visionForm, visionFromForm, type VisionForm } from '../tokenLighting';
import { LIGHT_PRESETS } from '../lightPresets';

describe('visionFromForm', () => {
  it('reads the ranges typed in game units', () => {
    expect(visionFromForm(form({ range: '60', darkvision: '30', tremorsense: '10' }))).toEqual({ enabled: true, range: 60, darkvision: 30, tremorsense: 10 });
  });

  it('drops a cleared range, which means unlimited sight', () => {
    expect(visionFromForm(form())).toEqual({ enabled: true });
  });

  it('ignores ranges that are not positive numbers', () => {
    expect(visionFromForm(form({ enabled: false, range: '-5', darkvision: 'far', tremorsense: '0' }))).toEqual({ enabled: false });
  });

  it('keeps an angle below a full turn, never under one degree', () => {
    expect(visionFromForm(form({ angle: '90' }))).toEqual({ enabled: true, angle: 90 });
    expect(visionFromForm(form({ angle: '0.4' }))).toEqual({ enabled: true, angle: 1 });
  });

  it('drops an angle of a full turn or more, blank or not positive: the token sees all around', () => {
    for (const angle of ['', '360', '400', '0', '-90', 'wide']) expect(visionFromForm(form({ angle }))).toEqual({ enabled: true });
  });
});

describe('visionForm', () => {
  it('shows a token without vision as off with blank fields', () => {
    expect(visionForm(undefined)).toEqual({ enabled: false, range: '', darkvision: '', tremorsense: '', angle: '' });
  });

  it('round-trips through visionFromForm', () => {
    const vision = { enabled: true, range: 60, darkvision: 30, tremorsense: 10, angle: 120 };
    expect(visionFromForm(visionForm(vision))).toEqual(vision);
    expect(visionFromForm(visionForm({ enabled: false }))).toEqual({ enabled: false });
  });
});

function form(overrides: Partial<VisionForm> = {}): VisionForm {
  return { enabled: true, range: '', darkvision: '', tremorsense: '', angle: '', ...overrides };
}

describe('carriedLight', () => {
  it('copies the chosen preset', () => {
    expect(carriedLight('torch')).toEqual(LIGHT_PRESETS.torch.emission);
    expect(carriedLight('torch')).not.toBe(LIGHT_PRESETS.torch.emission);
  });

  it('removes the light for none', () => {
    expect(carriedLight(null)).toBeUndefined();
  });
});
