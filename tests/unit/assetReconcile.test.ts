import { describe, expect, it } from 'vitest';
import { reconcileAssets } from '../../src/app/packages/components/asset-manager/utils/assetReconcile';
import type { AnyAsset } from '../../src/app/packages/components/asset-manager/types';

const token = (id: string, overrides: Partial<AnyAsset> = {}): AnyAsset => ({
  id, name: id, type: 'tokens', imageUrl: `app://${id}.png`, thumbnailUrl: `app://${id}.webp`, tags: ['undead'], folderId: null, modifiedAt: 1,
  ...overrides,
} as AnyAsset);

const encounter = (id: string, url: string): AnyAsset => ({
  id, name: id, type: 'encounters', modifiedAt: 1, tokens: [{ id: 'a', name: 'a', imagePath: 'a.png' }], tokenPreviews: [{ url, showRing: true }],
});

describe('reconcileAssets', () => {
  it('returns the previous list when a reload brings the same assets', () => {
    const previous = [token('goblin'), token('wolf'), encounter('ambush', 'app://a.webp')];
    const reloaded = [token('goblin'), token('wolf'), encounter('ambush', 'app://a.webp')];
    expect(reconcileAssets(previous, reloaded)).toBe(previous);
  });

  it('keeps the object of every asset that did not change', () => {
    const previous = [token('goblin'), token('wolf'), encounter('ambush', 'app://a.webp')];
    const reloaded = [token('goblin'), token('wolf', { name: 'Dire wolf' }), encounter('ambush', 'app://b.webp')];

    const next = reconcileAssets(previous, reloaded);

    expect(next[0]).toBe(previous[0]);
    expect(next[1]).toBe(reloaded[1]);
    expect(next[2]).toBe(reloaded[2]);
  });

  it('follows the new order and membership', () => {
    const previous = [token('goblin'), token('wolf')];
    const reloaded = [token('wolf'), token('bat'), token('goblin')];

    const next = reconcileAssets(previous, reloaded);

    expect(next.map((asset) => asset.id)).toEqual(['wolf', 'bat', 'goblin']);
    expect(next[0]).toBe(previous[1]);
    expect(next[2]).toBe(previous[0]);
    expect(reconcileAssets(previous, [token('goblin')])).not.toBe(previous);
  });

  it('sees a tag, a removed field and an added field as changes', () => {
    const previous = [token('goblin', { thumbnailPending: true })];
    expect(reconcileAssets(previous, [token('goblin', { thumbnailPending: true, tags: ['undead', 'boss'] })])).not.toBe(previous);
    expect(reconcileAssets(previous, [token('goblin')])).not.toBe(previous);
    expect(reconcileAssets([token('goblin')], previous)[0]).toBe(previous[0]);
  });
});
