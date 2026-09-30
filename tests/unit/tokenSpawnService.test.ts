import { describe, expect, it, vi } from 'vitest';
import { spawnEncounterTokens, spawnSelectedTokens, spawnTokenAsset, type SpawnContext } from '../../src/app/packages/components/asset-manager/utils/tokenSpawnService';
import type { EncounterAsset, TokenAsset } from '../../src/app/packages/components/asset-manager/types';
import type { AtlasView } from '../../src/app/atlas-view';
import type { AssetService } from '../../src/app/services/AssetService';
import type { TokenVisionDefaults } from '../../src/app/types/lightingTypes';
import { createInMemoryApp } from '../mocks/inMemoryVault';

const unframed: TokenAsset = { id: 'goblin', name: 'Goblin', type: 'tokens', imageUrl: 'app://goblin.png', imagePath: 'tokens/goblin.png', showRing: false, size: 2, modifiedAt: 0 };
const framed: TokenAsset = { id: 'knight', name: 'Knight', type: 'tokens', imageUrl: 'app://knight.png', imagePath: 'tokens/knight.png', showRing: true, modifiedAt: 0 };

function setup(records: Record<string, Partial<TokenAsset>> = {}, defaultTokenVision?: TokenVisionDefaults, mapPath: string | null = 'maps/cave.atlasmap') {
  const { app } = createInMemoryApp({ files: { 'tokens/goblin.png': '', 'tokens/knight.png': '' } });
  const viewport = { screenWidth: 800, screenHeight: 600, toWorld: (p: { x: number; y: number }) => p, scale: { x: 1 } };
  const view = {
    serviceManager: { getRendererService: () => ({ getViewport: () => viewport, getGridSystem: () => null }) },
    getStore: () => ({ getState: () => ({ mapPath }) }),
  } as unknown as AtlasView;
  const spawned: Array<Record<string, unknown>> = [];
  const ctx: SpawnContext = {
    app,
    view,
    addTokens: vi.fn((tokens: unknown[]) => tokens.map((data) => { spawned.push(data as Record<string, unknown>); return `tok_${spawned.length}`; })) as unknown as SpawnContext['addTokens'],
    setSelection: vi.fn(),
    assetService: {
      getAssetById: vi.fn(async (id: string) => (id in records ? { id, type: 'token', name: id, imagePath: `tokens/${id}.png`, ...records[id] } : null)),
      getCollectionForMap: vi.fn((path: string) => (path === 'maps/cave.atlasmap' ? 'dungeon' : null)),
      getCollectionSettings: vi.fn(() => ({ conditions: [], ...(defaultTokenVision && { defaultTokenVision }) })),
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

  it('spawns a token without a statblock with no hit points, so it shows no resource bar', async () => {
    const { ctx, spawned } = setup();
    await spawnTokenAsset(ctx, unframed, 1);
    expect(spawned[0]).not.toHaveProperty('hp');
  });

  it('skips assets that have no image path', async () => {
    const { ctx, spawned } = setup();
    vi.spyOn(console, 'error').mockImplementation(() => undefined);
    const ids = await spawnSelectedTokens(ctx, [{ ...framed, imagePath: undefined, imageUrl: '' }, unframed]);
    expect(ids).toHaveLength(1);
    expect(spawned[0]?.name).toBe('Goblin');
  });
});

describe('encounter spawning', () => {
  const encounter = (tokens: EncounterAsset['tokens']): EncounterAsset => ({
    id: 'ambush', name: 'Ambush', type: 'encounters', tags: [], tokens, tokenPreviews: [], modifiedAt: 0,
  });

  it('frames tokens added from the asset manager like their token asset', async () => {
    const { ctx, spawned } = setup({ goblin: { showRing: false }, knight: { showRing: true } });
    await spawnEncounterTokens(ctx, encounter([
      { id: 'goblin', name: 'Goblin', imagePath: 'tokens/goblin.png', size: 1 },
      { id: 'knight', name: 'Knight', imagePath: 'tokens/knight.png', size: 1 },
    ]));
    expect(spawned.map(t => [t.name, t.showRing])).toEqual([['Goblin', false], ['Knight', true]]);
  });

  it('restores the ring saved with a token captured from a map', async () => {
    const { ctx, spawned } = setup({ goblin: { showRing: true } });
    await spawnEncounterTokens(ctx, encounter([
      { id: 'map-token', name: 'Goblin', imagePath: 'tokens/goblin.png', state: { kind: 'token', imagePath: 'tokens/goblin.png', showRing: false } },
    ]));
    expect(spawned[0]).toMatchObject({ imagePath: 'tokens/goblin.png', showRing: false });
  });
});

describe('default token vision of the placing map\'s collection', () => {
  const encounter = (tokens: EncounterAsset['tokens']): EncounterAsset => ({
    id: 'ambush', name: 'Ambush', type: 'encounters', tags: [], tokens, tokenPreviews: [], modifiedAt: 0,
  });
  const defaults: TokenVisionDefaults = { darkvision: 60, range: 120, angle: 90 };

  it('stamps every token spawned from the library with the default, vision off', async () => {
    const { ctx, spawned } = setup({}, defaults);
    await spawnTokenAsset(ctx, unframed, 2);
    await spawnSelectedTokens(ctx, [unframed, framed]);
    expect(spawned).toHaveLength(4);
    for (const token of spawned) expect(token.vision).toEqual({ enabled: false, darkvision: 60, range: 120, angle: 90 });
    expect(spawned[0]!.vision).not.toBe(spawned[1]!.vision);
  });

  it('stamps tokens an encounter builds from assets', async () => {
    const { ctx, spawned } = setup({ goblin: {} }, defaults);
    await spawnEncounterTokens(ctx, encounter([{ id: 'goblin', name: 'Goblin', imagePath: 'tokens/goblin.png', size: 1 }]));
    expect(spawned[0]!.vision).toEqual({ enabled: false, ...defaults });
  });

  it('ignores anything but the defaults in the stored settings, so vision stays off', async () => {
    const { ctx, spawned } = setup({}, { enabled: true, darkvision: 60, unknown: 1 } as TokenVisionDefaults);
    await spawnTokenAsset(ctx, unframed, 1);
    expect(spawned[0]!.vision).toEqual({ enabled: false, darkvision: 60 });
  });

  it('keeps the vision of a token restored from a saved snapshot, or none', async () => {
    const { ctx, spawned } = setup({}, defaults);
    await spawnEncounterTokens(ctx, encounter([
      { id: 'a', name: 'A', imagePath: 'tokens/goblin.png', state: { kind: 'token', imagePath: 'tokens/goblin.png', vision: { enabled: true, range: 15 } } },
      { id: 'b', name: 'B', imagePath: 'tokens/knight.png', state: { kind: 'token', imagePath: 'tokens/knight.png' } },
    ]));
    expect(spawned[0]!.vision).toEqual({ enabled: true, range: 15 });
    expect(spawned[1]).not.toHaveProperty('vision');
  });

  it('adds no vision field when the collection sets no default, sets an empty one or the map has no collection', async () => {
    for (const [vision, mapPath] of [[undefined, 'maps/cave.atlasmap'], [{}, 'maps/cave.atlasmap'], [defaults, 'maps/other.atlasmap'], [defaults, null]] as const) {
      const { ctx, spawned } = setup({}, vision, mapPath);
      await spawnTokenAsset(ctx, unframed, 1);
      expect(spawned[0]).not.toHaveProperty('vision');
    }
  });
});
