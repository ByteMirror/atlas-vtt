import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { TFile } from 'obsidian';
import { AssetService } from '../../src/app/services/AssetService';
import { saveTokenPreviews } from '../../src/app/packages/components/asset-manager/token-creator/saveTokenPreviews';
import type { TokenPreview } from '../../src/app/packages/components/asset-manager/token-creator/types';
import { createInMemoryApp } from '../mocks/inMemoryVault';

const note = 'Bestiary/Goblin.md';
const image = 'Artwork/goblin.webp';
const blob = { arrayBuffer: async () => new Uint8Array([1, 2]).buffer } as Blob;
beforeEach(() => Reflect.set(AssetService, 'instance', null));
afterEach(() => Reflect.deleteProperty(window, 'FantasyStatblocks'));
function setup() {
  const { app, files } = createInMemoryApp({ files: { [note]: 'original note', [image]: 'original art' } });
  app.workspace = { trigger: vi.fn() };
  app.vault.cachedRead = app.vault.read;
  app.vault.createBinary = vi.fn(async (path: string) => { files.set(path, 'token copy'); return new TFile(path); });
  app.metadataCache.getFileCache = () => ({ frontmatter: { statblock: true, name: 'Goblin', image } });
  app.metadataCache.getFirstLinkpathDest = (path: string) => files.has(path) ? new TFile(path) : null;
  Object.assign(window, { FantasyStatblocks: { isResolved: () => true, getBestiaryCreatures: () => [] } });
  const assetService = AssetService.getInstance(app);
  const preview: TokenPreview = { id: 'goblin', name: 'Custom Goblin', statblockPath: note, tags: ['Enemy'], showRing: false, file: new File(['art'], 'goblin.webp'), previewUrl: 'blob:art', imageScale: 1, imagePosition: { x: 0, y: 0 }, isSelected: false, isOptimizing: false };
  const options = { app, assetService, mode: 'token' as const, previews: [preview], collection: 'default', tags: [], waitForOptimized: async () => blob, onSaved: vi.fn() };
  return { app, files, assetService, preview, options };
}

it('saves queued statblock identity, subset tags and ring choice with an owned image', async () => {
  const { files, assetService, options } = setup();
  expect(await saveTokenPreviews(options)).toBe(1);
  const [token] = await assetService.getTokenAssets();
  expect(token).toMatchObject({ name: 'Custom Goblin', statblockPath: note, tags: ['Enemy'], showRing: false });
  expect(token!.imagePath).not.toBe(image);
  expect(files.get(image)).toBe('original art');
  expect(files.get(note)).toBe('original note');
  expect(options.onSaved).toHaveBeenCalledWith('goblin');
  expect(await saveTokenPreviews(options)).toBe(0);
  expect(await assetService.getTokenAssets()).toHaveLength(1);
});

it('retains failed previews for retry and removes only successfully saved previews', async () => {
  const { app, assetService, options, preview } = setup();
  options.previews.push({ ...preview, id: 'wolf', statblockPath: undefined, name: 'Wolf', tags: [] });
  app.vault.createBinary.mockRejectedValueOnce(new Error('Disk full'));
  expect(await saveTokenPreviews(options)).toBe(1);
  expect(options.onSaved.mock.calls).toEqual([['wolf']]);
  expect((await assetService.getTokenAssets()).map(t => t.name)).toEqual(['Wolf']);
});
