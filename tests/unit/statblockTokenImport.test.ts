import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { TFile } from 'obsidian';
import { StatblockTokenImportService } from '../../src/app/services/StatblockTokenImportService';
import { AssetService } from '../../src/app/services/AssetService';
import { TokenStatblockLinkService } from '../../src/app/services/TokenStatblockLinkService';
import { createInMemoryApp } from '../mocks/inMemoryVault';

const note = 'Bestiary/Goblin.md';
const image = 'Artwork/goblin.webp';
function setup() {
  const state = createInMemoryApp({ files: { [note]: 'Original note', [image]: 'image-bytes' } });
  state.app.workspace = { trigger: vi.fn() };
  const frontmatter: Record<string, Record<string, unknown>> = { [note]: { statblock: true, name: 'Goblin', image } };
  state.app.vault.cachedRead = state.app.vault.read;
  state.app.vault.getMarkdownFiles = () => [...state.files.keys()].filter(p => p.endsWith('.md')).map(p => new TFile(p));
  state.app.vault.createBinary = vi.fn(async (p: string, bytes: ArrayBuffer) => {
    state.files.set(p, new TextDecoder().decode(bytes));
    return new TFile(p);
  });
  state.app.metadataCache.getFileCache = (file: TFile) => ({ frontmatter: frontmatter[file.path] });
  state.app.metadataCache.getFirstLinkpathDest = (p: string) => state.files.has(p) ? new TFile(p) : null;
  Object.assign(window, { FantasyStatblocks: {
    isResolved: () => true,
    getBestiaryCreatures: () => Object.entries(frontmatter).map(([path, values]) => ({ path, ...values })),
    hasCreature: () => false,
  } });
  return { ...state, frontmatter, assets: AssetService.getInstance(state.app) };
}
beforeEach(() => {
  Reflect.set(AssetService, 'instance', null);
  Reflect.set(TokenStatblockLinkService, 'instance', null);
});
afterEach(() => { Reflect.deleteProperty(window, 'FantasyStatblocks'); });

describe('statblock token import', () => {
  it('does not mistake source artwork for an existing Atlas token', async () => {
    const { app, assets } = setup();
    await assets.initialize();
    const service = TokenStatblockLinkService.getInstance(app);
    expect(await service.getTokenLinkedToStatblock(note)).toBeNull();
  });
});

// The importer exercises real asset persistence; only the Obsidian filesystem is simulated.

describe('bulk importing recognized statblock notes', () => {
  it('resolves YAML wikilinks, inline statblocks and remote/missing images without guessing from names', async () => {
    const { app, files, frontmatter, assets } = setup();
    frontmatter[note]!.image = [[image + '|portrait']];
    files.set('Other/Goblin.md', 'ordinary note');
    files.set('Inline.md', '```statblock\nname: Orc\nimage: Artwork/goblin.webp\n```');
    files.set('Remote.md', 'remote');
    frontmatter['Remote.md'] = { statblock: true, name: 'Remote', image: 'https://example.com/orc.png' };
    files.set('Missing.md', 'missing');
    frontmatter['Missing.md'] = { statblock: true, name: 'Missing', image: 'missing.png' };
    const rows = await new StatblockTokenImportService(app, assets).scan();
    expect(rows.map(r => [r.path, r.status])).toEqual(expect.arrayContaining([
      [note, 'ready'], ['Inline.md', 'ready'], ['Remote.md', 'remote-image'], ['Missing.md', 'missing-image'],
    ]));
    expect(rows.find(r => r.path === 'Other/Goblin.md')).toBeUndefined();
    expect(rows.find(r => r.path === note)?.imagePath).toBe(image);
  });

  it('creates distinct owned images for equal names/artwork, preserves source notes and skips reruns', async () => {
    const { app, files, frontmatter, assets } = setup();
    files.set('Other/Goblin.md', 'Other original');
    frontmatter['Other/Goblin.md'] = { ...frontmatter[note] };
    const importer = new StatblockTokenImportService(app, assets);
    const result = await importer.import([note, 'Other/Goblin.md', note], 'default');
    expect(result.items.map(i => i.status)).toEqual(['created', 'created']);
    const tokens = await assets.getTokenAssets();
    expect(tokens).toHaveLength(2);
    expect(new Set(tokens.map(t => t.imagePath)).size).toBe(2);
    expect(tokens.every(t => t.imagePath.startsWith('atlas-vtt/assets/'))).toBe(true);
    expect(tokens.map(t => t.statblockPath)).toEqual([note, 'Other/Goblin.md']);
    expect(files.get(note)).toBe('Original note');
    expect(files.get(image)).toBe('image-bytes');
    await assets.updateTokenAsset(tokens[0]!.id, { name: 'Customized Goblin' });
    expect((await importer.import([note], 'default')).items[0]?.status).toBe('skipped');
    expect((await assets.getTokenAssets())[0]?.name).toBe('Customized Goblin');
    await assets.deleteAsset(tokens[0]!.id);
    expect(files.get(image)).toBe('image-bytes');
  });

  it('revalidates deleted artwork, continues after individual failures and supports cancellation', async () => {
    const { app, files, frontmatter, assets } = setup();
    files.set('Next.md', 'Next');
    frontmatter['Next.md'] = { ...frontmatter[note], name: 'Next' };
    const importer = new StatblockTokenImportService(app, assets);
    await importer.scan();
    files.delete(image);
    expect((await importer.import([note], 'default')).items[0]?.status).toBe('skipped');
    files.set(image, 'bytes');
    app.vault.createBinary.mockRejectedValueOnce(new Error('Disk full'));
    expect((await importer.import([note, 'Next.md'], 'default')).items.map(i=>i.status)).toEqual(['failed', 'created']);
    const controller = new AbortController();
    const result = await importer.import([note, 'Next.md'], 'default', { signal: controller.signal, onProgress: () => controller.abort() });
    expect(result.items).toHaveLength(1);
    expect(result.cancelled).toBe(true);
  });

  it('does not register a phantom token after a primary metadata write fails', async () => {
    const { app, files, assets } = setup();
    await assets.initialize();
    const write = app.vault.adapter.write;
    app.vault.adapter.write = vi.fn(async (path: string, data: string) => {
      if (path.endsWith('assets-metadata.json')) throw new Error('Disk full');
      return write(path, data);
    });
    const importer = new StatblockTokenImportService(app, assets);
    expect((await importer.import([note], 'default')).items[0]?.status).toBe('failed');
    app.vault.adapter.write = write;
    expect(await assets.getTokenAssets()).toHaveLength(0);
    expect([...files.keys()].filter(p => p.startsWith('atlas-vtt/assets/'))).toHaveLength(0);
    expect((await importer.import([note], 'default')).items[0]?.status).toBe('created');
  });

  it('recognizes a committed token if only the legacy metadata mirror write fails', async () => {
    const { app, files, assets } = setup();
    await assets.initialize();
    files.set('atlas-vtt/assets-metadata.json', files.get('atlas-vtt/.atlas-data/assets-metadata.json')!);
    const write = app.vault.adapter.write;
    app.vault.adapter.write = vi.fn(async (path: string, data: string) => {
      if (path === 'atlas-vtt/assets-metadata.json') throw new Error('Mirror unavailable');
      return write(path, data);
    });
    const importer = new StatblockTokenImportService(app, assets);
    expect((await importer.import([note], 'default')).items[0]?.status).toBe('created');
    expect((await importer.import([note], 'default')).items[0]?.status).toBe('skipped');
    expect(await assets.getTokenAssets()).toHaveLength(1);
  });

  it('stops and retains the copied image when a write cannot be verified', async () => {
    const { app, files, frontmatter, assets } = setup();
    files.set('Next.md', 'Next');
    frontmatter['Next.md'] = { ...frontmatter[note], name: 'Next' };
    await assets.initialize();
    const read = app.vault.adapter.read;
    let writeFailed = false;
    app.vault.adapter.write = vi.fn(async () => { writeFailed = true; throw new Error('Storage unavailable'); });
    app.vault.adapter.read = vi.fn(async (path: string) => {
      if (writeFailed) throw new Error('Storage unavailable');
      return read(path);
    });
    const result = await new StatblockTokenImportService(app, assets).import([note, 'Next.md'], 'default');
    expect(result.uncertain).toBe(true);
    expect(result.items).toHaveLength(1);
    expect(result.items[0]?.status).toBe('failed');
    expect([...files.keys()].filter(p => p.startsWith('atlas-vtt/assets/'))).toHaveLength(1);
    expect(files.get(image)).toBe('image-bytes');
  });

  it('requires a loaded bestiary and serializes import sessions', async () => {
    const { app, assets } = setup();
    const importer = new StatblockTokenImportService(app, assets);
    const api = window.FantasyStatblocks;
    Reflect.deleteProperty(window, 'FantasyStatblocks');
    await expect(importer.scan()).rejects.toThrow('Enable Fantasy Statblocks');
    Object.assign(window, { FantasyStatblocks: { ...api, isResolved: () => false } });
    await expect(importer.scan()).rejects.toThrow('still loading');
    Object.assign(window, { FantasyStatblocks: api });
    const first = importer.import([note], 'default');
    await expect(importer.import([note], 'default')).rejects.toThrow('already running');
    expect((await first).items[0]?.status).toBe('created');
    expect((await importer.import([note], 'default')).items[0]?.status).toBe('skipped');
  });

  it('shares the safe import path with the single-note command', async () => {
    const { app, files, assets } = setup();
    const link = TokenStatblockLinkService.getInstance(app);
    const created = await link.createTokenFromStatblockImage(note);
    expect(created).toMatch(/^atlas-vtt\/assets\/.*\.webp$/);
    expect(await link.getTokenLinkedToStatblock(note)).toBe(created);
    expect(await link.createTokenFromStatblockImage(note)).toBeNull();
    expect(await assets.getTokenAssets()).toHaveLength(1);
    expect(files.get(note)).toBe('Original note');
  });

  it('discovers explicit layouts and persists separate ring choices', async () => {
    const { app, assets, files, frontmatter } = setup();
    frontmatter[note]!.layout = 'Basic 5e Layout';
    files.set('Ogre.md', 'Ogre');
    frontmatter['Ogre.md'] = { ...frontmatter[note], name: 'Ogre', layout: 'Daggerheart Adversary' };
    const importer = new StatblockTokenImportService(app, assets);
    expect((await importer.scan()).map(r => r.layoutName)).toEqual(['Basic 5e Layout', 'Daggerheart Adversary']);
    const result = await importer.import([note, 'Ogre.md'], 'default', { ringByPath: { [note]: false, 'Ogre.md': true } });
    expect(result.items.map(i => i.asset?.showRing)).toEqual([false, true]);
    expect((await assets.getTokenAssets()).map(t => t.showRing)).toEqual([false, true]);
  });

});
