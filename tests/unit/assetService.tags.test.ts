import { beforeEach, expect, it } from 'vitest';
import { AssetService } from '../../src/app/services/AssetService';
import { createInMemoryApp } from '../mocks/inMemoryVault';

beforeEach(() => { (AssetService as any).instance = null; });

it('offers registered tags before they are assigned and retains tags from assets', async () => {
  const { app } = createInMemoryApp({ files: { 'goblin.webp': '' } });
  const service = AssetService.getInstance(app as any);
  await service.initialize();
  await service.createTag('default', 'Unused');
  await service.addTokenAsset({ name: 'Goblin', imagePath: 'goblin.webp', collection: 'default', tags: ['Forest'] });
  expect(await service.getAllTags()).toEqual(['Forest', 'Unused']);
});
