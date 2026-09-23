import { TFile, type App } from 'obsidian';
import { ATLAS_VTT_DIR, type Asset, type AssetService, type CollectionMetadata } from '../AssetService';
import { BUNDLE_FORMAT, BUNDLE_MANIFEST, zipPathFor, type BundleFile, type CollectionBundleManifest } from './bundleFormat';
import { rewriteContent } from './bundleContent';
import { CollectionReferenceCollector, type MissingReference } from './collectionReferences';
import { assetFingerprint, fieldFingerprint } from './fingerprints';
import { sha256 } from './hashing';
import { COLLECTION_FIELDS, deleteInstallRecord, readInstallRecord, writeInstallRecord, type InstallRecord } from './installRecord';
import { remapPaths } from './pathRemap';

export interface BundleProgress {
  message: string;
  /** 0..1 */
  fraction: number;
}
export type BundleProgressListener = (progress: BundleProgress) => void;

/** Images and audio are already compressed; deflating them only costs time. */
const STORED_EXTENSIONS = /\.(png|jpe?g|webp|gif|avif|mp3|ogg|wav|m4a|zip)$/i;

/** What an export would pack, shown before the user decides how to export. */
export interface ExportPreview {
  collection: CollectionMetadata;
  assets: Asset[];
  files: BundleFile[];
  missing: MissingReference[];
  totalBytes: number;
  /** This vault publishes the collection, so its exports are releases. */
  isPublisher: boolean;
  /** Lowest version a release may carry. */
  minimumVersion: number;
  suggestedVersion: number;
}

/**
 * - `release`: the publisher's new version, which installed copies update to.
 * - `share`: a copy of the installed version, with the sharer's changes.
 * - `fork`: the collection becomes this vault's own under a new identity and name.
 */
export type ExportChoice =
  | { kind: 'release'; version: number; author?: string | undefined; notes?: string | undefined }
  | { kind: 'share' }
  | { kind: 'fork'; name: string; author?: string | undefined; notes?: string | undefined };

export interface ExportedBundle {
  blob: Blob;
  fileName: string;
  collectionName: string;
  version: number;
  assetCount: number;
  fileCount: number;
}

/** Collections from before publishing existed belong to this vault unless they were installed from a bundle. */
async function isPublisherOf(app: App, assets: AssetService, collection: CollectionMetadata): Promise<boolean> {
  if (collection.publisherId !== undefined) return collection.publisherId === await assets.getVaultId();
  return (await readInstallRecord(app, collection.uid)) === null;
}

export async function prepareCollectionExport(app: App, assets: AssetService, collectionId: string): Promise<ExportPreview> {
  const collection = await assets.getCollection(collectionId);
  if (!collection) throw new Error(`Collection ${collectionId} not found`);
  const collectionAssets = await assets.getAssets(collectionId);
  const { files, missing } = await new CollectionReferenceCollector(app, assets).collect(collectionAssets);
  const totalBytes = files.reduce((sum, file) => {
    const vaultFile = app.vault.getAbstractFileByPath(file.vaultPath);
    return sum + (vaultFile instanceof TFile ? vaultFile.stat.size : 0);
  }, 0);
  const isPublisher = await isPublisherOf(app, assets, collection);
  // A collection that was never released starts at its own version; later releases count up.
  const neverReleased = collection.publisherId !== undefined && collection.releasedAt === undefined;
  return {
    collection: { ...collection },
    assets: collectionAssets,
    files,
    missing,
    totalBytes,
    isPublisher,
    minimumVersion: collection.version,
    suggestedVersion: neverReleased ? collection.version : collection.version + 1,
  };
}

export function bundleFileName(name: string, version: number): string {
  const safeName = name.replace(/[\\/:*?"<>|]+/g, '-').trim() || 'Collection';
  return `${safeName} v${version}.atlas-collection.zip`;
}

/** The collection record the bundle carries for `choice`. */
async function exportedCollection(assets: AssetService, preview: ExportPreview, choice: ExportChoice, exportedAt: number): Promise<CollectionMetadata> {
  const base: CollectionMetadata = { ...preview.collection, releasedAt: exportedAt };
  if (choice.kind === 'share') return base;
  const release: CollectionMetadata = { ...base, publisherId: await assets.getVaultId() };
  const author = choice.author?.trim();
  if (author) release.author = author;
  else delete release.author;
  return choice.kind === 'release'
    ? { ...release, version: choice.version }
    : { ...release, uid: crypto.randomUUID(), name: choice.name.trim(), version: 1 };
}

/**
 * Packs the previewed collection with every file it depends on into a zip.
 * Files keep their vault paths inside the archive; the manifest lists them
 * with their roles, owners and SHA-256, so the importer can place, verify and
 * compare them. Releases and forks are recorded as this vault's install of
 * that version, so re-importing an older export of it is recognised.
 */
export async function exportCollectionBundle(
  app: App,
  assets: AssetService,
  preview: ExportPreview,
  choice: ExportChoice,
  onProgress: BundleProgressListener = () => undefined,
): Promise<ExportedBundle> {
  if (choice.kind === 'release' && !preview.isPublisher) {
    throw new Error('Only the collection\'s publisher can release new versions.');
  }
  if (choice.kind === 'release' && (!Number.isInteger(choice.version) || choice.version < preview.minimumVersion)) {
    throw new Error(`The version must be a whole number of at least ${preview.minimumVersion}.`);
  }
  if (choice.kind === 'fork' && await assets.isCollectionNameTaken(choice.name, preview.collection.id)) {
    throw new Error(`A collection named "${choice.name.trim()}" already exists.`);
  }

  const exportedAt = Date.now();
  const origin = choice.kind === 'share' ? await originNames(app, preview.collection) : { collectionId: preview.collection.id, names: new Map<string, string>() };
  const collection = { ...await exportedCollection(assets, preview, choice, exportedAt), id: origin.collectionId };
  const named = (value: string): string => origin.names.get(value) ?? value;
  const { default: JSZip } = await import('jszip');
  const zip = new JSZip();
  const files: BundleFile[] = [];
  for (const [index, file] of preview.files.entries()) {
    onProgress({ message: `Adding ${index + 1} of ${preview.files.length} files…`, fraction: (index / preview.files.length) * 0.6 });
    const vaultFile = app.vault.getAbstractFileByPath(file.vaultPath);
    if (!(vaultFile instanceof TFile)) continue;
    const data = rewriteContent(file, await app.vault.readBinary(vaultFile), origin.names);
    const bundlePath = named(file.vaultPath);
    files.push({
      ...file,
      vaultPath: bundlePath,
      sha256: await sha256(data),
      ...(file.owners && { owners: file.owners.map(named) }),
      ...(file.statblockImage && { statblockImage: { ...file.statblockImage, path: named(file.statblockImage.path) } }),
    });
    zip.file(zipPathFor(bundlePath), data, { compression: STORED_EXTENSIONS.test(bundlePath) ? 'STORE' : 'DEFLATE' });
  }
  const notes = choice.kind === 'share' ? undefined : choice.notes?.trim() || undefined;
  const manifest: CollectionBundleManifest = {
    format: BUNDLE_FORMAT,
    exportedAt,
    collection,
    release: { kind: choice.kind === 'share' ? 'share' : 'release', ...(notes ? { notes } : {}) },
    assets: preview.assets.map((asset) => remapPaths(asset, origin.names)),
    files,
  };
  zip.file(BUNDLE_MANIFEST, JSON.stringify(manifest, null, 2));

  const blob = await zip.generateAsync({ type: 'blob', streamFiles: true }, ({ percent }) => {
    onProgress({ message: 'Compressing…', fraction: 0.6 + (percent / 100) * 0.4 });
  });
  if (choice.kind !== 'share') await recordRelease(app, assets, preview, manifest);
  return {
    blob,
    fileName: bundleFileName(collection.name, collection.version),
    collectionName: collection.name,
    version: collection.version,
    assetCount: preview.assets.length,
    fileCount: files.length,
  };
}

/**
 * A shared copy names its files and assets as the bundles it was installed
 * from did, so every vault that has the collection compares the same items.
 */
async function originNames(app: App, collection: CollectionMetadata): Promise<{ collectionId: string; names: Map<string, string> }> {
  const record = await readInstallRecord(app, collection.uid);
  const names = new Map<string, string>();
  for (const [bundlePath, file] of Object.entries(record?.files ?? {})) {
    if (file.target !== bundlePath) names.set(file.target, bundlePath);
  }
  for (const [bundleId, asset] of Object.entries(record?.assets ?? {})) {
    if (asset.localId !== bundleId) names.set(asset.localId, bundleId);
  }
  return { collectionId: record?.sourceCollectionId ?? collection.id, names };
}

/**
 * The publisher's vault holds exactly what it exported, so every fingerprint is
 * both source and installed state. Files outside Atlas's folder are the
 * publisher's own notes and never become part of the record.
 */
async function recordRelease(app: App, assets: AssetService, preview: ExportPreview, manifest: CollectionBundleManifest): Promise<void> {
  const { collection } = manifest;
  const collectionId = preview.collection.id;
  if (collection.uid !== preview.collection.uid) {
    await assets.forkCollection(collectionId, collection.name, collection.uid);
    await deleteInstallRecord(app, preview.collection.uid);
  }
  await assets.recordCollectionRelease(collectionId, { version: collection.version, releasedAt: manifest.exportedAt, author: collection.author });

  const record: InstallRecord = {
    uid: collection.uid,
    collectionId,
    sourceCollectionId: collectionId,
    version: collection.version,
    releasedAt: manifest.exportedAt,
    installedAt: manifest.exportedAt,
    files: {},
    assets: {},
    fields: {},
  };
  for (const file of manifest.files) {
    if (file.sha256 && file.vaultPath.startsWith(`${ATLAS_VTT_DIR}/`)) {
      record.files[file.vaultPath] = { target: file.vaultPath, source: file.sha256, installed: file.sha256 };
    }
  }
  for (const asset of manifest.assets) {
    const fingerprint = await assetFingerprint(asset);
    record.assets[asset.id] = { localId: asset.id, source: fingerprint, installed: fingerprint };
  }
  for (const field of COLLECTION_FIELDS) {
    const fingerprint = await fieldFingerprint(collection, field);
    record.fields[field] = { source: fingerprint, installed: fingerprint };
  }
  await writeInstallRecord(app, record);
}
