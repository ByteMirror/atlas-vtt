import { TFile, type App } from 'obsidian';
import { COLLECTIONS_DIR, type Asset, type AssetService, type CollectionMetadata } from '../AssetService';
import { zipPathFor, type BundleFile } from './bundleFormat';
import { rewriteContent } from './bundleContent';
import { openBundle, type OpenedBundle } from './bundleReader';
import type { BundleProgressListener } from './collectionExport';
import { assetFingerprint, fieldFingerprint } from './fingerprints';
import { sha256 } from './hashing';
import { gatherImportInputs, installedAsset, planTargets, type ImportTargets } from './importInputs';
import { ImportJournal, saveOpenMaps } from './importJournal';
import { planImport, resolvePlan, type ImportAction, type ImportPlan, type PlannedItem, type Resolution } from './importPlan';
import { buildReview, type ImportReview } from './importReview';
import { COLLECTION_FIELDS, readInstallRecord, writeInstallRecord, type InstallRecord, type InstalledItem } from './installRecord';

export interface ImportDecision {
  /** Name for a new collection; defaults to the bundle's, or the suggested free name when that is taken. */
  name?: string | undefined;
  /** Conflict unit → choice; unresolved conflicts keep the user's version. */
  resolutions?: ReadonlyMap<string, Resolution> | undefined;
  /** Re-applies the bundle over the user's changes too. */
  restore?: boolean | undefined;
}

export interface CollectionImportResult {
  collectionName: string;
  version: number;
  created: boolean;
  written: number;
  removed: number;
  /** Units where the user's version was kept. */
  keptLocal: number;
  backupCount: number;
  backupFolder: string;
}

/** A read and checked bundle, planned against the vault, waiting for the user's decision. */
export interface ImportSession {
  review: ImportReview;
  apply(decision: ImportDecision, onProgress?: BundleProgressListener): Promise<CollectionImportResult>;
}

/** Marks items the vault kept in its own version, so a later update never mistakes them for untouched. */
const KEPT_LOCAL: InstalledItem = { source: 'kept-local', installed: 'kept-local' };

/**
 * Reads a collection bundle, verifies it and compares it with the vault: a new
 * collection, or the three-way difference between the installed release, the
 * vault's copy and the bundle. Nothing is written until `apply`.
 */
export async function openCollectionImport(
  app: App,
  assets: AssetService,
  data: Blob,
  onProgress: BundleProgressListener = () => undefined,
): Promise<ImportSession> {
  const bundle = await openBundle(data, onProgress);
  const { manifest } = bundle;
  const existing = await assets.findCollectionByUid(manifest.collection.uid);
  const record = existing ? await readInstallRecord(app, existing.uid) : null;
  const nameTaken = await assets.isCollectionNameTaken(manifest.collection.name, existing?.id);
  const suggestedName = !existing && nameTaken ? await assets.freeCollectionName(manifest.collection.name) : undefined;
  const collectionId = existing?.id ?? await assets.freeCollectionIdFor(manifest.collection.name);

  onProgress({ message: 'Comparing with your vault…', fraction: 0.6 });
  const targets = await planTargets(app, assets, bundle, collectionId, record);
  await saveOpenMaps(app, new Set([...targets.paths.values(), ...Object.values(record?.files ?? {}).map((file) => file.target)]));
  const { items, unitAssets } = await gatherImportInputs(app, assets, bundle, targets, existing, record);
  const plan = planImport(items);
  const restorePlan = planImport(items, { restore: true });
  onProgress({ message: 'Ready', fraction: 1 });

  return {
    review: buildReview(manifest, existing, record, plan, restorePlan, unitAssets, suggestedName),
    apply: (decision, progress = () => undefined) =>
      applyImport(app, assets, { bundle, existing, record, targets, plan: decision.restore ? restorePlan : plan }, decision, progress),
  };
}

interface ImportContext {
  bundle: OpenedBundle;
  existing: CollectionMetadata | null;
  record: InstallRecord | null;
  targets: ImportTargets;
  plan: ImportPlan;
}

const keyOf = (key: string): string => key.slice(key.indexOf(':') + 1);

async function applyImport(
  app: App,
  assets: AssetService,
  context: ImportContext,
  decision: ImportDecision,
  onProgress: BundleProgressListener,
): Promise<CollectionImportResult> {
  const { bundle, existing, record, targets, plan } = context;
  const { manifest, zip } = bundle;
  const actions = resolvePlan(plan, decision.resolutions ?? new Map());
  const items = plan.units.flatMap((unit) => unit.items);
  const name = (existing ? null : decision.name?.trim()) || manifest.collection.name;
  if (!existing && await assets.isCollectionNameTaken(name)) throw new Error(`A collection named "${name}" already exists. Choose another name.`);

  const journal = new ImportJournal(app, targets.collectionId);
  const filesByPath = new Map(manifest.files.map((file) => [file.vaultPath, file]));
  const written: BundleFile[] = [];
  let removed = 0;
  let collection: CollectionMetadata;
  const upsert: Asset[] = [];
  try {
    const fileItems = items.filter((item) => item.kind === 'file' && actions.has(item.key));
    for (const [index, item] of fileItems.entries()) {
      onProgress({ message: `Writing ${index + 1} of ${fileItems.length} files…`, fraction: (index / fileItems.length) * 0.9 });
      const bundlePath = keyOf(item.key);
      const target = targets.paths.get(bundlePath) ?? record?.files[bundlePath]?.target;
      if (!target) continue;
      if (actions.get(item.key) === 'remove') {
        await journal.remove(target);
        removed += 1;
        continue;
      }
      const file = filesByPath.get(bundlePath)!;
      await journal.write(target, rewriteContent(file, await zip.file(zipPathFor(bundlePath))!.async('arraybuffer'), targets.rewrites));
      written.push(file);
    }
    for (const file of written) await relinkStatblockImage(app, file, targets);

    onProgress({ message: 'Registering assets…', fraction: 0.95 });
    collection = await mergedCollection(assets, context, actions, name);
    const remove: string[] = [];
    for (const item of items.filter((entry) => entry.kind === 'asset')) {
      const action = actions.get(item.key);
      const bundleId = keyOf(item.key);
      if (action === 'remove') remove.push(record?.assets[bundleId]?.localId ?? bundleId);
      if (action === 'write') upsert.push(installedAsset(manifest.assets.find((asset) => asset.id === bundleId)!, targets));
    }
    await assets.commitCollectionImport({ collectionId: targets.collectionId, collection, upsert, remove });
  } catch (error) {
    const unrestored = await journal.rollback();
    const reason = error instanceof Error ? error.message : String(error);
    const note = unrestored.length > 0 ? ` ${unrestored.length} files could not be restored; their previous versions are in ${journal.backupFolder}.` : ' Nothing was changed.';
    throw new Error(`The import failed: ${reason}.${note}`);
  }

  try {
    await writeInstallRecord(app, await nextInstallRecord(app, context, actions, collection, upsert));
  } catch (error) {
    console.error('[collectionImport] Could not record the install:', error);
  }
  onProgress({ message: 'Done', fraction: 1 });
  return {
    collectionName: collection.name,
    version: manifest.collection.version,
    created: !existing,
    written: written.length,
    removed,
    keptLocal: plan.units.filter((unit) => unit.status === 'kept' || (unit.status === 'conflict' && decision.resolutions?.get(unit.key) !== 'theirs')).length,
    backupCount: journal.backupCount,
    backupFolder: journal.backupFolder,
  };
}

/** The collection record after the import: release identity from the bundle, each field from whichever side won. */
async function mergedCollection(assets: AssetService, { bundle, existing, targets }: ImportContext, actions: ReadonlyMap<string, ImportAction>, name: string): Promise<CollectionMetadata> {
  const theirs = bundle.manifest.collection;
  const now = Date.now();
  const merged: CollectionMetadata = {
    ...(existing ?? theirs),
    id: targets.collectionId,
    uid: theirs.uid,
    version: theirs.version,
    releasedAt: bundle.manifest.exportedAt,
    createdAt: existing?.createdAt ?? now,
    modifiedAt: now,
  };
  for (const key of ['publisherId', 'author'] as const) {
    if (theirs[key] === undefined) delete merged[key];
    else merged[key] = theirs[key];
  }
  if (!existing) return { ...merged, name };
  for (const field of COLLECTION_FIELDS) {
    if (actions.get(`field:${field}`) !== 'write') continue;
    if (theirs[field] === undefined) delete merged[field];
    else Object.assign(merged, { [field]: theirs[field] });
  }
  // The update's name may belong to another collection here; the copy then keeps its own.
  if (await assets.isCollectionNameTaken(merged.name, targets.collectionId)) merged.name = existing.name;
  return merged;
}

/** Statblock notes name their artwork in frontmatter; point copies the import made at where the artwork now lives. */
async function relinkStatblockImage(app: App, file: BundleFile, targets: ImportTargets): Promise<void> {
  const target = targets.paths.get(file.vaultPath);
  const imagePath = file.statblockImage && targets.paths.get(file.statblockImage.path);
  if (!file.statblockImage || !target?.startsWith(`${COLLECTIONS_DIR}/${targets.collectionId}/`) || !imagePath || imagePath === file.statblockImage.path) return;
  const note = app.vault.getAbstractFileByPath(target);
  if (!(note instanceof TFile)) return;
  const { key } = file.statblockImage;
  await app.fileManager.processFrontMatter(note, (frontmatter: Record<string, unknown>) => {
    frontmatter[key] = imagePath;
  });
}

/**
 * What the vault now holds from the bundle. Written items take the bundle's
 * fingerprint and the vault's result; items that kept the user's version keep
 * their previous baseline, so the next update still sees them as changed.
 */
async function nextInstallRecord(
  app: App,
  { bundle, record, targets, plan }: ImportContext,
  actions: ReadonlyMap<string, ImportAction>,
  collection: CollectionMetadata,
  upsert: readonly Asset[],
): Promise<InstallRecord> {
  const { manifest } = bundle;
  const next: InstallRecord = {
    uid: collection.uid, collectionId: targets.collectionId, sourceCollectionId: manifest.collection.id, version: manifest.collection.version,
    releasedAt: manifest.exportedAt, installedAt: Date.now(), files: {}, assets: {}, fields: {},
  };
  const carried = (item: PlannedItem): InstalledItem | null => {
    if (actions.get(item.key) === 'remove') return null;
    if (item.theirs !== null && item.theirsInstalled !== undefined && item.mine === item.theirsInstalled) return { source: item.theirs, installed: item.mine };
    if (item.base) return item.base;
    return item.theirs === null ? null : KEPT_LOCAL;
  };
  const upserted = new Map(upsert.map((asset) => [asset.id, asset]));
  for (const unit of plan.units) {
    for (const item of unit.items) {
      const id = keyOf(item.key);
      const isWritten = actions.get(item.key) === 'write' && item.theirs !== null;
      if (item.kind === 'file') {
        const target = targets.paths.get(id) ?? record?.files[id]?.target;
        const file = app.vault.getAbstractFileByPath(target ?? '');
        const entry = isWritten && file instanceof TFile ? { source: item.theirs!, installed: await sha256(await app.vault.readBinary(file)) } : carried(item);
        if (entry && target) next.files[id] = { source: entry.source, installed: entry.installed, target, unit: unit.key };
      } else if (item.kind === 'asset') {
        const localId = targets.assetIds.get(id) ?? record?.assets[id]?.localId ?? id;
        const asset = upserted.get(localId);
        const entry = isWritten && asset ? { source: item.theirs!, installed: await assetFingerprint(asset) } : carried(item);
        if (entry) next.assets[id] = { ...entry, localId };
      } else {
        const field = id as typeof COLLECTION_FIELDS[number];
        const entry = isWritten ? { source: item.theirs!, installed: await fieldFingerprint(collection, field) } : carried(item);
        if (entry) next.fields[field] = entry;
      }
    }
  }
  return next;
}
