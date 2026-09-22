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

it('never adds a ring to a token whose ring is disabled', () => {
  const factory = new SpriteFactory({ getOptions: () => ({ size: 70, type: 'square' }) } as never);
  const container = Object.assign(new Container(), { tokenSize: 70, tokenData: { showRing: false } });
  vi.spyOn(factory as never, 'getTokenRingTexture').mockReturnValue(Texture.EMPTY);
  expect(factory.createTokenRing(container as never, '#ffffff', 70)).toBeNull();
  expect(container.getChildByLabel('tokenRing')).toBeNull();
});
