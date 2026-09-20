import { describe, expect, it } from 'vitest';
import { getTokenRingCenterRadius, getTokenRingOuterDiameter } from '../../src/app/pixi/token-renderer/tokenRingMetrics';

describe('tokenRingMetrics', () => {
  it('sizes a default 1x ring to hug exactly one 70px grid cell', () => {
    // Base 1x token sprite on 70px grid is 62px (70 - 2*4 stroke inset).
    const tokenSize = 62;
    const strokeWidth = 4;

    expect(getTokenRingOuterDiameter(tokenSize, strokeWidth, 1)).toBe(70);
    expect(getTokenRingCenterRadius(tokenSize, strokeWidth, 1)).toBe(33);
  });
});
