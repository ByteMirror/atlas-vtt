import { beforeEach, describe, expect, it } from 'vitest';

import { AssetService } from '../../src/app/services/AssetService';
import { createInMemoryApp } from '../mocks/inMemoryVault';

const METADATA_PATH = 'atlas-vtt/.atlas-data/assets-metadata.json';

function seededApp(): ReturnType<typeof createInMemoryApp> {
  return createInMemoryApp({
    folders: ['atlas-vtt/collections', 'atlas-vtt/collections/default'],
    files: {
      [METADATA_PATH]: JSON.stringify({
        collections: {
          default: { id: 'default', name: 'Default', tags: {}, createdAt: 1, modifiedAt: 1 },
        },
        assets: {
          'token-1': { id: 'token-1', type: 'token', name: 'Goblin', imagePath: 'atlas-vtt/assets/goblin.webp', tags: [], collection: 'default', createdAt: 1, modifiedAt: 1 },
        },
        version: 2,
      }),
      'atlas-vtt/assets/goblin.webp': 'WEBP',
    },
  });
}

describe('AssetService metadata loading', () => {
  beforeEach(() => {
    (AssetService as any).instance = null;
  });

  it('reads the index once and answers queries from memory', async () => {
    const { app } = seededApp();
    const service = AssetService.getInstance(app as any);

    await Promise.all([service.initialize(), service.initialize()]);
    await service.initialize();
    expect(app.vault.adapter.read).toHaveBeenCalledTimes(1);

    const tokens = await service.getAssets('default', 'token');
    await service.getAssets('default');
    await service.getCollectionTags('default');
    await service.getAllTags();

    expect(tokens.map((asset) => asset.id)).toEqual(['token-1']);
    expect(app.vault.adapter.read).toHaveBeenCalledTimes(1);
  });

  it('re-reads the index only on an explicit refresh', async () => {
    const { app } = seededApp();
    const service = AssetService.getInstance(app as any);
    await service.initialize();

    await service.refreshMetadata();

    expect(app.vault.adapter.read).toHaveBeenCalledTimes(2);
  });
});
