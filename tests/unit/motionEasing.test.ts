import { describe, expect, it } from 'vitest';
import { cubicBezier, easeOut } from '../../src/app/utils/motion';

describe('cubicBezier', () => {
  it('matches the CSS timing functions it stands for', () => {
    const linear = cubicBezier(0, 0, 1, 1);
    for (const t of [0.1, 0.37, 0.5, 0.9]) expect(linear(t)).toBeCloseTo(t, 6);
    // CSS `ease` is cubic-bezier(0.25, 0.1, 0.25, 1); halfway through it has covered ~80.24%
    expect(cubicBezier(0.25, 0.1, 0.25, 1)(0.5)).toBeCloseTo(0.8024, 4);
  });

  it('starts at 0, ends at 1 and never runs backwards', () => {
    expect(easeOut(0)).toBe(0);
    expect(easeOut(1)).toBe(1);
    expect(easeOut(-0.5)).toBe(0);
    expect(easeOut(1.5)).toBe(1);
    let previous = 0;
    for (let i = 1; i <= 100; i++) {
      const value = easeOut(i / 100);
      expect(value).toBeGreaterThanOrEqual(previous);
      previous = value;
    }
  });

  it('front-loads the motion token\'s ease-out', () => {
    expect(easeOut(0.25)).toBeGreaterThan(0.75);
  });
});
