import { beforeEach, describe, expect, it, vi } from 'vitest';

import { AssetService, type TokenAsset } from '../../src/app/services/AssetService';
import { TOKEN_THUMBNAIL_DIR, TOKEN_THUMBNAIL_SIZE, TokenThumbnailService, type ThumbnailUpdate } from '../../src/app/services/TokenThumbnailService';
import { createInMemoryApp } from '../mocks/inMemoryVault';

const GOBLIN_IMAGE = 'atlas-vtt/assets/goblin.png';

async function setup(): Promise<{ app: any; files: Map<string, string>; assets: AssetService; goblin: TokenAsset; render: ReturnType<typeof vi.fn> }> {
  (AssetService as any).instance = null;
  const { app, files } = createInMemoryApp({ files: { [GOBLIN_IMAGE]: 'PNGDATA' } });
  const assets = AssetService.getInstance(app as any);
  await assets.initialize();
  const goblin = await assets.addTokenAsset({ name: 'Goblin', imagePath: GOBLIN_IMAGE, tags: [], collection: 'default' });
  const render = vi.fn(async (_source: Blob, size: number) => new TextEncoder().encode(`thumb:${size}`).buffer as ArrayBuffer);
  return { app, files, assets, goblin, render };
}

function nextUpdates(service: TokenThumbnailService): Promise<ThumbnailUpdate[]> {
  return new Promise((resolve) => {
    const unsubscribe = service.onUpdated((updates) => { unsubscribe(); resolve(updates); });
  });
}

describe('TokenThumbnailService', () => {
  beforeEach(() => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
  });

  it('renders, writes and records a thumbnail for a token that has none', async () => {
    const { app, files, assets, goblin, render } = await setup();
    const service = new TokenThumbnailService(app, assets, render);
    const updates = nextUpdates(service);

    service.ensureThumbnails([goblin]);

    const [update] = await updates;
    expect(update?.id).toBe(goblin.id);
    expect(update?.thumbnailPath.startsWith(`${TOKEN_THUMBNAIL_DIR}/goblin-`)).toBe(true);
    expect(files.get(update!.thumbnailPath)).toBe(`thumb:${TOKEN_THUMBNAIL_SIZE}`);
    const stored = await assets.getAssetById(goblin.id);
    expect(stored?.type === 'token' && stored.thumbnailPath).toBe(update?.thumbnailPath);
    expect(render).toHaveBeenCalledTimes(1);
  });

  it('skips tokens whose thumbnail already exists', async () => {
    const { app, assets, goblin, render } = await setup();
    const service = new TokenThumbnailService(app, assets, render);
    const updates = nextUpdates(service);
    service.ensureThumbnails([goblin]);
    await updates;

    const stored = await assets.getAssetById(goblin.id);
    service.ensureThumbnails([stored as TokenAsset]);
    await new Promise((resolve) => setTimeout(resolve, 20));

    expect(render).toHaveBeenCalledTimes(1);
  });

  it('records the tokens that succeeded when another image cannot be read', async () => {
    const { app, assets, goblin, render } = await setup();
    const missing = await assets.addTokenAsset({ name: 'Ghost', imagePath: 'atlas-vtt/assets/missing.png', tags: [], collection: 'default' });
    const service = new TokenThumbnailService(app, assets, render);
    const updates = nextUpdates(service);

    service.ensureThumbnails([missing, goblin]);

    expect((await updates).map((update) => update.id)).toEqual([goblin.id]);
    const stored = await assets.getAssetById(missing.id);
    expect(stored?.type === 'token' && stored.thumbnailPath).toBeUndefined();
  });

  it('returns undefined instead of throwing when a thumbnail cannot be created', async () => {
    const { app, assets, render } = await setup();
    const service = new TokenThumbnailService(app, assets, render);
    await expect(service.tryCreateForImage('atlas-vtt/assets/missing.png')).resolves.toBeUndefined();
  });

  it('gives same-named images in different folders different thumbnails', async () => {
    const { app, assets, render } = await setup();
    const service = new TokenThumbnailService(app, assets, render);
    const a = service.thumbnailPathFor('atlas-vtt/collections/default/tokens/orc.png');
    const b = service.thumbnailPathFor('atlas-vtt/collections/default/tokens/caves/orc.png');
    expect(a).not.toBe(b);
    expect(a.startsWith(`${TOKEN_THUMBNAIL_DIR}/orc-`)).toBe(true);
  });
});
