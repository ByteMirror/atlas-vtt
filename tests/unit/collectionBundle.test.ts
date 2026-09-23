// @vitest-environment node
// JSZip needs Node's ArrayBuffer realm; jsdom's differs and its Blob support is absent.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { TFile } from 'obsidian';
import { AssetService } from '../../src/app/services/AssetService';
import { exportCollectionBundle } from '../../src/app/services/collectionBundle/collectionExport';
import { importCollectionBundle } from '../../src/app/services/collectionBundle/collectionImport';
import { createInMemoryApp, parseFrontmatter, type InMemoryApp } from '../mocks/inMemoryVault';

const MAP_PATH = 'atlas-vtt/collections/source/scenes/Cave.atlasmap';
const NOTE_PATH = 'Bestiary/Goblin.md';
const NOTE_IMAGE = 'Bestiary/goblin.png';
const TOKEN_IMAGE = 'atlas-vtt/assets/goblin_1.webp';
const TOKEN_THUMB = 'atlas-vtt/assets/thumbnails/goblin_1-abc.webp';
const BACKGROUND = 'atlas-vtt/assets/cave_bg.webp';

const mapFile = JSON.stringify({
  version: 4,
  state: {
    schema: 'atlas-vtt', version: 4, mapPath: MAP_PATH, background: BACKGROUND, grid: null, camera: { x: 0, y: 0, scale: 1 },
    objects: {
      tokens: { t1: { id: 't1', kind: 'character', x: 0, y: 0, imagePath: TOKEN_IMAGE, showRing: false, statblockPath: NOTE_PATH, name: 'Goblin', hp: 7 } },
      fog: {}, pins: {}, texts: {}, drawings: {}, walls: {}, lights: {},
    },
  },
});

/** Binary reads must produce buffers from this realm, and the metadata cache must see the seeded frontmatter. */
function stubFileReads(vault: InMemoryApp): void {
  (vault.app.vault as { readBinary: unknown }).readBinary = async (file: TFile): Promise<ArrayBuffer> =>
    new TextEncoder().encode(vault.files.get(file.path) ?? '').buffer as ArrayBuffer;
  vault.app.metadataCache.getFileCache = vi.fn((file: TFile) => {
    const frontmatter = parseFrontmatter(vault.files.get(file.path) ?? '');
    return frontmatter ? { frontmatter } : null;
  });
}

function service(vault: InMemoryApp): AssetService {
  AssetService.resetInstance();
  return AssetService.getInstance(vault.app);
}

async function seedSourceVault(): Promise<{ vault: InMemoryApp; assets: AssetService }> {
  const vault = createInMemoryApp();
  stubFileReads(vault);
  const assets = service(vault);
  await assets.initialize();
  await assets.createCollection('Source');
  for (const [path, content] of Object.entries({
    [TOKEN_IMAGE]: 'IMG', [TOKEN_THUMB]: 'THUMB', [BACKGROUND]: 'BG', [MAP_PATH]: mapFile,
    'atlas-vtt/collections/source/scenes/Cave.thumb.jpg': 'JPG',
    [NOTE_PATH]: '---\nstatblock: true\nimage: "[[goblin.png]]"\n---\nA goblin.',
    [NOTE_IMAGE]: 'PNG',
  })) {
    await vault.app.vault.create(path, content);
  }
  await assets.createTag('source', 'Dragon');
  await assets.updateCollectionSettings('source', { conditions: [{ id: 'c1', name: 'Poisoned', color: '#0f0' }] });
  await assets.addTokenAsset({ name: 'Goblin', imagePath: TOKEN_IMAGE, thumbnailPath: TOKEN_THUMB, statblockPath: NOTE_PATH, showRing: false, size: 1.5, collection: 'source', tags: ['dragon'] });
  await assets.addAsset({ type: 'scene', name: 'Cave', collection: 'source', tags: [], data: { mapPath: MAP_PATH } });
  await assets.addAsset({ type: 'encounter', name: 'Ambush', collection: 'source', tags: [], tokens: [{ id: 'g', name: 'Goblin', imagePath: TOKEN_IMAGE, statblockPath: NOTE_PATH }] });
  return { vault, assets };
}

async function exportSource(): Promise<{ blob: Blob; source: AssetService; sourceVault: InMemoryApp }> {
  const { vault, assets } = await seedSourceVault();
  return { blob: await exportCollectionBundle(vault.app, assets, 'source'), source: assets, sourceVault: vault };
}

beforeEach(() => {
  AssetService.resetInstance();
  // Exports are dated; a fake clock gives each export in a test its own time.
  vi.useFakeTimers({ toFake: ['Date'] });
  vi.setSystemTime(1_000);
});
afterEach(() => { vi.useRealTimers(); });

async function manifestOf(bundle: Blob): Promise<{ exportedAt: number; collection: { exportedAt?: number } }> {
  const { default: JSZip } = await import('jszip');
  const zip = await JSZip.loadAsync(await bundle.arrayBuffer());
  return JSON.parse(await zip.file('manifest.json')!.async('string')) as { exportedAt: number; collection: { exportedAt?: number } };
}

describe('collection bundle', () => {
  it('packs every file the collection depends on', async () => {
    const { blob } = await exportSource();
    const { default: JSZip } = await import('jszip');
    const zip = await JSZip.loadAsync(await blob.arrayBuffer());
    const entries = Object.keys(zip.files).filter((name) => !zip.files[name]?.dir);
    expect(entries).toEqual(expect.arrayContaining([
      'manifest.json',
      `files/${TOKEN_IMAGE}`, `files/${TOKEN_THUMB}`, `files/${BACKGROUND}`, `files/${MAP_PATH}`,
      'files/atlas-vtt/collections/source/scenes/Cave.thumb.jpg',
      `files/${NOTE_PATH}`, `files/${NOTE_IMAGE}`,
    ]));
    expect(entries.filter((name) => /collections\/source\/(scenes|encounters)\/.*\.json$/.test(name))).toHaveLength(2);
  });

  it('restores the collection into another vault with working scenes, statblock links and settings', async () => {
    const { blob } = await exportSource();
    const target = createInMemoryApp();
    stubFileReads(target);
    const assets = service(target);
    await assets.initialize();
    // A different collection already owns the id "source", so the import must pick another.
    await assets.createCollection('Source');

    const result = await importCollectionBundle(target.app, assets, blob);
    expect(result).toMatchObject({ outcome: 'created', collectionName: 'Source', assetCount: 3 });

    const collection = (await assets.getCollections()).find((c) => c.id === 'source-2');
    expect(collection).toMatchObject({ name: 'Source', exportedAt: 1_000, tags: { dragon: { id: 'dragon', name: 'Dragon' } } });
    expect(collection?.settings.conditions).toEqual([{ id: 'c1', name: 'Poisoned', color: '#0f0' }]);

    const statblocks = 'atlas-vtt/collections/source-2/statblocks';
    const [token] = await assets.getAssets('source-2', 'token');
    expect(token).toMatchObject({ showRing: false, size: 1.5, tags: ['dragon'], imagePath: TOKEN_IMAGE, thumbnailPath: TOKEN_THUMB, statblockPath: `${statblocks}/Goblin.md` });

    const newMapPath = 'atlas-vtt/collections/source-2/scenes/Cave.atlasmap';
    const [scene] = await assets.getAssets('source-2', 'scene');
    expect(scene?.data?.mapPath).toBe(newMapPath);
    expect(scene?.filePath).toMatch(/^atlas-vtt\/collections\/source-2\/scenes\/.*\.json$/);
    expect(JSON.parse(target.files.get(scene!.filePath!)!)).toEqual({ mapPath: newMapPath });
    expect(target.files.has('atlas-vtt/collections/source-2/scenes/Cave.thumb.jpg')).toBe(true);

    const map = JSON.parse(target.files.get(newMapPath)!) as { state: { mapPath: string; background: string; objects: { tokens: Record<string, { statblockPath: string; showRing: boolean }> } } };
    expect(map.state.mapPath).toBe(newMapPath);
    expect(map.state.background).toBe(BACKGROUND);
    expect(map.state.objects.tokens.t1).toMatchObject({ statblockPath: `${statblocks}/Goblin.md`, showRing: false });
    expect(target.files.get(BACKGROUND)).toBe('BG');

    const [encounter] = await assets.getAssets('source-2', 'encounter');
    expect(encounter?.tokens[0]?.statblockPath).toBe(`${statblocks}/Goblin.md`);

    expect(target.files.get(`${statblocks}/goblin.png`)).toBe('PNG');
    expect(parseFrontmatter(target.files.get(`${statblocks}/Goblin.md`)!)).toMatchObject({ statblock: 'true', image: `${statblocks}/goblin.png` });
  });

  it('gives a copy imported next to its source fresh asset ids and leaves the source alone', async () => {
    const { vault, assets } = await seedSourceVault();
    const sourceAssets = await assets.getAssets('source');
    const bundle = await exportCollectionBundle(vault.app, assets, 'source');
    const { default: JSZip } = await import('jszip');
    const zip = await JSZip.loadAsync(await bundle.arrayBuffer());
    const manifest = JSON.parse(await zip.file('manifest.json')!.async('string')) as { collection: { uid: string; name: string } };
    manifest.collection = { ...manifest.collection, uid: 'copy-uid', name: 'Source copy' };
    zip.file('manifest.json', JSON.stringify(manifest));
    const copy = new Blob([await zip.generateAsync({ type: 'arraybuffer' })]);

    const result = await importCollectionBundle(vault.app, assets, copy);
    expect(result).toMatchObject({ outcome: 'created', assetCount: 3 });
    expect(await assets.getAssets('source')).toEqual(sourceAssets);

    const copied = await assets.getAssets('source-copy');
    expect(copied).toHaveLength(3);
    const sourceIds = new Set(sourceAssets.map((asset) => asset.id));
    expect(copied.every((asset) => !sourceIds.has(asset.id))).toBe(true);
    const [token] = await assets.getAssets('source-copy', 'token');
    const [encounter] = await assets.getAssets('source-copy', 'encounter');
    expect(encounter?.tokens[0]?.id).toBe('g');
    expect(token?.statblockPath).toBe(NOTE_PATH);
    const [scene] = await assets.getAssets('source-copy', 'scene');
    expect(scene?.data?.mapPath).toBe('atlas-vtt/collections/source-copy/scenes/Cave.atlasmap');
  });

  it('keeps links to statblock notes the importing vault already has', async () => {
    const { blob } = await exportSource();
    const original = '---\nstatblock: true\nimage: "[[goblin.png]]"\n---\nLocal goblin.';
    const target = createInMemoryApp({ files: { [NOTE_PATH]: original, [NOTE_IMAGE]: 'LOCAL PNG' } });
    stubFileReads(target);
    const assets = service(target);
    await assets.initialize();

    await importCollectionBundle(target.app, assets, blob);
    const [token] = await assets.getAssets('source', 'token');
    expect(token?.statblockPath).toBe(NOTE_PATH);
    expect(target.files.get(NOTE_PATH)).toBe(original);
    expect(target.files.get(NOTE_IMAGE)).toBe('LOCAL PNG');
    expect(target.files.has('atlas-vtt/collections/source/statblocks/Goblin.md')).toBe(false);
  });

  it('never rewrites the frontmatter of a statblock note the vault already had', async () => {
    const { blob } = await exportSource();
    const original = '---\nstatblock: true\nimage: "[[goblin.png]]"\n---\nLocal goblin.';
    const target = createInMemoryApp({ files: { [NOTE_PATH]: original } });
    stubFileReads(target);
    const assets = service(target);
    await assets.initialize();

    await importCollectionBundle(target.app, assets, blob);
    expect(target.files.get(NOTE_PATH)).toBe(original);
    expect(target.files.get('atlas-vtt/collections/source/statblocks/goblin.png')).toBe('PNG');
  });

  it('closes Atlas views of a map it replaces so they cannot save stale state over it', async () => {
    const { blob, source, sourceVault } = await exportSource();
    const target = createInMemoryApp();
    stubFileReads(target);
    const assets = service(target);
    await assets.initialize();
    await importCollectionBundle(target.app, assets, blob);

    const mapPath = 'atlas-vtt/collections/source/scenes/Cave.atlasmap';
    const leaf = { view: { getState: () => ({ file: mapPath }) }, detach: vi.fn() };
    const other = { view: { getState: () => ({ file: 'elsewhere.atlasmap' }) }, detach: vi.fn() };
    target.app.workspace.getLeavesOfType = vi.fn(() => [leaf, other]);

    vi.setSystemTime(2_000);
    await importCollectionBundle(target.app, assets, await exportCollectionBundle(sourceVault.app, source, 'source'));
    expect(leaf.detach).toHaveBeenCalledTimes(1);
    expect(other.detach).not.toHaveBeenCalled();
  });

  it('only updates an existing copy when the bundle is a later export', async () => {
    const { blob, source, sourceVault } = await exportSource();
    const target = createInMemoryApp();
    stubFileReads(target);
    const assets = service(target);
    await assets.initialize();
    await importCollectionBundle(target.app, assets, blob);

    const again = await importCollectionBundle(target.app, assets, blob);
    expect(again).toMatchObject({ outcome: 'already-current', fileCount: 0 });

    vi.setSystemTime(2_000);
    await source.updateCollectionSettings('source', { conditions: [] });
    const newer = await exportCollectionBundle(sourceVault.app, source, 'source');

    const updated = await importCollectionBundle(target.app, assets, newer);
    expect(updated).toMatchObject({ outcome: 'updated', exportedAt: 2_000, localExportedAt: 1_000 });
    expect((await assets.getCollection('source'))?.settings.conditions).toEqual([]);

    const stale = await importCollectionBundle(target.app, assets, blob);
    expect(stale).toMatchObject({ outcome: 'newer-exists', localExportedAt: 2_000 });
  });

  it('dates every export and the collection it was made from', async () => {
    const { vault, assets } = await seedSourceVault();
    expect(await manifestOf(await exportCollectionBundle(vault.app, assets, 'source'))).toMatchObject({ exportedAt: 1_000, collection: { exportedAt: 1_000 } });
    vi.setSystemTime(2_000);
    await exportCollectionBundle(vault.app, assets, 'source');
    expect((await assets.getCollection('source'))?.exportedAt).toBe(2_000);
  });

  it('lets a vault that re-shares an imported collection send its changes back', async () => {
    const { blob, sourceVault } = await exportSource();
    const target = createInMemoryApp();
    stubFileReads(target);
    const assets = service(target);
    await assets.initialize();
    await importCollectionBundle(target.app, assets, blob);

    vi.setSystemTime(2_000);
    await assets.updateCollectionSettings('source', { conditions: [] });
    const reshared = await exportCollectionBundle(target.app, assets, 'source');
    AssetService.resetInstance();
    const original = AssetService.getInstance(sourceVault.app);
    expect(await importCollectionBundle(sourceVault.app, original, reshared)).toMatchObject({ outcome: 'updated' });
    expect((await original.getCollection('source'))?.settings.conditions).toEqual([]);
  });

  it('updates a copy imported before exports were dated', async () => {
    const { blob } = await exportSource();
    const target = createInMemoryApp();
    stubFileReads(target);
    const assets = service(target);
    await assets.initialize();
    await importCollectionBundle(target.app, assets, blob);
    delete (await assets.getCollection('source'))!.exportedAt;

    expect(await importCollectionBundle(target.app, assets, blob)).toMatchObject({ outcome: 'updated' });
    expect((await assets.getCollection('source'))?.exportedAt).toBe(1_000);
  });

  it('puts back what a copy of the same export lost and keeps its local edits', async () => {
    const { blob } = await exportSource();
    const target = createInMemoryApp();
    stubFileReads(target);
    const assets = service(target);
    await assets.initialize();
    await importCollectionBundle(target.app, assets, blob);

    const mapPath = 'atlas-vtt/collections/source/scenes/Cave.atlasmap';
    const thumbPath = 'atlas-vtt/collections/source/scenes/Cave.thumb.jpg';
    const [token] = await assets.getAssets('source', 'token');
    target.files.delete(mapPath);
    await assets.deleteAsset(token!.id);
    target.files.set(thumbPath, 'LOCAL JPG');
    await assets.updateCollectionSettings('source', { conditions: [] });
    await assets.renameCollection('source', 'Local name');

    const repaired = await importCollectionBundle(target.app, assets, blob);
    expect(repaired).toMatchObject({ outcome: 'repaired', assetCount: 1 });
    expect(target.files.has(mapPath)).toBe(true);
    expect(await assets.getAssets('source', 'token')).toHaveLength(1);
    expect(target.files.get(thumbPath)).toBe('LOCAL JPG');
    expect(await assets.getCollection('source')).toMatchObject({ name: 'Local name', settings: { conditions: [] } });

    expect(await importCollectionBundle(target.app, assets, blob)).toMatchObject({ outcome: 'already-current', fileCount: 0 });
  });
});
