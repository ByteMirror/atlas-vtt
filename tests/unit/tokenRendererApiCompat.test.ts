import { describe, expect, it } from 'vitest';
import { TokenRenderer } from '../../src/app/pixi/TokenRenderer';

describe('TokenRenderer API compatibility', () => {
  it('exposes both legacy and canonical all-tokens-loaded callback methods', () => {
    const proto = (TokenRenderer as any).prototype;
    expect(typeof proto.onWhenAllTokensLoaded).toBe('function');
    expect(typeof proto.setAllTokensLoadedCallback).toBe('function');
  });
});
