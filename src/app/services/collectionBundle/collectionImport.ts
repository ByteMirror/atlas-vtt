import { TFile, normalizePath, type App } from 'obsidian';
import type JSZip from 'jszip';
import { COLLECTIONS_DIR, type Asset, type AssetService, type CollectionMetadata } from '../AssetService';
import { ensureFolder } from '../../plugin/vaultFolders';
import { BUNDLE_MANIFEST, isCollectionBundleManifest, zipPathFor, type BundleFile, type CollectionBundleManifest } from './bundleFormat';
import type { BundleProgressListener } from './collectionExport';
import { planImportPaths, remapPaths, type PathMap } from './pathRemap';

/** `kept`: the vault already had the collection and the user chose not to update it. */
export type ImportOutcome = 'created' | 'updated' | 'kept';

export interface CollectionImportResult {
  outcome: ImportOutcome;
  collectionName: string;
  assetCount: number;
  fileCount: number;
}

/** What the user decides on before an export changes a collection the vault already has. */
export interface UpdateRequest {
  /** The vault's copy, which may have been renamed since it arrived. */
  existing: CollectionMetadata;
  imported: CollectionMetadata;
  /** When the bundle was exported. */
  exportedAt: number;
}

export interface ImportOptions {
  onProgress?: BundleProgressListener;
  /** Whether the export replaces the files and assets of the vault's copy. Without it, the copy is kept. */
  confirmUpdate?: (request: UpdateRequest) => Promise<boolean>;
}

/** Text files carry vault paths that must follow the files they point at. */
const REWRITTEN_ROLES = new Set<BundleFile['role']>(['asset-file', 'scene-map']);

async function readManifest(zip: JSZip): Promise<CollectionBundleManifest> {
  const entry = zip.file(BUNDLE_MANIFEST);
  if (!entry) throw new Error('This file is not an Atlas collection export.');
  const parsed: unknown = JSON.parse(await entry.async('string'));
  if (!isCollectionBundleManifest(parsed)) throw new Error('This collection export is damaged or from an incompatible version.');
  return parsed;
}

/** An open Atlas view would save its stale state over a map file the import replaces. */
function closeMapViews(app: App, mapPath: string): void {
  for (const leaf of app.workspace.getLeavesOfType('atlas-vtt')) {
    if (leaf.view.getState().file === mapPath) leaf.detach();
  }
}

/**
 * Asset ids are only unique within the vault that created them. A bundle
 * imported next to its own source (a copy under a new uid) would otherwise
 * overwrite the source's records, so colliding ids are replaced.
 */
async function freshAssetIds(assets: AssetService, imported: readonly Asset[]): Promise<PathMap> {
  const renames = new Map<string, string>();
  for (const asset of imported) {
    if (await assets.getAssetById(asset.id)) {
      renames.set(asset.id, `${asset.type}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`);
    }
  }
  return renames;
}

/** An id that is free, or the one already used by this very collection. */
async function resolveCollectionId(assets: AssetService, imported: CollectionMetadata): Promise<string> {
  const base = imported.name.toLowerCase().replace(/\s+/g, '-') || 'collection';
  for (let n = 1; ; n++) {
    const id = n === 1 ? base : `${base}-${n}`;
    const existing = await assets.getCollection(id);
    if (!existing || existing.uid === imported.uid) return id;
  }
}

class BundleWriter {
  private readonly encoder = new TextEncoder();
  private readonly decoder = new TextDecoder();

  constructor(
    private readonly app: App,
    private readonly zip: JSZip,
    /** Where each bundled file goes. */
    private readonly plan: PathMap,
    /** Every string to replace inside JSON files: the path plan plus renamed asset ids. */
    private readonly rewrites: PathMap,
    private readonly collectionPrefix: string,
  ) {}

  /** Returns whether the file was written. Files already in the vault are only replaced inside the collection folder. */
  async write(file: BundleFile): Promise<boolean> {
    const entry = this.zip.file(zipPathFor(file.vaultPath));
    const target = this.plan.get(file.vaultPath);
    if (!entry || !target) return false;
    const existing = this.app.vault.getAbstractFileByPath(target);
    if (existing && !(existing instanceof TFile && target.startsWith(this.collectionPrefix))) return false;

    let content = await entry.async('arraybuffer');
    if (REWRITTEN_ROLES.has(file.role)) content = this.rewrite(content);

    if (existing instanceof TFile) {
      closeMapViews(this.app, target);
      await this.app.vault.modifyBinary(existing, content);
    } else {
      await ensureFolder(this.app, target.slice(0, target.lastIndexOf('/')));
      await this.app.vault.createBinary(target, content);
    }
    return true;
  }

  /** Statblock notes name their artwork in frontmatter; point copies the import made at where the artwork now lives. Notes the vault already had are left alone. */
  async relinkStatblockImage(file: BundleFile): Promise<void> {
    const target = this.plan.get(file.vaultPath);
    const imagePath = file.statblockImage && this.plan.get(file.statblockImage.path);
    if (!file.statblockImage || !target || !target.startsWith(this.collectionPrefix) || !imagePath || imagePath === file.statblockImage.path) return;
    const note = this.app.vault.getAbstractFileByPath(target);
    if (!(note instanceof TFile)) return;
    const { key } = file.statblockImage;
    await this.app.fileManager.processFrontMatter(note, (frontmatter: Record<string, unknown>) => {
      frontmatter[key] = imagePath;
    });
  }

  private rewrite(content: ArrayBuffer): ArrayBuffer {
    const text = this.decoder.decode(content);
    try {
      const remapped: unknown = remapPaths(JSON.parse(text), this.rewrites);
      const bytes = this.encoder.encode(JSON.stringify(remapped));
      // Copy into a fresh ArrayBuffer: TextEncoder's view may sit on a shared or offset buffer.
      const buffer = new ArrayBuffer(bytes.byteLength);
      new Uint8Array(buffer).set(bytes);
      return buffer;
    } catch {
      return content;
    }
  }
}

/**
 * Restores a collection bundle into this vault: files land in the target
 * collection's folder (global Atlas assets keep their path), every stored
 * path is rewritten to follow them, and the collection record arrives with
 * its tags and settings. Existing statblock notes are reused rather than
 * duplicated. A collection the vault already has (same uid) is only updated
 * when `confirmUpdate` agrees.
 */
export async function importCollectionBundle(
  app: App,
  assets: AssetService,
  data: Blob,
  { onProgress = () => undefined, confirmUpdate = () => Promise.resolve(false) }: ImportOptions = {},
): Promise<CollectionImportResult> {
  onProgress({ message: 'Reading bundle…', fraction: 0 });
  const { default: JSZip } = await import('jszip');
  const zip = await JSZip.loadAsync(await data.arrayBuffer());
  const manifest = await readManifest(zip);
  const imported = manifest.collection;

  const existing = await assets.findCollectionByUid(imported.uid);
  const result: CollectionImportResult = {
    outcome: existing ? 'updated' : 'created',
    collectionName: imported.name,
    assetCount: 0,
    fileCount: 0,
  };
  // Neither copy knows which one holds the work to keep, so the user decides.
  if (existing && !(await confirmUpdate({ existing, imported, exportedAt: manifest.exportedAt }))) {
    return { ...result, outcome: 'kept' };
  }

  const collectionId = existing?.id ?? await resolveCollectionId(assets, imported);
  const plan = new Map(planImportPaths(
    manifest.files,
    imported.id,
    collectionId,
    (path) => app.vault.getAbstractFileByPath(normalizePath(path)) instanceof TFile,
  ));
  const renames = existing ? new Map<string, string>() : await freshAssetIds(assets, manifest.assets);
  // A map asset's JSON record is found by id, so a renamed map takes its file along.
  for (const asset of manifest.assets) {
    const renamed = renames.get(asset.id);
    if (asset.type === 'map' && renamed) {
      plan.set(`${COLLECTIONS_DIR}/${imported.id}/maps/${asset.id}.json`, `${COLLECTIONS_DIR}/${collectionId}/maps/${renamed}.json`);
    }
  }
  const rewrites = new Map([...plan, ...renames]);
  const writer = new BundleWriter(app, zip, plan, rewrites, `${COLLECTIONS_DIR}/${collectionId}/`);

  for (const [index, file] of manifest.files.entries()) {
    onProgress({ message: `Writing ${index + 1} of ${manifest.files.length} files…`, fraction: (index / manifest.files.length) * 0.9 });
    if (await writer.write(file)) result.fileCount += 1;
  }
  for (const file of manifest.files) {
    if (file.role === 'statblock-note') await writer.relinkStatblockImage(file);
  }

  onProgress({ message: 'Registering assets…', fraction: 0.95 });
  const importedAssets = manifest.assets.map((asset): Asset => remapPaths(asset, rewrites));
  await assets.adoptImportedCollection(imported, importedAssets, collectionId);
  result.assetCount = importedAssets.length;
  onProgress({ message: 'Done', fraction: 1 });
  return result;
}
