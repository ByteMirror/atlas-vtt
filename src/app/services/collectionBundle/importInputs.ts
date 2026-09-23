import { TFile, normalizePath, type App } from 'obsidian';
import { ATLAS_VTT_DIR, COLLECTIONS_DIR, type Asset, type AssetService, type CollectionMetadata } from '../AssetService';
import { zipPathFor, type BundleFile } from './bundleFormat';
import type { OpenedBundle } from './bundleReader';
import { rewriteContent, isContentPredictable } from './bundleContent';
import { assetFingerprint, fieldFingerprint } from './fingerprints';
import { sha256 } from './hashing';
import { COLLECTION_FIELDS, type InstallRecord } from './installRecord';
import type { PlanItemInput } from './importPlan';
import { planImportPaths, remapPaths } from './pathRemap';

/** Where the bundle's files and records go in this vault. */
export interface ImportTargets {
  collectionId: string;
  /** Bundle path → vault path. */
  paths: Map<string, string>;
  /** Bundle asset id → id in this vault. */
  assetIds: Map<string, string>;
  /** Every string replaced inside JSON files and asset records: moved paths and renamed ids. */
  rewrites: Map<string, string>;
  /** Bundle paths of files the vault already has but the collection does not own; never written or removed. */
  shared: Set<string>;
}

/** What the planner compares, plus how to name each unit for the user. */
export interface ImportInputs {
  items: PlanItemInput[];
  /** Unit key → the asset it stands for, when it stands for one. */
  unitAssets: Map<string, Asset>;
}

/** The record the import stores for a bundle asset: paths and ids rewritten, filed under the target collection. */
export function installedAsset(asset: Asset, targets: ImportTargets): Asset {
  return { ...remapPaths(asset, targets.rewrites), id: targets.assetIds.get(asset.id) ?? asset.id, collection: targets.collectionId };
}

const newAssetId = (asset: Asset): string => `${asset.type}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;

export async function planTargets(
  app: App,
  assets: AssetService,
  { manifest }: OpenedBundle,
  collectionId: string,
  record: InstallRecord | null,
): Promise<ImportTargets> {
  const exists = (path: string): boolean => app.vault.getAbstractFileByPath(normalizePath(path)) instanceof TFile;
  const paths = new Map<string, string>();
  for (const file of manifest.files) {
    const target = record?.files[file.vaultPath]?.target;
    if (target) paths.set(file.vaultPath, target);
  }
  const unplaced = manifest.files.filter((file) => !paths.has(file.vaultPath));
  for (const [source, target] of planImportPaths(unplaced, manifest.collection.id, collectionId, exists, paths.values())) {
    paths.set(source, target);
  }

  // Ids are unique only within the vault that made them: one another collection uses gets a new id here.
  const assetIds = new Map<string, string>();
  for (const asset of manifest.assets) {
    const recorded = record?.assets[asset.id]?.localId;
    const local = recorded ? null : await assets.getAssetById(asset.id);
    const localId = recorded ?? (local && local.collection !== collectionId ? newAssetId(asset) : asset.id);
    assetIds.set(asset.id, localId);
    // A map record is found by id, so a renamed map takes its file along.
    const mapFile = `${COLLECTIONS_DIR}/${manifest.collection.id}/maps/${asset.id}.json`;
    if (asset.type === 'map' && localId !== asset.id && !record?.files[mapFile]) {
      paths.set(mapFile, `${COLLECTIONS_DIR}/${collectionId}/maps/${localId}.json`);
    }
  }

  const collectionPrefix = `${COLLECTIONS_DIR}/${collectionId}/`;
  const shared = new Set<string>();
  for (const [source, target] of paths) {
    if (!record?.files[source] && !target.startsWith(collectionPrefix) && exists(target)) shared.add(source);
  }
  const rewrites = new Map<string, string>();
  for (const [source, target] of [...paths, ...assetIds]) {
    if (source !== target) rewrites.set(source, target);
  }
  return { collectionId, paths, assetIds, rewrites, shared };
}

async function vaultFileHash(app: App, path: string): Promise<string | null> {
  const file = app.vault.getAbstractFileByPath(path);
  return file instanceof TFile ? sha256(await app.vault.readBinary(file)) : null;
}

const fileUnit = (file: BundleFile): string => (file.owners?.length === 1 ? `asset:${file.owners[0]}` : `file:${file.vaultPath}`);

/** Gathers base, mine and theirs for every file, asset record and collection field. */
export async function gatherImportInputs(
  app: App,
  assets: AssetService,
  bundle: OpenedBundle,
  targets: ImportTargets,
  existing: CollectionMetadata | null,
  record: InstallRecord | null,
): Promise<ImportInputs> {
  const { manifest, zip, sourceHashes } = bundle;
  const items: PlanItemInput[] = [];
  const unitAssets = new Map<string, Asset>();

  for (const file of manifest.files) {
    if (targets.shared.has(file.vaultPath)) continue;
    const target = targets.paths.get(file.vaultPath)!;
    const theirs = sourceHashes.get(file.vaultPath) ?? null;
    const entry = zip.file(zipPathFor(file.vaultPath));
    let theirsInstalled: string | undefined;
    if (theirs !== null && entry && isContentPredictable(file)) {
      theirsInstalled = await sha256(rewriteContent(file, await entry.async('arraybuffer'), targets.rewrites));
    }
    items.push({
      key: `file:${file.vaultPath}`, kind: 'file', unit: fileUnit(file),
      theirs, base: record?.files[file.vaultPath] ?? null, mine: await vaultFileHash(app, target), theirsInstalled,
    });
  }
  const bundledPaths = new Set(manifest.files.map((file) => file.vaultPath));
  for (const [path, installed] of Object.entries(record?.files ?? {})) {
    // Files outside Atlas's folder are the user's own notes; an import never removes them.
    if (bundledPaths.has(path) || !installed.target.startsWith(`${ATLAS_VTT_DIR}/`)) continue;
    items.push({ key: `file:${path}`, kind: 'file', unit: installed.unit ?? `file:${path}`, theirs: null, base: installed, mine: await vaultFileHash(app, installed.target) });
  }

  const ownRecord = async (localId: string): Promise<Asset | null> => {
    const local = await assets.getAssetById(localId);
    return local && existing && local.collection === existing.id ? local : null;
  };
  for (const asset of manifest.assets) {
    const localId = targets.assetIds.get(asset.id)!;
    const local = await ownRecord(localId);
    const installed = installedAsset(asset, targets);
    unitAssets.set(`asset:${asset.id}`, local ?? installed);
    items.push({
      key: `asset:${asset.id}`, kind: 'asset', unit: `asset:${asset.id}`,
      theirs: await assetFingerprint(asset), base: record?.assets[asset.id] ?? null,
      mine: local ? await assetFingerprint(local) : null, theirsInstalled: await assetFingerprint(installed),
    });
  }
  const bundledIds = new Set(manifest.assets.map((asset) => asset.id));
  for (const [bundleId, installed] of Object.entries(record?.assets ?? {})) {
    if (bundledIds.has(bundleId)) continue;
    const local = await ownRecord(installed.localId);
    if (local) unitAssets.set(`asset:${bundleId}`, local);
    items.push({ key: `asset:${bundleId}`, kind: 'asset', unit: `asset:${bundleId}`, theirs: null, base: installed, mine: local ? await assetFingerprint(local) : null });
  }

  for (const field of COLLECTION_FIELDS) {
    const theirs = await fieldFingerprint(manifest.collection, field);
    items.push({
      key: `field:${field}`, kind: 'field', unit: `field:${field}`,
      theirs, base: record?.fields[field] ?? null, mine: existing ? await fieldFingerprint(existing, field) : null, theirsInstalled: theirs,
    });
  }
  return { items, unitAssets };
}
