// @vitest-environment node
// JSZip needs Node's ArrayBuffer realm; jsdom's differs and its Blob support is absent.
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { TFile } from 'obsidian';
import { AtlasView } from '../../src/app/atlas-view';
import { AssetService } from '../../src/app/services/AssetService';
import { exportCollectionBundle, prepareCollectionExport, type ExportChoice } from '../../src/app/services/collectionBundle/collectionExport';
import { openCollectionImport, type ImportDecision } from '../../src/app/services/collectionBundle/collectionImport';
import type { ImportReview } from '../../src/app/services/collectionBundle/importReview';
import { readInstallRecord } from '../../src/app/services/collectionBundle/installRecord';
import { createInMemoryApp, parseFrontmatter, type InMemoryApp } from '../mocks/inMemoryVault';

vi.mock('../../src/app/atlas-view', () => ({
  ATLAS_VIEW_TYPE: 'atlas-vtt',
  AtlasView: class { async saveMap(): Promise<void> {} },
}));

const MAP_PATH = 'atlas-vtt/collections/source/scenes/Cave.atlasmap';
const NOTE_PATH = 'Bestiary/Goblin.md';
const NOTE_IMAGE = 'Bestiary/goblin.png';
const TOKEN_IMAGE = 'atlas-vtt/assets/goblin_1.webp';
const TOKEN_THUMB = 'atlas-vtt/assets/thumbnails/goblin_1-abc.webp';
const BACKGROUND = 'atlas-vtt/assets/cave_bg.webp';

const mapFile = (hp = 7): string => JSON.stringify({
  version: 4,
  state: {
    schema: 'atlas-vtt', version: 4, mapPath: MAP_PATH, background: BACKGROUND, grid: null, camera: { x: 0, y: 0, scale: 1 },
    objects: {
      tokens: { t1: { id: 't1', kind: 'character', x: 0, y: 0, imagePath: TOKEN_IMAGE, showRing: false, statblockPath: NOTE_PATH, name: 'Goblin', hp } },
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

interface Vault { vault: InMemoryApp; assets: AssetService }

async function emptyVault(files: Record<string, string> = {}): Promise<Vault> {
  const vault = createInMemoryApp({ files });
  stubFileReads(vault);
  const assets = service(vault);
  await assets.initialize();
  return { vault, assets };
}

/** The creator's vault with a collection of a token, a scene and an encounter. */
async function creatorVault(): Promise<Vault> {
  const creator = await emptyVault();
  const { vault, assets } = creator;
  await assets.createCollection('Source');
  for (const [path, content] of Object.entries({
    [TOKEN_IMAGE]: 'IMG', [TOKEN_THUMB]: 'THUMB', [BACKGROUND]: 'BG', [MAP_PATH]: mapFile(),
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
  return creator;
}

async function exportFrom({ vault, assets }: Vault, choice?: ExportChoice, collectionId = 'source'): Promise<Blob> {
  AssetService.resetInstance();
  const preview = await prepareCollectionExport(vault.app, assets, collectionId);
  const bundle = await exportCollectionBundle(vault.app, assets, preview, choice ?? { kind: 'release', version: preview.suggestedVersion });
  return bundle.blob;
}

async function reviewImport({ vault, assets }: Vault, blob: Blob): Promise<{ review: ImportReview; apply: (decision?: ImportDecision) => ReturnType<Awaited<ReturnType<typeof openCollectionImport>>['apply']> }> {
  const session = await openCollectionImport(vault.app, assets, blob);
  return { review: session.review, apply: (decision = {}) => session.apply(decision) };
}

async function importInto(target: Vault, blob: Blob, decision: ImportDecision = {}): Promise<ImportReview> {
  const { review, apply } = await reviewImport(target, blob);
  await apply(decision);
  return review;
}

const theirs = (unit: string): ImportDecision => ({ resolutions: new Map([[unit, 'theirs']]) });

beforeEach(() => { AssetService.resetInstance(); });

describe('exporting', () => {
  it('packs every file with its checksum and owners, and reports missing references', async () => {
    const creator = await creatorVault();
    creator.vault.files.delete(BACKGROUND);
    const preview = await prepareCollectionExport(creator.vault.app, creator.assets, 'source');
    expect(preview).toMatchObject({ isPublisher: true, minimumVersion: 1, suggestedVersion: 1 });
    expect(preview.missing).toEqual([expect.objectContaining({ path: BACKGROUND, assetName: 'Cave' })]);

    const bundle = await exportCollectionBundle(creator.vault.app, creator.assets, preview, { kind: 'release', version: 1, author: 'Dungeon Tube', notes: 'First release' });
    expect(bundle.fileName).toBe('Source v1.atlas-collection.zip');
    const { default: JSZip } = await import('jszip');
    const zip = await JSZip.loadAsync(await bundle.blob.arrayBuffer());
    const manifest = JSON.parse(await zip.file('manifest.json')!.async('string')) as {
      format: number; release: unknown; collection: Record<string, unknown>; files: Array<{ vaultPath: string; sha256: string; owners: string[] }>;
    };
    expect(manifest).toMatchObject({ format: 3, release: { kind: 'release', notes: 'First release' }, collection: { version: 1, author: 'Dungeon Tube' } });
    const image = manifest.files.find((file) => file.vaultPath === TOKEN_IMAGE)!;
    expect(image.sha256).toMatch(/^[0-9a-f]{64}$/);
    expect(image.owners).toHaveLength(3);
    expect(Object.keys(zip.files)).toEqual(expect.arrayContaining([`files/${MAP_PATH}`, `files/${NOTE_PATH}`, `files/${NOTE_IMAGE}`]));
    expect(await creator.assets.getCollection('source')).toMatchObject({ version: 1, author: 'Dungeon Tube', releasedAt: expect.any(Number) });
  });

  it('suggests the next version after a release and refuses releases by anyone but the publisher', async () => {
    const creator = await creatorVault();
    await exportFrom(creator);
    expect((await prepareCollectionExport(creator.vault.app, creator.assets, 'source')).suggestedVersion).toBe(2);

    const fan = await emptyVault();
    await importInto(fan, await exportFrom(creator, { kind: 'release', version: 2 }));
    const preview = await prepareCollectionExport(fan.vault.app, fan.assets, 'source');
    expect(preview.isPublisher).toBe(false);
    await expect(exportCollectionBundle(fan.vault.app, fan.assets, preview, { kind: 'release', version: 3 })).rejects.toThrow(/publisher/);
  });
});

describe('installing', () => {
  it('installs a collection with working scenes, statblock links and settings, and records the install', async () => {
    const fan = await emptyVault();
    const review = await importInto(fan, await exportFrom(await creatorVault()));
    expect(review).toMatchObject({ relation: 'new', version: 1, assetCount: 3, conflicts: [] });

    const collection = await fan.assets.getCollection('source');
    expect(collection).toMatchObject({ name: 'Source', version: 1, tags: { dragon: { id: 'dragon', name: 'Dragon' } } });
    expect(collection?.settings.conditions).toEqual([{ id: 'c1', name: 'Poisoned', color: '#0f0' }]);
    const statblocks = 'atlas-vtt/collections/source/statblocks';
    const [token] = await fan.assets.getAssets('source', 'token');
    expect(token).toMatchObject({ imagePath: TOKEN_IMAGE, statblockPath: `${statblocks}/Goblin.md`, showRing: false, size: 1.5 });
    expect(JSON.parse(fan.vault.files.get(MAP_PATH)!).state.objects.tokens.t1.statblockPath).toBe(`${statblocks}/Goblin.md`);
    expect(parseFrontmatter(fan.vault.files.get(`${statblocks}/Goblin.md`)!)).toMatchObject({ image: `${statblocks}/goblin.png` });
    expect(await readInstallRecord(fan.vault.app, collection!.uid)).toMatchObject({ version: 1, collectionId: 'source' });
  });

  it('imports a different collection with a name the vault already uses under a name of the user\'s choice', async () => {
    const fan = await emptyVault();
    await fan.assets.createCollection('Source');
    const { review, apply } = await reviewImport(fan, await exportFrom(await creatorVault()));
    expect(review).toMatchObject({ relation: 'new', suggestedName: 'Source (2)' });
    await expect(apply({ name: 'source' })).rejects.toThrow(/already exists/);
    await apply({ name: 'Source (2)' });
    const names = (await fan.assets.getCollections()).map((collection) => collection.name);
    expect(names).toEqual(expect.arrayContaining(['Source', 'Source (2)']));
    expect(await fan.assets.getAssets('source')).toHaveLength(0);
  });

  it('gives a copy imported next to its source fresh asset ids and leaves the source alone', async () => {
    const creator = await creatorVault();
    const sourceAssets = await creator.assets.getAssets('source');
    const { default: JSZip } = await import('jszip');
    const zip = await JSZip.loadAsync(await (await exportFrom(creator)).arrayBuffer());
    const manifest = JSON.parse(await zip.file('manifest.json')!.async('string')) as { collection: { uid: string; name: string } };
    manifest.collection = { ...manifest.collection, uid: crypto.randomUUID(), name: 'Source copy' };
    zip.file('manifest.json', JSON.stringify(manifest));
    await importInto(creator, new Blob([await zip.generateAsync({ type: 'arraybuffer' })]));

    expect(await creator.assets.getAssets('source')).toEqual(sourceAssets);
    const copied = await creator.assets.getAssets('source-copy');
    expect(copied).toHaveLength(3);
    expect(copied.every((asset) => !sourceAssets.some((original) => original.id === asset.id))).toBe(true);
    const [scene] = await creator.assets.getAssets('source-copy', 'scene');
    expect(scene?.data?.mapPath).toBe('atlas-vtt/collections/source-copy/scenes/Cave.atlasmap');
  });

  it('keeps statblock notes the vault already has and never rewrites them', async () => {
    const original = '---\nstatblock: true\nimage: "[[goblin.png]]"\n---\nLocal goblin.';
    const fan = await emptyVault({ [NOTE_PATH]: original, [NOTE_IMAGE]: 'LOCAL PNG' });
    await importInto(fan, await exportFrom(await creatorVault()));
    const [token] = await fan.assets.getAssets('source', 'token');
    expect(token?.statblockPath).toBe(NOTE_PATH);
    expect(fan.vault.files.get(NOTE_PATH)).toBe(original);
    expect(fan.vault.files.get(NOTE_IMAGE)).toBe('LOCAL PNG');
  });

  it('still installs bundles exported before format 3', async () => {
    const { default: JSZip } = await import('jszip');
    const zip = await JSZip.loadAsync(await (await exportFrom(await creatorVault())).arrayBuffer());
    const manifest = JSON.parse(await zip.file('manifest.json')!.async('string')) as Record<string, unknown> & { files: Array<Record<string, unknown>> };
    const legacy = {
      ...manifest, format: 2, release: undefined,
      files: manifest.files.map(({ sha256: _hash, owners: _owners, ...file }) => file),
    };
    zip.file('manifest.json', JSON.stringify(legacy));
    const fan = await emptyVault();
    const review = await importInto(fan, new Blob([await zip.generateAsync({ type: 'arraybuffer' })]));
    expect(review).toMatchObject({ relation: 'new', kind: 'release' });
    expect(await fan.assets.getAssets('source')).toHaveLength(3);
  });

  it('rejects a damaged bundle before writing anything', async () => {
    const { default: JSZip } = await import('jszip');
    const zip = await JSZip.loadAsync(await (await exportFrom(await creatorVault())).arrayBuffer());
    zip.file(`files/${TOKEN_IMAGE}`, 'TAMPERED');
    const fan = await emptyVault();
    await expect(openCollectionImport(fan.vault.app, fan.assets, new Blob([await zip.generateAsync({ type: 'arraybuffer' })])))
      .rejects.toThrow(/damaged: 1 file do not match their checksum \(goblin_1\.webp\)/);
    expect(fan.vault.files.has(TOKEN_IMAGE)).toBe(false);
  });

  it('rolls back every file it wrote when the import fails', async () => {
    const fan = await emptyVault();
    const before = new Map(fan.vault.files);
    let writes = 0;
    const createBinary = fan.vault.app.vault.createBinary.bind(fan.vault.app.vault);
    fan.vault.app.vault.createBinary = vi.fn(async (path: string, data: ArrayBuffer) => {
      if (++writes === 4) throw new Error('Disk full');
      return createBinary(path, data);
    });
    const { apply } = await reviewImport(fan, await exportFrom(await creatorVault()));
    await expect(apply()).rejects.toThrow('The import failed: Disk full. Nothing was changed.');
    expect(new Map(fan.vault.files)).toEqual(before);
    expect(await fan.assets.getCollection('source')).toBeNull();
  });
});

describe('updating', () => {
  async function installedV1(): Promise<{ creator: Vault; fan: Vault }> {
    const creator = await creatorVault();
    const fan = await emptyVault();
    await importInto(fan, await exportFrom(creator));
    AssetService.resetInstance();
    return { creator, fan };
  }

  it('reports the same version as up to date, and restores what the user changed only when asked', async () => {
    const { creator, fan } = await installedV1();
    const v1 = await exportFrom(creator, { kind: 'release', version: 1 });
    expect((await reviewImport(fan, v1)).review).toMatchObject({ relation: 'same', hasChanges: false, canRestore: false, conflicts: [] });

    fan.vault.files.set(MAP_PATH, 'PLAYED');
    const { review, apply } = await reviewImport(fan, v1);
    expect(review).toMatchObject({ relation: 'same', hasChanges: false, canRestore: true, counts: { kept: 1 } });
    const result = await apply({ restore: true });
    expect(result).toMatchObject({ written: 1, backupCount: 1 });
    expect(JSON.parse(fan.vault.files.get(MAP_PATH)!).state.objects.tokens.t1.hp).toBe(7);
    expect(fan.vault.files.get(`${result.backupFolder}/${MAP_PATH}`)).toBe('PLAYED');
  });

  it('applies a newer release: new, changed and removed assets, with backups of what it replaced', async () => {
    const { creator, fan } = await installedV1();
    const [encounter] = await creator.assets.getAssets('source', 'encounter');
    const [token] = await creator.assets.getAssets('source', 'token');
    creator.vault.files.set(MAP_PATH, mapFile(12));
    await creator.assets.updateAsset(token!.id, { name: 'Goblin Boss' });
    await creator.assets.deleteAsset(encounter!.id);
    await creator.vault.app.vault.create('atlas-vtt/assets/orc.webp', 'ORC');
    await creator.assets.addTokenAsset({ name: 'Orc', imagePath: 'atlas-vtt/assets/orc.webp', collection: 'source', tags: [] });

    const { review, apply } = await reviewImport(fan, await exportFrom(creator, { kind: 'release', version: 2, notes: 'Orcs!' }));
    expect(review).toMatchObject({ relation: 'newer', installedVersion: 1, version: 2, releaseNotes: 'Orcs!', conflicts: [] });
    expect(review.counts).toMatchObject({ added: 1, updated: 2, removed: 1 });
    const result = await apply();

    expect(result).toMatchObject({ created: false, version: 2 });
    expect((await fan.assets.getAssets('source', 'token')).map((asset) => asset.name).sort()).toEqual(['Goblin Boss', 'Orc']);
    expect(await fan.assets.getAssets('source', 'encounter')).toHaveLength(0);
    expect(JSON.parse(fan.vault.files.get(MAP_PATH)!).state.objects.tokens.t1.hp).toBe(12);
    expect(fan.vault.files.get(`${result.backupFolder}/${MAP_PATH}`)).toContain('"hp":7');
    expect((await fan.assets.getCollection('source'))?.version).toBe(2);
  });

  it('keeps the user\'s changes the update does not touch, and their rename of the collection', async () => {
    const { creator, fan } = await installedV1();
    const [token] = await fan.assets.getAssets('source', 'token');
    await fan.assets.updateAsset(token!.id, { name: 'My goblin' });
    await fan.assets.renameCollection('source', 'My campaign pack');
    creator.vault.files.set(MAP_PATH, mapFile(12));

    const { review, apply } = await reviewImport(fan, await exportFrom(creator));
    expect(review).toMatchObject({ relation: 'newer', localName: 'My campaign pack', conflicts: [] });
    await apply();
    expect((await fan.assets.getAssets('source', 'token'))[0]?.name).toBe('My goblin');
    expect((await fan.assets.getCollection('source'))?.name).toBe('My campaign pack');
    expect(JSON.parse(fan.vault.files.get(MAP_PATH)!).state.objects.tokens.t1.hp).toBe(12);
  });

  it('asks about changes both sides made, keeps the user\'s by default, and keeps asking on later updates', async () => {
    const { creator, fan } = await installedV1();
    const [scene] = await fan.assets.getAssets('source', 'scene');
    fan.vault.files.set(MAP_PATH, 'PLAYED');
    creator.vault.files.set(MAP_PATH, mapFile(12));

    const { review, apply } = await reviewImport(fan, await exportFrom(creator));
    expect(review.conflicts).toEqual([expect.objectContaining({ kind: 'Scene', name: 'Cave', reason: 'both-changed' })]);
    await apply();
    expect(fan.vault.files.get(MAP_PATH)).toBe('PLAYED');

    // A later release that leaves the scene alone must still not overwrite the user's version silently.
    const v3 = await reviewImport(fan, await exportFrom(creator));
    expect(v3.review.conflicts).toEqual([expect.objectContaining({ name: 'Cave', reason: 'both-changed' })]);
    await v3.apply(theirs(review.conflicts[0]!.key));
    expect(JSON.parse(fan.vault.files.get(MAP_PATH)!).state.objects.tokens.t1.hp).toBe(12);
    expect(scene).toBeDefined();
  });

  it('asks before removing an asset the user changed', async () => {
    const { creator, fan } = await installedV1();
    const [fanEncounter] = await fan.assets.getAssets('source', 'encounter');
    await fan.assets.updateAsset(fanEncounter!.id, { name: 'My ambush' });
    const [encounter] = await creator.assets.getAssets('source', 'encounter');
    await creator.assets.deleteAsset(encounter!.id);

    const { review, apply } = await reviewImport(fan, await exportFrom(creator));
    expect(review.conflicts).toEqual([expect.objectContaining({ kind: 'Encounter', name: 'My ambush', reason: 'removed-by-update' })]);
    await apply();
    expect(await fan.assets.getAssets('source', 'encounter')).toHaveLength(1);
  });

  it('offers an older version as a downgrade that only reverts what the user did not change', async () => {
    const creator = await creatorVault();
    const fan = await emptyVault();
    const v1 = await exportFrom(creator);
    creator.vault.files.set(MAP_PATH, mapFile(12));
    await importInto(fan, await exportFrom(creator));
    AssetService.resetInstance();

    const { review, apply } = await reviewImport(fan, v1);
    expect(review).toMatchObject({ relation: 'older', installedVersion: 2, version: 1 });
    await apply();
    expect(JSON.parse(fan.vault.files.get(MAP_PATH)!).state.objects.tokens.t1.hp).toBe(7);
    expect((await fan.assets.getCollection('source'))?.version).toBe(1);
  });

  it('treats a copy from before install records as unknown: restores what is missing and asks about the rest', async () => {
    const { creator, fan } = await installedV1();
    const collection = await fan.assets.getCollection('source');
    await fan.vault.app.vault.adapter.remove(`atlas-vtt/.atlas-data/installs/${collection!.uid}.json`);
    fan.vault.files.delete(TOKEN_IMAGE);
    fan.vault.files.set(MAP_PATH, 'PLAYED');

    const { review, apply } = await reviewImport(fan, await exportFrom(creator));
    expect(review).toMatchObject({ relation: 'newer', hasInstallRecord: false });
    expect(review.conflicts).toEqual([expect.objectContaining({ name: 'Cave', reason: 'unknown-origin' })]);
    await apply();
    expect(fan.vault.files.get(TOKEN_IMAGE)).toBe('IMG');
    expect(fan.vault.files.get(MAP_PATH)).toBe('PLAYED');
    expect(await readInstallRecord(fan.vault.app, collection!.uid)).not.toBeNull();
  });

  it('saves and closes open views of maps it replaces before writing them', async () => {
    const { creator, fan } = await installedV1();
    creator.vault.files.set(MAP_PATH, mapFile(12));
    const steps: string[] = [];
    const view = Object.assign(Object.create(AtlasView.prototype) as AtlasView, {
      getState: () => ({ file: MAP_PATH }),
      saveMap: vi.fn(async () => { steps.push('save'); }),
    });
    const leaf = { view, detach: vi.fn(() => { steps.push('detach'); }) };
    fan.vault.app.workspace.getLeavesOfType = vi.fn(() => [leaf]);
    const modifyBinary = fan.vault.app.vault.modifyBinary.bind(fan.vault.app.vault);
    fan.vault.app.vault.modifyBinary = vi.fn(async (file: TFile, data: ArrayBuffer) => {
      if (file.path === MAP_PATH) steps.push('write');
      return modifyBinary(file, data);
    });

    await importInto(fan, await exportFrom(creator));
    expect(steps).toEqual(['save', 'save', 'detach', 'write']);
  });
});

describe('sharing and forking', () => {
  it('shares a fan\'s copy as the same version, which the creator sees as a changed copy', async () => {
    const creator = await creatorVault();
    const fan = await emptyVault();
    await importInto(fan, await exportFrom(creator));
    const [token] = await fan.assets.getAssets('source', 'token');
    await fan.assets.updateAsset(token!.id, { name: 'Fan goblin' });

    const shared = await exportFrom(fan, { kind: 'share' });
    AssetService.resetInstance();
    const { review } = await reviewImport(creator, shared);
    expect(review).toMatchObject({ relation: 'same', kind: 'share', hasChanges: true, counts: { updated: 1, added: 0, removed: 0 } });
  });

  it('publishes a fork as a new collection that no longer follows the original', async () => {
    const creator = await creatorVault();
    const fan = await emptyVault();
    await importInto(fan, await exportFrom(creator));
    const originalUid = (await fan.assets.getCollection('source'))!.uid;

    const fork = await exportFrom(fan, { kind: 'fork', name: 'Fan edition', author: 'Fan' });
    const forked = await fan.assets.getCollection('source');
    expect(forked).toMatchObject({ name: 'Fan edition', version: 1, author: 'Fan', publisherId: await fan.assets.getVaultId() });
    expect(forked?.uid).not.toBe(originalUid);
    expect((await prepareCollectionExport(fan.vault.app, fan.assets, 'source')).isPublisher).toBe(true);

    AssetService.resetInstance();
    const { review } = await reviewImport(creator, fork);
    expect(review).toMatchObject({ relation: 'new', collectionName: 'Fan edition' });
  });
});
