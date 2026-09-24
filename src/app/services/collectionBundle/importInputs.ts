import { TFile, normalizePath, type App } from 'obsidian';
import { AssetService, ATLAS_VTT_DIR, COLLECTIONS_DIR, GLOBAL_ASSETS_DIR, type Asset, type CollectionMetadata } from '../AssetService';
import { isSafeBundlePath, zipPathFor, type BundleFile } from './bundleFormat';
import { linkedFilePath } from './collectionReferences';
import type { OpenedBundle } from './bundleReader';
import { mayRewrite, rewriteContent } from './bundleContent';
import { assetFingerprint, fieldFingerprint } from './fingerprints';
import { sha256 } from './hashing';
import { COLLECTION_FIELDS, type InstallRecord } from './installRecord';
import type { PlanItemInput } from './importPlan';
import { planImportPaths, remapPaths } from './pathRemap';
import { listHiddenFiles, readVaultBinary } from '../../utils/hiddenVaultFiles';

/** Where the bundle's files and records go in this vault. */
export interface ImportTargets {
  collectionId: string;
  /** Vault path of a bundle file, including files only the install record still knows. */
  targetOf(bundlePath: string): string | undefined;
  /** Id in this vault of a bundle asset, including assets only the install record still knows. */
  localIdOf(bundleId: string): string;
  /** Bundle path → vault path. */
  paths: Map<string, string>;
  /** Bundle asset id → id in this vault. */
  assetIds: Map<string, string>;
  /** Every string replaced inside JSON files and asset records: moved paths and renamed ids. */
  rewrites: Map<string, string>;
  /** Bundle paths of files the vault already has but the collection does not own; never written or removed. */
  shared: Set<string>;
  /** Assets left out because deleting them would trash a file outside Atlas's folder the collection does not own. */
  skipped: SkippedAsset[];
}

export interface SkippedAsset {
  bundleId: string;
  name: string;
  path: string;
}

/** What the planner compares, plus how to name each unit for the user. */
interface ImportInputs {
  items: PlanItemInput[];
  /** Unit key → the asset it stands for, when it stands for one. */
  unitAssets: Map<string, Asset>;
}

/** The record the import stores for a bundle asset: paths and ids rewritten, filed under the target collection. */
export function installedAsset(asset: Asset, targets: ImportTargets): Asset {
  return { ...remapPaths(asset, targets.rewrites), id: targets.assetIds.get(asset.id) ?? asset.id, collection: targets.collectionId };
}

/** Asset fields naming files that deleting the asset trashes; an import must never point them outside Atlas's folder. */
const DELETABLE_PATH_FIELDS = ['imagePath', 'notePath', 'filePath', 'thumbnailPath', 'mapFilePath'] as const;

function deletablePaths(asset: Asset): string[] {
  const record: Record<string, unknown> = { ...asset };
  const data = record.data;
  const paths = DELETABLE_PATH_FIELDS.map((field) => record[field]);
  if (data && typeof data === 'object' && 'mapPath' in data) paths.push(data.mapPath);
  return paths.filter((path): path is string => typeof path === 'string' && path !== '');
}

/**
 * Assets that, once imported, would name a file deleting them trashes outside
 * Atlas's folder and outside what this vault already had in the collection:
 * a crafted bundle, or a note that was missing when the bundle was made.
 */
function unsafeAssets(assets: readonly Asset[], targets: ImportTargets, ownedPaths: ReadonlySet<string>): SkippedAsset[] {
  return assets.flatMap((asset): SkippedAsset[] => {
    const outside = deletablePaths(installedAsset(asset, targets))
      .find((path) => !ownedPaths.has(path) && (!path.startsWith(`${ATLAS_VTT_DIR}/`) || !isSafeBundlePath(path)));
    return outside ? [{ bundleId: asset.id, name: asset.name, path: outside }] : [];
  });
}

/** Every string anywhere in `values`: the paths records and maps refer to (note links also by the file they open), among other text. */
export function referencedStrings(values: readonly unknown[], into: Set<string> = new Set()): Set<string> {
  const visit = (value: unknown): void => {
    if (typeof value === 'string') into.add(value).add(linkedFilePath(value));
    else if (Array.isArray(value)) value.forEach(visit);
    else if (value && typeof value === 'object') Object.values(value).forEach(visit);
  };
  values.forEach(visit);
  return into;
}

/** Fingerprint of the vault file at `path`, or null when there is none. */
export async function vaultFileHash(app: App, path: string): Promise<string | null> {
  const content = await readVaultBinary(app, path);
  return content ? sha256(content) : null;
}

/** The vault's record with `localId` when it belongs to the collection being updated; one in another collection is the user's own. */
export async function ownAsset(assets: AssetService, existing: CollectionMetadata | null, localId: string): Promise<Asset | null> {
  const local = await assets.getAssetById(localId);
  return local && existing && local.collection === existing.id ? local : null;
}

export async function planTargets(
  app: App,
  assets: AssetService,
  { manifest, sourceHashes }: OpenedBundle,
  collectionId: string,
  record: InstallRecord | null,
): Promise<ImportTargets> {
  const hiddenFiles = await listHiddenFiles(app, `${COLLECTIONS_DIR}/${collectionId}`);
  const exists = (path: string): boolean => app.vault.getAbstractFileByPath(normalizePath(path)) instanceof TFile || hiddenFiles.has(path);
  const paths = new Map<string, string>();
  for (const file of manifest.files) {
    const target = record?.files[file.vaultPath]?.target;
    if (target) paths.set(file.vaultPath, target);
  }
  const unplaced = manifest.files.filter((file) => !paths.has(file.vaultPath));
  // Shared Atlas artwork is only reused when it is the same file; otherwise the bundle's copy gets its own path.
  const sameContent = new Set<string>();
  for (const file of unplaced) {
    const hash = sourceHashes.get(file.vaultPath);
    if (hash && file.vaultPath.startsWith(`${GLOBAL_ASSETS_DIR}/`) && await vaultFileHash(app, file.vaultPath) === hash) sameContent.add(file.vaultPath);
  }
  // Artwork only this collection's assets use is its own earlier install, even when the vault has no record of it.
  const everyAsset = await assets.getAssets();
  const usedHere = referencedStrings(everyAsset.filter((asset) => asset.collection === collectionId));
  const usedElsewhere = referencedStrings(everyAsset.filter((asset) => asset.collection !== collectionId));
  const recordTargets = record ? new Set(Object.values(record.files).map((file) => file.target)) : null;
  // Artwork no other collection uses belongs to this one: already used by it, or the identical file it brings.
  const isOwnArtwork = (path: string): boolean => !usedElsewhere.has(path) && (usedHere.has(path) || sameContent.has(path));
  const planned = planImportPaths(unplaced, {
    sourceCollectionId: manifest.collection.id,
    targetCollectionId: collectionId,
    existsInVault: exists,
    hasSameContent: (file) => sameContent.has(file.vaultPath) || isOwnArtwork(file.vaultPath),
    recordTargets,
  });
  for (const [source, target] of planned) paths.set(source, target);

  // Ids are unique only within the vault that made them: one another collection uses gets a new id here.
  const assetIds = new Map<string, string>();
  for (const asset of manifest.assets) {
    const candidate = record?.assets[asset.id]?.localId ?? asset.id;
    const local = await assets.getAssetById(candidate);
    const localId = local && local.collection !== collectionId ? AssetService.newAssetId(asset.type) : candidate;
    assetIds.set(asset.id, localId);
    // Records without an explicit file path find their file by id, so a renamed record takes its file along.
    const derivesFile = asset.type === 'map' || (asset.type !== 'token' && asset.type !== 'note' && !asset.filePath);
    const bundleFile = assets.getAssetFilePath({ ...asset, collection: manifest.collection.id });
    if (derivesFile && localId !== asset.id) {
      paths.set(bundleFile, assets.getAssetFilePath({ ...asset, id: localId, collection: collectionId }));
    }
  }

  const collectionPrefix = `${COLLECTIONS_DIR}/${collectionId}/`;
  const shared = new Set<string>();
  for (const [source, target] of paths) {
    // An import writes only inside Atlas's folder: the user's own notes elsewhere are read, never replaced.
    const isOutsideAtlas = !target.startsWith(`${ATLAS_VTT_DIR}/`);
    // Artwork this collection installed stops being its own while another collection's asset uses it, for example one the user moved.
    const isSharedArtwork = !target.startsWith(collectionPrefix) && exists(target)
      && (record?.files[source] ? usedElsewhere.has(target) : !isOwnArtwork(target));
    if (isOutsideAtlas || isSharedArtwork) shared.add(source);
  }
  const rewrites = new Map<string, string>();
  for (const [source, target] of [...paths, ...assetIds]) {
    if (source !== target) rewrites.set(source, target);
  }
  const targets: ImportTargets = {
    collectionId, paths, assetIds, rewrites, shared, skipped: [],
    targetOf: (bundlePath) => paths.get(bundlePath) ?? record?.files[bundlePath]?.target,
    localIdOf: (bundleId) => assetIds.get(bundleId) ?? record?.assets[bundleId]?.localId ?? bundleId,
  };
  targets.skipped = unsafeAssets(manifest.assets, targets, recordTargets ?? new Set());
  return targets;
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
  const skipped = new Set(targets.skipped.map((asset) => asset.bundleId));
  const onlyUsedBySkipped = (file: BundleFile): boolean => file.owners !== undefined && file.owners.length > 0 && file.owners.every((owner) => skipped.has(owner));

  const bundledPaths = new Set(manifest.files.map((file) => file.vaultPath));
  // A file the bundle now keeps under another name, on a path the record already knows, is that same file moved.
  const movedFrom = new Map<string, string>();
  for (const [path, installed] of Object.entries(record?.files ?? {})) {
    if (!bundledPaths.has(path)) movedFrom.set(installed.target, path);
  }
  const moved = new Set<string>();

  for (const file of manifest.files) {
    if (targets.shared.has(file.vaultPath) || onlyUsedBySkipped(file)) continue;
    const target = targets.paths.get(file.vaultPath)!;
    const previousPath = record?.files[file.vaultPath] ? undefined : movedFrom.get(target);
    if (previousPath) moved.add(previousPath);
    const theirs = sourceHashes.get(file.vaultPath) ?? null;
    let theirsInstalled = theirs ?? undefined;
    const entry = zip.file(zipPathFor(file.vaultPath));
    if (theirs !== null && entry && mayRewrite(file, targets.rewrites)) {
      theirsInstalled = await sha256(rewriteContent(file, await entry.async('arraybuffer'), targets.rewrites));
    }
    items.push({
      key: `file:${file.vaultPath}`, kind: 'file', unit: fileUnit(file),
      theirs, base: record?.files[file.vaultPath] ?? (previousPath ? record?.files[previousPath] : undefined) ?? null,
      mine: await vaultFileHash(app, target), theirsInstalled,
    });
  }
  for (const [path, installed] of Object.entries(record?.files ?? {})) {
    if (moved.has(path)) continue;
    // Only the collection's own folder is the import's to clean up: shared artwork and the user's notes stay.
    if (bundledPaths.has(path) || !installed.target.startsWith(`${COLLECTIONS_DIR}/${targets.collectionId}/`)) continue;
    items.push({ key: `file:${path}`, kind: 'file', unit: installed.unit ?? `file:${path}`, theirs: null, base: installed, mine: await vaultFileHash(app, installed.target) });
  }

  for (const asset of manifest.assets) {
    if (skipped.has(asset.id)) continue;
    const localId = targets.assetIds.get(asset.id)!;
    const local = await ownAsset(assets, existing, localId);
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
    const local = await ownAsset(assets, existing, installed.localId);
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
