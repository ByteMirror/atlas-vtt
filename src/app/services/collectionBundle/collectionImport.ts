import type { App } from 'obsidian';
import type { Asset, AssetService, CollectionMetadata } from '../AssetService';
import { zipPathFor } from './bundleFormat';
import { rewriteContent } from './bundleContent';
import { reportFileStep, type BundleProgressListener } from './bundleProgress';
import { openBundle, type OpenedBundle } from './bundleReader';
import { gatherImportInputs, installedAsset, planTargets, type ImportTargets } from './importInputs';
import { ImportJournal, saveOpenMaps } from './importJournal';
import { planImport, resolvePlan, type ImportAction, type ImportPlan, type Resolution } from './importPlan';
import { buildReview, type ImportReview } from './importReview';
import { COLLECTION_FIELDS, readInstallRecord, writeInstallRecord, type CollectionField, type InstallRecord } from './installRecord';

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

interface ImportContext {
  bundle: OpenedBundle;
  existing: CollectionMetadata | null;
  record: InstallRecord | null;
  targets: ImportTargets;
  plan: ImportPlan;
}

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
  // Compare against what the user sees: open maps may hold unsaved changes.
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

const idOf = (key: string): string => key.slice(key.indexOf(':') + 1);

async function applyImport(
  app: App,
  assets: AssetService,
  context: ImportContext,
  decision: ImportDecision,
  onProgress: BundleProgressListener,
): Promise<CollectionImportResult> {
  const { bundle: { manifest, zip }, existing, targets, plan } = context;
  const actions = resolvePlan(plan, decision.resolutions ?? new Map());
  const items = plan.units.flatMap((unit) => unit.items);
  const name = (existing ? null : decision.name?.trim()) || manifest.collection.name;
  if (!existing && await assets.isCollectionNameTaken(name)) throw new Error(`A collection named "${name}" already exists. Choose another name.`);

  const journal = new ImportJournal(app, targets.collectionId);
  const filesByPath = new Map(manifest.files.map((file) => [file.vaultPath, file]));
  const assetsById = new Map(manifest.assets.map((asset) => [asset.id, asset]));
  let written = 0;
  let removed = 0;
  let collection: CollectionMetadata;
  try {
    const fileItems = items.filter((item) => item.kind === 'file' && actions.has(item.key));
    for (const [index, item] of fileItems.entries()) {
      reportFileStep(onProgress, 'Writing', index, fileItems.length, 0, 0.9);
      const bundlePath = idOf(item.key);
      const target = targets.targetOf(bundlePath);
      if (!target) continue;
      if (actions.get(item.key) === 'remove') {
        await journal.remove(target);
        removed += 1;
        continue;
      }
      const file = filesByPath.get(bundlePath)!;
      await journal.write(target, rewriteContent(file, await zip.file(zipPathFor(bundlePath))!.async('arraybuffer'), targets.rewrites));
      written += 1;
    }

    onProgress({ message: 'Registering assets…', fraction: 0.95 });
    collection = await mergedCollection(assets, context, actions, name);
    const upsert: Asset[] = [];
    const remove: string[] = [];
    for (const item of items.filter((entry) => entry.kind === 'asset' && actions.has(entry.key))) {
      const bundleId = idOf(item.key);
      if (actions.get(item.key) === 'remove') remove.push(targets.localIdOf(bundleId));
      else upsert.push(installedAsset(assetsById.get(bundleId)!, targets));
    }
    await assets.commitCollectionImport({ collectionId: targets.collectionId, collection, upsert, remove });
  } catch (error) {
    const unrestored = await journal.rollback();
    const reason = (error instanceof Error ? error.message : String(error)).replace(/\.$/, '');
    const note = unrestored.length > 0 ? ` ${unrestored.length} files could not be restored; their previous versions are in ${journal.backupFolder}.` : ' Nothing was changed.';
    throw new Error(`The import failed: ${reason}.${note}`);
  }

  try {
    await writeInstallRecord(app, nextInstallRecord(context, actions, collection));
  } catch (error) {
    console.error('[collectionImport] Could not record the install:', error);
  }
  onProgress({ message: 'Done', fraction: 1 });
  return {
    collectionName: collection.name,
    version: manifest.collection.version,
    created: !existing,
    written,
    removed,
    keptLocal: plan.units.filter((unit) => (unit.status === 'kept' || unit.status === 'conflict') && !unit.items.some((item) => actions.has(item.key))).length,
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

/**
 * What the vault now holds from the bundle: every item the bundle carries is
 * recorded as the bundle's version installed. An item the user kept in their
 * own version therefore still differs from `installed`, so a later update never
 * overwrites it silently, and re-importing this bundle does not ask again.
 * Unchanged items keep their earlier record, including its exact bytes.
 */
function nextInstallRecord({ bundle: { manifest }, targets, plan }: ImportContext, actions: ReadonlyMap<string, ImportAction>, collection: CollectionMetadata): InstallRecord {
  const next: InstallRecord = {
    uid: collection.uid, collectionId: targets.collectionId, sourceCollectionId: manifest.collection.id, version: manifest.collection.version,
    releasedAt: manifest.exportedAt, installedAt: Date.now(), files: {}, assets: {}, fields: {},
  };
  for (const unit of plan.units) {
    for (const item of unit.items) {
      if (item.theirs === null || actions.get(item.key) === 'remove') continue;
      const keepsRecord = !actions.has(item.key) && item.base?.source === item.theirs;
      const entry = keepsRecord && item.base ? item.base : { source: item.theirs, installed: item.theirsInstalled ?? item.theirs };
      const id = idOf(item.key);
      if (item.kind === 'file') next.files[id] = { ...entry, target: targets.targetOf(id)!, unit: unit.key };
      else if (item.kind === 'asset') next.assets[id] = { ...entry, localId: targets.localIdOf(id) };
      else next.fields[id as CollectionField] = entry;
    }
  }
  return next;
}
