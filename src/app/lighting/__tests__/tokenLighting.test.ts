import { describe, expect, it } from 'vitest';
import { carriedLight, visionFromForm } from '../tokenLighting';
import { LIGHT_PRESETS } from '../lightPresets';

describe('visionFromForm', () => {
  it('reads the ranges typed in game units', () => {
    expect(visionFromForm({ enabled: true, range: '60', darkvision: '30' })).toEqual({ enabled: true, range: 60, darkvision: 30 });
  });

  it('drops a cleared range, which means unlimited sight', () => {
    expect(visionFromForm({ enabled: true, range: '', darkvision: '' })).toEqual({ enabled: true });
  });

  it('ignores ranges that are not positive numbers', () => {
    expect(visionFromForm({ enabled: false, range: '-5', darkvision: 'far' })).toEqual({ enabled: false });
  });
});

describe('carriedLight', () => {
  it('copies the chosen preset', () => {
    expect(carriedLight('torch')).toEqual(LIGHT_PRESETS.torch.emission);
    expect(carriedLight('torch')).not.toBe(LIGHT_PRESETS.torch.emission);
  });

  it('removes the light for none', () => {
    expect(carriedLight(null)).toBeUndefined();
  });
});
