import type { App } from 'obsidian';
import type { Asset, AssetService, CollectionMetadata } from '../AssetService';
import { zipPathFor } from './bundleFormat';
import { rewriteContent } from './bundleContent';
import { reportFileStep, type BundleProgressListener } from './bundleProgress';
import { openBundle, type OpenedBundle } from './bundleReader';
import { assetFingerprint, fieldFingerprint } from './fingerprints';
import { gatherImportInputs, installedAsset, ownAsset, planTargets, referencedStrings, vaultFileHash, type ImportTargets } from './importInputs';
import { ImportJournal, saveOpenMaps } from './importJournal';
import { planImport, resolvePlan, type ImportAction, type ImportPlan, type PlannedItem, type Resolution } from './importPlan';
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
    review: buildReview(manifest, await assets.getVaultId(), existing, record, plan, restorePlan, unitAssets, suggestedName, targets.skipped),
    apply: (decision, progress = () => undefined) =>
      applyImport(app, assets, { bundle, existing, record, targets, plan: decision.restore ? restorePlan : plan }, decision, progress),
  };
}

const idOf = (key: string): string => key.slice(key.indexOf(':') + 1);

/**
 * Everything that may still name a file after the import: the paths the bundle
 * places, every asset in the vault as it will be, and the maps that stay (tokens
 * placed on the user's own maps name their artwork). A file any of them names is
 * never removed.
 */
async function pathsInUse(app: App, assets: AssetService, targets: ImportTargets, upsert: readonly Asset[], remove: readonly string[], removals: ReadonlySet<string>): Promise<Set<string>> {
  const replaced = new Set([...remove, ...upsert.map((asset) => asset.id)]);
  const staying = (await assets.getAssets()).filter((asset) => !replaced.has(asset.id));
  const inUse = referencedStrings([...staying, ...upsert], new Set(targets.paths.values()));
  for (const file of app.vault.getFiles()) {
    if (file.extension !== 'atlasmap' || removals.has(file.path)) continue;
    try {
      referencedStrings([JSON.parse(await app.vault.read(file))], inUse);
    } catch {
      // An unreadable map names nothing we could protect.
    }
  }
  return inUse;
}

/** What the vault holds now for `item`, fingerprinted like the review did. */
async function currentFingerprint(app: App, assets: AssetService, { existing, targets }: ImportContext, item: PlannedItem): Promise<string | null> {
  const id = idOf(item.key);
  if (item.kind === 'file') return vaultFileHash(app, targets.targetOf(id)!);
  if (item.kind === 'asset') {
    const local = await ownAsset(assets, existing, targets.localIdOf(id));
    return local ? assetFingerprint(local) : null;
  }
  const collection = existing ? await assets.getCollection(existing.id) : null;
  return collection ? fieldFingerprint(collection, id as CollectionField) : null;
}

/**
 * Refuses to apply a plan to a vault that changed after the review: an edit made
 * while the dialog was open would otherwise be replaced without being asked about.
 * Collection fields are all checked, since the merged record starts from the reviewed one.
 */
async function assertUnchangedSinceReview(app: App, assets: AssetService, context: ImportContext, actions: ReadonlyMap<string, ImportAction>): Promise<void> {
  const items = context.plan.units.flatMap((unit) => unit.items).filter((item) => item.kind === 'field' || actions.has(item.key));
  const files = items.filter((item) => item.kind === 'file').map((item) => context.targets.targetOf(idOf(item.key))!);
  await saveOpenMaps(app, new Set(files));
  for (const item of items) {
    if (await currentFingerprint(app, assets, context, item) !== item.mine) {
      throw new Error('Your vault changed since the review. Import the file again to see the current changes');
    }
  }
}

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
    await assertUnchangedSinceReview(app, assets, context, actions);
    const upsert: Asset[] = [];
    const remove: string[] = [];
    for (const item of items.filter((entry) => entry.kind === 'asset' && actions.has(entry.key))) {
      const bundleId = idOf(item.key);
      if (actions.get(item.key) === 'remove') remove.push(targets.localIdOf(bundleId));
      else upsert.push(installedAsset(assetsById.get(bundleId)!, targets));
    }
    const fileItems = items.filter((item) => item.kind === 'file' && actions.has(item.key));
    const writes = fileItems.filter((item) => actions.get(item.key) === 'write');
    const removals = fileItems.filter((item) => actions.get(item.key) === 'remove');
    for (const [index, item] of writes.entries()) {
      reportFileStep(onProgress, 'Writing', index, fileItems.length, 0, 0.9);
      const bundlePath = idOf(item.key);
      const target = targets.targetOf(bundlePath);
      if (!target) continue;
      const file = filesByPath.get(bundlePath)!;
      await journal.write(target, rewriteContent(file, await zip.file(zipPathFor(bundlePath))!.async('arraybuffer'), targets.rewrites));
      written += 1;
    }
    // Removals come last, checked against the vault as the writes left it.
    const removalTargets = new Set(removals.map((item) => targets.targetOf(idOf(item.key))!));
    const inUse = removalTargets.size > 0 ? await pathsInUse(app, assets, targets, upsert, remove, removalTargets) : new Set<string>();
    for (const [index, item] of removals.entries()) {
      reportFileStep(onProgress, 'Cleaning up', writes.length + index, fileItems.length, 0, 0.9);
      const target = targets.targetOf(idOf(item.key));
      if (!target || inUse.has(target)) continue;
      await journal.remove(target);
      removed += 1;
    }

    onProgress({ message: 'Registering assets…', fraction: 0.95 });
    collection = await mergedCollection(assets, context, actions, name);
    await assets.commitCollectionImport({ collectionId: targets.collectionId, collection, upsert, remove });
  } catch (error) {
    const unrestored = await journal.rollback();
    const reason = (error instanceof Error ? error.message : String(error)).replace(/\.$/, '');
    const note = unrestored.length > 0 ? ` ${unrestored.length} files could not be restored; their previous versions are in ${journal.backupFolder}.` : ' Nothing was changed.';
    throw new Error(`The import failed: ${reason}.${note}`);
  }

  try {
    await writeInstallRecord(app, await nextInstallRecord(context, actions, collection));
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
  // A collection keeps its publisher: a bundle cannot hand someone else's collection over to another publisher.
  const publisherId = existing?.publisherId ?? theirs.publisherId;
  if (publisherId === undefined) delete merged.publisherId;
  else merged.publisherId = publisherId;
  // Only a release speaks for the author; a shared copy keeps what the vault had.
  if (bundle.manifest.release?.kind !== 'share') {
    if (theirs.author === undefined) delete merged.author;
    else merged.author = theirs.author;
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
 * Unchanged items keep their earlier record, including its exact bytes, and
 * collection fields record the value actually applied (a name the user chose
 * because the bundle's was taken counts as theirs).
 */
async function nextInstallRecord({ bundle: { manifest }, record, targets, plan }: ImportContext, actions: ReadonlyMap<string, ImportAction>, collection: CollectionMetadata): Promise<InstallRecord> {
  const next: InstallRecord = {
    uid: collection.uid, collectionId: targets.collectionId, sourceCollectionId: manifest.collection.id, sourceName: manifest.collection.name,
    version: manifest.collection.version, releasedAt: manifest.exportedAt, installedAt: Date.now(), files: {}, assets: {}, fields: {},
  };
  // Files the import only reads (the user's own notes) keep their record, so a later import still recognises them.
  for (const path of targets.shared) {
    const installed = record?.files[path];
    if (installed) next.files[path] = installed;
  }
  for (const unit of plan.units) {
    for (const item of unit.items) {
      if (item.theirs === null || actions.get(item.key) === 'remove') continue;
      // Never installed and not in the vault: recording it would make a later update say the user deleted it.
      if (!actions.has(item.key) && !item.base && item.mine === null) continue;
      const keepsRecord = !actions.has(item.key) && item.base?.source === item.theirs;
      const entry = keepsRecord && item.base ? item.base : { source: item.theirs, installed: item.theirsInstalled ?? item.theirs };
      const id = idOf(item.key);
      if (item.kind === 'file') next.files[id] = { ...entry, target: targets.targetOf(id)!, unit: unit.key };
      else if (item.kind === 'asset') next.assets[id] = { ...entry, localId: targets.localIdOf(id) };
      else if (actions.get(item.key) === 'write') next.fields[id as CollectionField] = { source: item.theirs, installed: await fieldFingerprint(collection, id as CollectionField) };
      else next.fields[id as CollectionField] = entry;
    }
  }
  return next;
}
