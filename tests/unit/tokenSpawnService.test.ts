import { describe, expect, it, vi } from 'vitest';
import { spawnSelectedTokens, spawnTokenAsset, type SpawnContext } from '../../src/app/packages/components/asset-manager/utils/tokenSpawnService';
import type { TokenAsset } from '../../src/app/packages/components/asset-manager/types';
import type { AtlasView } from '../../src/app/atlas-view';
import type { AssetService } from '../../src/app/services/AssetService';
import { createInMemoryApp } from '../mocks/inMemoryVault';

const unframed: TokenAsset = { id: 'goblin', name: 'Goblin', type: 'tokens', imageUrl: 'app://goblin.png', imagePath: 'tokens/goblin.png', showRing: false, size: 2 };
const framed: TokenAsset = { id: 'knight', name: 'Knight', type: 'tokens', imageUrl: 'app://knight.png', imagePath: 'tokens/knight.png', showRing: true };

function setup(records: Record<string, Partial<TokenAsset>> = {}) {
  const { app } = createInMemoryApp({ files: {} });
  const viewport = { screenWidth: 800, screenHeight: 600, toWorld: (p: { x: number; y: number }) => p, scale: { x: 1 } };
  const view = { serviceManager: { getRendererService: () => ({ getViewport: () => viewport, getGridSystem: () => null }) } } as unknown as AtlasView;
  const spawned: Array<Record<string, unknown>> = [];
  const ctx: SpawnContext = {
    app,
    view,
    addTokens: vi.fn((tokens: unknown[]) => tokens.map((data) => { spawned.push(data as Record<string, unknown>); return `tok_${spawned.length}`; })) as unknown as SpawnContext['addTokens'],
    setSelection: vi.fn(),
    assetService: {
      getAssetById: vi.fn(async (id: string) => (id in records ? { id, type: 'token', name: id, imagePath: `tokens/${id}.png`, ...records[id] } : null)),
    } as unknown as AssetService,
  };
  return { ctx, spawned };
}

describe('token spawning keeps asset defaults', () => {
  it('spawns several selected assets with each one\'s ring setting and size', async () => {
    const { ctx, spawned } = setup();
    const ids = await spawnSelectedTokens(ctx, [unframed, framed]);
    expect(ids).toHaveLength(2);
    expect(spawned.map(t => [t.name, t.showRing, t.size])).toEqual([['Goblin', false, 2], ['Knight', true, undefined]]);
    expect(ctx.setSelection).toHaveBeenCalledWith(ids);
  });

  it('prefers the service record over the asset manager view model', async () => {
    const { ctx, spawned } = setup({ goblin: { showRing: true, size: 3, imagePath: 'tokens/goblin-v2.png' } });
    await spawnSelectedTokens(ctx, [unframed]);
    expect(spawned[0]).toMatchObject({ imagePath: 'tokens/goblin-v2.png', showRing: true, size: 3 });
  });

  it('spawns copies of a single asset without the ring when it is disabled', async () => {
    const { ctx, spawned } = setup({ goblin: { showRing: false } });
    await spawnTokenAsset(ctx, unframed, 2);
    expect(spawned.map(t => t.showRing)).toEqual([false, false]);
  });

  it('spawns several copies of one asset in a single batch, each on its own spot', async () => {
    const { ctx, spawned } = setup();
    const ids = await spawnTokenAsset(ctx, unframed, 4);
    expect(ids).toHaveLength(4);
    expect(ctx.addTokens).toHaveBeenCalledTimes(1);
    expect(new Set(spawned.map(t => `${t.x},${t.y}`)).size).toBe(4);
    expect(ctx.setSelection).toHaveBeenCalledWith(ids);
  });

  it('skips assets that have no image path', async () => {
    const { ctx, spawned } = setup();
    vi.spyOn(console, 'error').mockImplementation(() => undefined);
    const ids = await spawnSelectedTokens(ctx, [{ ...framed, imagePath: undefined, imageUrl: '' }, unframed]);
    expect(ids).toHaveLength(1);
    expect(spawned[0]?.name).toBe('Goblin');
  });
});
