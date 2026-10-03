import { describe, expect, it } from 'vitest';
import { Container } from 'pixi.js';
import { TokenRenderer } from '../../src/app/pixi/TokenRenderer';

const tokens = {
  old: { id: 'old', x: 0, y: 0, size: 1 },
  spawned: { id: 'spawned', x: 0, y: 0, size: 1 },
  aside: { id: 'aside', x: 500, y: 0, size: 1 },
};

/** Token groups in the order the store lists them; `drawn` is the order the token layer draws them in, bottom first. */
function hitTest(drawn: (keyof typeof tokens)[], x: number, y: number): string | null {
  const tokenContainer = new Container();
  const tokenSprites: Record<string, Container> = {};
  for (const token of Object.values(tokens)) {
    const group = new Container();
    group.position.set(token.x, token.y);
    tokenSprites[token.id] = group;
  }
  for (const id of drawn) tokenContainer.addChild(tokenSprites[id]);

  const harness = {
    store: { getState: () => ({ objects: { tokens } }) },
    gridSystem: { getOptions: () => ({ size: 70 }) },
    tokenSprites,
    tokenContainer,
  };
  return TokenRenderer.prototype.hitTestTokens.call(harness, x, y);
}

describe('hitTestTokens', () => {
  it('picks the token drawn on top of a pile', () => {
    expect(hitTest(['old', 'spawned', 'aside'], 0, 0)).toBe('spawned');
    expect(hitTest(['spawned', 'old', 'aside'], 0, 0)).toBe('old');
  });

  it('picks a token that lies alone and nothing on empty ground', () => {
    expect(hitTest(['old', 'spawned', 'aside'], 500, 0)).toBe('aside');
    expect(hitTest(['old', 'spawned', 'aside'], 250, 0)).toBeNull();
  });

  it('skips a hidden token on top', () => {
    const tokenContainer = new Container();
    const old = new Container();
    const hidden = new Container();
    hidden.visible = false;
    tokenContainer.addChild(old, hidden);
    const harness = {
      store: { getState: () => ({ objects: { tokens } }) },
      gridSystem: { getOptions: () => ({ size: 70 }) },
      tokenSprites: { old, spawned: hidden },
      tokenContainer,
    };
    expect(TokenRenderer.prototype.hitTestTokens.call(harness, 0, 0)).toBe('old');
  });
});
