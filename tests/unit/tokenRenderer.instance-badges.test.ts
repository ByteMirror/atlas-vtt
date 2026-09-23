import { beforeEach, describe, expect, it, vi } from 'vitest';
import { Container } from 'pixi.js';
import { TokenRenderer } from '../../src/app/pixi/TokenRenderer';
import { updateInstanceBadge } from '../../src/app/pixi/token-renderer/InstanceBadge';
import type { TokenEntity } from '../../src/app/types';
import type { TokenGroupContainer } from '../../src/app/pixi/token-renderer/types';

vi.mock('../../src/app/pixi/token-renderer/InstanceBadge', () => ({
  updateInstanceBadge: vi.fn(),
}));

type BadgeHarness = {
  store: { getState: () => { objects: { tokens: Record<string, TokenEntity> }; tokenSettings: { showInstanceBadges: boolean } } };
  tokenSprites: Record<string, TokenGroupContainer | null>;
  drawInstanceBadge: (...args: unknown[]) => void;
};

type BadgeMethods = {
  refreshInstanceBadges: (this: BadgeHarness) => void;
  refreshInstanceBadge: (this: BadgeHarness, tokenId: string) => void;
  drawInstanceBadge: (this: BadgeHarness, ...args: unknown[]) => void;
};

const methods = TokenRenderer.prototype as unknown as BadgeMethods;

function tokenGroup(): TokenGroupContainer {
  return Object.assign(new Container(), { tokenId: '', tokenData: {} as TokenEntity, tokenSize: 70, strokeWidth: 4 });
}

function goblin(id: string, instanceNumber: number): TokenEntity {
  return { id, kind: 'token', imagePath: 'goblin.png', x: 0, y: 0, instanceNumber } as TokenEntity;
}

describe('TokenRenderer instance badges', () => {
  beforeEach(() => {
    vi.mocked(updateInstanceBadge).mockClear();
  });

  it('numbers spawned tokens once their sprites finish loading', () => {
    const existing = tokenGroup();
    const tokens = { a: goblin('a', 1), b: goblin('b', 2), c: goblin('c', 3) };
    const harness: BadgeHarness = {
      store: { getState: () => ({ objects: { tokens }, tokenSettings: { showInstanceBadges: true } }) },
      // b and c were just spawned: their sprites are still loading
      tokenSprites: { a: existing, b: null, c: null },
      drawInstanceBadge: (...args) => methods.drawInstanceBadge.apply(harness, args),
    };

    methods.refreshInstanceBadges.call(harness);
    expect(updateInstanceBadge).toHaveBeenCalledTimes(1);
    expect(updateInstanceBadge).toHaveBeenCalledWith(existing, 1, 70, true);

    const loaded = tokenGroup();
    harness.tokenSprites.b = loaded;
    methods.refreshInstanceBadge.call(harness, 'b');
    expect(updateInstanceBadge).toHaveBeenLastCalledWith(loaded, 2, 70, true);
  });

  it('keeps the badge hidden on a token whose image no other token shares', () => {
    const group = tokenGroup();
    const tokens = { a: goblin('a', 1), d: { ...goblin('d', 1), imagePath: 'dragon.png' } };
    const harness: BadgeHarness = {
      store: { getState: () => ({ objects: { tokens }, tokenSettings: { showInstanceBadges: true } }) },
      tokenSprites: { a: tokenGroup(), d: group },
      drawInstanceBadge: (...args) => methods.drawInstanceBadge.apply(harness, args),
    };

    methods.refreshInstanceBadge.call(harness, 'd');
    expect(updateInstanceBadge).toHaveBeenCalledWith(group, 1, 70, false);
  });
});
