import { describe, expect, it, vi } from 'vitest';
import { Container, Graphics, Texture } from 'pixi.js';
import { SpriteFactory } from '../../src/app/pixi/token-renderer/SpriteFactory';

describe('SpriteFactory token ring fallback', () => {
  it('draws a fallback graphics ring when the textured ring is unavailable', () => {
    const gridSystem = {
      getOptions: () => ({ size: 70, type: 'square' }),
    } as any;

    const factory = new SpriteFactory(gridSystem, false);
    const container = new Container();
    (container as any).tokenSize = 70;

    vi.spyOn(factory as any, 'getTokenRingTexture').mockReturnValue(Texture.EMPTY);

    const ring = factory.createTokenRing(container, '#ffffff', 70);

    expect(ring).toBeInstanceOf(Graphics);
    expect(ring?.name).toBe('tokenRing');
    expect(container.getChildByLabel('tokenRing')).toBe(ring);
  });
});
