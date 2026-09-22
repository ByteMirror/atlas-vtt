import { describe, expect, it } from 'vitest';
import { TOKEN_SIZE_OPTIONS, tokenDiameterInCells, tokenSizeFromCreatureSize } from '../../src/app/pixi/token-renderer/tokenSizing';

describe('token size options', () => {
  it('names the footprint each stored multiplier renders', () => {
    for (const option of TOKEN_SIZE_OPTIONS) {
      const cells = tokenDiameterInCells(option.size);
      expect(option.label).toContain(`${cells}×${cells}`);
    }
  });

  it('maps creature size words to stored multipliers and ignores unknown values', () => {
    expect(tokenSizeFromCreatureSize('Large')).toBe(1.5);
    expect(tokenSizeFromCreatureSize(' huge or larger ')).toBe(2);
    expect(tokenSizeFromCreatureSize('Tiny')).toBe(1);
    expect(tokenSizeFromCreatureSize('Colossal')).toBeUndefined();
    expect(tokenSizeFromCreatureSize(undefined)).toBeUndefined();
  });
});
