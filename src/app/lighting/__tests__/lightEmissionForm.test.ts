import { describe, expect, it } from 'vitest';
import { editEmission } from '../lightEmissionForm';
import { LIGHT_PRESETS, presetOf } from '../lightPresets';

const torch = LIGHT_PRESETS.torch.emission;

describe('editEmission', () => {
  it('stops a typed range at the farthest a light may reach', () => {
    expect(editEmission(torch, 'bright', '1e9', 585)).toMatchObject({ bright: 585, dim: 585 });
    expect(editEmission(torch, 'dim', '586', 585).dim).toBe(585);
    expect(editEmission(torch, 'dim', 'Infinity', 585)).toBe(torch);
    expect(editEmission(torch, 'intensity', '1.5', 585).intensity).toBe(1.5);
  });

  it('reads a decimal comma where the locale writes one, and takes it for no number elsewhere', () => {
    expect(editEmission(torch, 'bright', '7,5', 585, 'de-DE').bright).toBe(7.5);
    expect(editEmission(torch, 'bright', '7.5', 585, 'de-DE').bright).toBe(7.5);
    expect(editEmission(torch, 'bright', '7,5', 585, 'en-US')).toBe(torch);
    expect(editEmission(torch, 'bright', '1,000', 585, 'en-US')).toBe(torch);
  });

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
