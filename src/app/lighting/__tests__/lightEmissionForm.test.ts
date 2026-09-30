import { describe, expect, it } from 'vitest';
import { editEmission, emissionOfPreset } from '../lightEmissionForm';
import { LIGHT_PRESETS, presetOf } from '../lightPresets';

const torch = LIGHT_PRESETS.torch.emission;

describe('editEmission', () => {
  it('raises dim to bright when bright grows past it', () => {
    expect(editEmission(torch, 'bright', '50')).toMatchObject({ bright: 50, dim: 50 });
  });

  it('lowers bright when dim shrinks below it', () => {
    expect(editEmission(torch, 'dim', '10')).toMatchObject({ bright: 10, dim: 10 });
  });

  it('keeps the previous value for input that is not a number', () => {
    expect(editEmission(torch, 'bright', 'abc')).toBe(torch);
    expect(editEmission(torch, 'dim', '')).toBe(torch);
  });

  it('clamps intensity and softness to their ranges', () => {
    expect(editEmission(torch, 'intensity', '7').intensity).toBe(2);
    expect(editEmission(torch, 'sourceRadius', '-3').sourceRadius).toBe(0);
    expect(editEmission(torch, 'bright', '-5').bright).toBe(0);
  });

  it('makes an edited preset no longer count as that preset', () => {
    expect(presetOf(editEmission(torch, 'intensity', '0.5'))).toBeNull();
  });
});

describe('emissionOfPreset', () => {
  it('replaces the whole emission with a copy of the preset', () => {
    const emission = emissionOfPreset('candle');
    expect(emission).toEqual(LIGHT_PRESETS.candle.emission);
    expect(emission).not.toBe(LIGHT_PRESETS.candle.emission);
    expect(presetOf(emission)).toBe('candle');
  });
});
