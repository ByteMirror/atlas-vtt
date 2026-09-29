import { wasTokenRegistrationSaved } from './assetRegistrationRecovery';
import { SettingsService } from './SettingsService';
import { App, Notice, TFile, TFolder } from 'obsidian';
import { ensureAdapterFolder } from '../plugin/vaultFolders';
import type { TokenStateSnapshot } from '../types';
import type { CellCoord, EncounterFormation } from '../encounters/encounterFormation';
import { getDataFilePath } from '../utils/dataFileMigration';
import { SerialLock } from '../utils/serialLock';
import { runInBackground } from '../utils/backgroundTask';
import { preserveUnreadableMetadata, readStoredMetadata, type StoredMetadata } from './assetMetadataFile';
import { collectionNameKey, uniqueCollectionName } from './collectionNaming';
import { collectionFolderName, collectionFolderPath, collectionIdOfFolder, collectionNameProblem, COLLECTIONS_DIR, GLOBAL_ASSETS_DIR, ATLAS_VTT_DIR } from './assetPaths';
import { planFolderNameFixes } from './collectionFolderNames';
import { moveInstallRecord } from './collectionBundle/installRecord';
import { createCollectionRecord, defaultCollectionIdOf, forgetCollection, INITIAL_COLLECTION_ID, moveCollectionRecord, numberedCollectionName, prettifyIdentifier } from './collectionRecords';
import { assetFilePath, groupTokenRefs } from './vault-sync/assetFiles';
import { reconcileIndex, type VaultReconciliation } from './vault-sync/reconcileIndex';
import { listVault, readVault } from './vault-sync/vaultListing';
import type { CollectionSettings } from '../types/collectionSettingsTypes';
import { isLegacyTokenRecord, isRecord, type LegacyAssetMetadata } from './assetMetadataGuards';
import { groupLegacyTags, hasAssetTag, tagGroupOf, tagKey, type TagGroup } from './tagGroups';

export interface BaseAsset {
  id: string;
  name: string;
  tags: string[];
  collection: string;
  /** Vault path for JSON-backed assets when stored in subfolders */
  filePath?: string;
  createdAt: number;
  modifiedAt: number;
}

export interface TokenAsset extends BaseAsset {
  /** False preserves the whole artwork without an Atlas frame. Defaults to true. */
  showRing?: boolean;
  type: 'token';
  imagePath: string;
  /** Default footprint of spawned tokens as the size multiplier from `tokenSizing.ts`; missing means 1×1. */
  size?: number;
  /** Small preview written by AssetThumbnailService; regenerated when missing. */
  thumbnailPath?: string;
  statblockPath?: string; // Optional link to statblock note
}

export interface MapAsset extends BaseAsset {
  type: 'map';
  mapFilePath: string;
  thumbnailPath?: string;
}

export interface NoteAsset extends BaseAsset {
  type: 'note';
  notePath: string;
}

/** Token reference stored inside encounter and player group assets. */
export interface GroupTokenRef {
  id: string;
  name: string;
  imagePath: string;
  x?: number;
  y?: number;
  statblockPath?: string;
  size?: number;
}

export interface EncounterTokenRef extends GroupTokenRef {
  /** Cell offset from the encounter's anchor token (see EncounterFormation). */
  cell?: CellCoord;
  /** Pitch-normalised world offset from the anchor token. */
  offset?: { x: number; y: number };
  /** Full token state at save time (HP, conditions, statblock link, ...). Restored verbatim on spawn. */
  state?: TokenStateSnapshot;
}

export type EncounterDifficulty = 'easy' | 'medium' | 'hard' | 'deadly';

// An asset's `data` is the payload written to its own JSON file. It is optional
// everywhere because metadata written by older versions may lack it.

export interface SceneAssetData {
  /** Vault path of the scene's .atlasmap file. */
  mapPath?: string;
}

export interface EncounterAssetData {
  tokens?: EncounterTokenRef[];
  difficulty?: EncounterDifficulty;
  formation?: EncounterFormation;
  description?: string;
}

export interface PlayerAssetData {
  tokens?: GroupTokenRef[];
  level?: number;
  class?: string;
}

export interface StatblockAsset extends BaseAsset {
  type: 'statblock';
  /** Opaque statblock JSON; Atlas never reads it. */
  data?: Record<string, unknown>;
}

export interface CharacterAsset extends BaseAsset {
  type: 'character';
  /** Opaque character JSON; Atlas never reads it. */
  data?: Record<string, unknown>;
}

export interface SceneAsset extends BaseAsset {
  type: 'scene';
  mapId?: string;
  data?: SceneAssetData;
}

export interface EncounterAsset extends BaseAsset {
  type: 'encounter';
  tokens: EncounterTokenRef[];
  /** Grid the token layout was captured on. Absent for encounters saved without positions. */
  formation?: EncounterFormation;
  difficulty?: EncounterDifficulty;
  thumbnailUrl?: string; // Generated thumbnail for the encounter
  data?: EncounterAssetData;
}

export interface PlayerAsset extends BaseAsset {
  type: 'player';
  tokens: GroupTokenRef[];
  level?: number;
  class?: string;
  thumbnailUrl?: string; // Generated thumbnail for the player group
  data?: PlayerAssetData;
}

export type Asset = TokenAsset | MapAsset | NoteAsset | StatblockAsset | CharacterAsset | SceneAsset | EncounterAsset | PlayerAsset;

export type AssetOfType<T extends Asset['type']> = Extract<Asset, { type: T }>;

type NewAssetOf<A> = A extends Asset ? Omit<A, 'id' | 'createdAt' | 'modifiedAt'> : never;
/** An asset before the service assigns its id and timestamps. */
export type NewAsset = NewAssetOf<Asset>;

type AssetUpdatesOf<A> = A extends Asset
  ? { [K in Exclude<keyof A, 'id' | 'createdAt' | 'type' | 'collection'>]?: A[K] | undefined }
  : never;
/** Fields to change on an asset; an explicit `undefined` removes the field. Moving to another collection is `transferAssets`. */
export type AssetUpdates = AssetUpdatesOf<Asset>;

export type GroupAsset = EncounterAsset | PlayerAsset;

export { groupTokenRefs };
export { ATLAS_VTT_DIR, COLLECTIONS_DIR, GLOBAL_ASSETS_DIR };
export type { VaultReconciliation };

export interface TagMetadata {
  id: string;
  name: string;
  /** Missing on tags saved before tag groups existed; `migrateTags` fills it in. */
  group?: TagGroup;
  color?: string;
  icon?: string;
}

export interface CollectionMetadata {
  id: string;
  /** Globally unique identifier — survives export/import */
  uid: string;
  /** Release number. Only the publisher raises it, when exporting a release. */
  version: number;
  /** Vault that created the collection and publishes its releases; missing on collections from before publishing existed. */
  publisherId?: string;
  /** Author shown to people who install the collection. */
  author?: string;
  /** When the installed or last exported release was made. */
  releasedAt?: number;
  /** Vault path of the cover image shown when the collection is exported or imported. */
  coverPath?: string;
  name: string;
  description?: string;
  tags: Record<string, TagMetadata>; // Collection-specific tags
  /** Per-collection settings (game system, conditions, grid defaults, etc.) */
  settings: CollectionSettings;
  createdAt: number;
  modifiedAt: number;
}

export interface AssetMetadata {
  collections: Record<string, CollectionMetadata>;
  assets: Record<string, Asset>;
  version: number;
  /** Identifies this vault as the publisher of the collections it creates. */
  vaultId?: string;
  /** The collection new content goes to when none is chosen; read it through `defaultCollectionIdOf`. */
  defaultCollectionId?: string;
}

/** What an import writes into the asset index, in one save. */
export interface CollectionImportCommit {
  collectionId: string;
  collection: CollectionMetadata;
  /** Asset records to add or replace, already pointing at their files in this vault. */
  upsert: readonly Asset[];
  /** Ids of asset records to drop; their files are handled by the import. */
  remove: readonly string[];
}

/** What moving or copying assets into a collection writes into the asset index, in one save. */
export interface AssetTransferCommit {
  collectionId: string;
  /** Asset records to add or replace, already pointing at their files in the target collection. */
  records: readonly Asset[];
  /** Tags the records carry that the target collection registers too. */
  tags: ReadonlyArray<TagMetadata & { group: TagGroup }>;
}

const ASSETS_METADATA_PATH = getDataFilePath(`${ATLAS_VTT_DIR}/assets-metadata.json`);
const LEGACY_ASSETS_METADATA_PATH = `${ATLAS_VTT_DIR}/assets-metadata.json`;
/** A sync tool may be rewriting the index; a few more reads ride that out. */
const METADATA_READ_OPTIONS = { retries: 3, retryDelayMs: 200 };

/** Tags are keyed by their lower-case, hyphenated name. */
const tagIdOf = (name: string): string => name.trim().toLowerCase().replace(/\s+/g, '-');

export class AssetService {
  private static instance: AssetService | null = null;
  private app: App;
  private metadata: AssetMetadata | null = null;
  private initialization: Promise<void> | null = null;
  /** Held by work that must not interleave with re-reading or checking the index, such as an import. */
  private readonly indexLock = new SerialLock();
  /** Metadata writes, in the order they were requested. */
  private readonly writes = new SerialLock();
  private saveCount = 0;
  /** Collections whose folder is being renamed to their name, so no check starts it twice. */
  private readonly folderRenames = new Set<string>();
  private readonly reconciledListeners = new Set<(result: VaultReconciliation) => void>();

  private constructor(app: App) {
    this.app = app;
  }

  static getInstance(app?: App): AssetService {
    if (!AssetService.instance) {
      if (!app) {
        throw new Error('AssetService must be initialized with an App instance');
      }
      AssetService.instance = new AssetService(app);
    }
    return AssetService.instance;
  }

  /** Creates the storage folders and loads the index once; later calls await the first run. */
  initialize(): Promise<void> {
    this.initialization ??= this.initializeStorage().catch((error: unknown) => {
      this.initialization = null;
      throw error;
    });
    return this.initialization;
  }

  private async initializeStorage(): Promise<void> {
    await this.ensureDirectory(ATLAS_VTT_DIR);
    await this.ensureDirectory(GLOBAL_ASSETS_DIR);
    await this.ensureDirectory(COLLECTIONS_DIR);
    await this.loadMetadata();
    await this.reconcileOnceVaultIsListed();
  }

  /**
   * Checks the index against the vault's files once Obsidian has listed them all;
   * before the layout is ready `getFiles()` can miss files that exist. Resolves
   * after the check when the layout is already ready, at once otherwise.
   */
  private reconcileOnceVaultIsListed(): Promise<void> {
    const reconciled = new Promise<void>((resolve) => {
      this.app.workspace.onLayoutReady(() => {
        resolve(this.reconcileWithVault().then(() => undefined, (error: unknown) => {
          console.error('[AssetService] Checking the index against the vault failed:', error);
        }));
      });
    });
    return this.app.workspace.layoutReady ? reconciled : Promise.resolve();
  }

  /**
   * Runs `task` while no refresh or vault check reads or rewrites the index. An
   * import holds it from its first file write to its commit, so nothing sees or
   * saves the half-written collection. `task` must not call `refreshMetadata`.
   */
  runExclusive<T>(task: () => Promise<T>): Promise<T> {
    return this.indexLock.run(task);
  }

  /**
   * The index is read from disk once and then served from memory; `refreshMetadata`
   * re-reads it when files may have changed outside the service.
   */
  private async ensureLoaded(): Promise<void> {
    if (!this.metadata) {
      await this.loadMetadata();
    }
  }

  private async ensureDirectory(path: string): Promise<void> {
    try {
      const folder = this.app.vault.getAbstractFileByPath(path);
      if (!folder) {
        // Only create if it doesn't exist
        await this.app.vault.createFolder(path);
      }
    } catch (e) {
      // Silently handle "folder already exists" errors
      if (e instanceof Error && !e.message.includes('already exists')) {
        console.error('[AssetService] Error creating folder:', path, e);
      }
    }
  }

  private async ensureDirectoryViaAdapter(path: string): Promise<void> {
    await ensureAdapterFolder(this.app, path);
  }

  private async ensureCollectionStructure(collectionName: string): Promise<void> {
    const collectionPath = `${COLLECTIONS_DIR}/${collectionName}`;
    await this.ensureDirectory(collectionPath);
    
    // Ensure all subdirectories exist ('assets' is global, not per collection)
    const subdirs = ['tokens', 'notes', 'statblocks', 'maps', 'characters', 'scenes', 'encounters', 'players'];
    for (const subdir of subdirs) {
      const subdirPath = `${collectionPath}/${subdir}`;
      await this.ensureDirectory(subdirPath);
    }
  }

  private getAssetPath(asset: Asset): string {
    return assetFilePath(asset);
  }

  private readStoredMetadata(): Promise<StoredMetadata> {
    return readStoredMetadata(this.app.vault.adapter, [ASSETS_METADATA_PATH, LEGACY_ASSETS_METADATA_PATH], METADATA_READ_OPTIONS);
  }

  private async loadMetadata(): Promise<void> {
    const stored = await this.readStoredMetadata();
    switch (stored.kind) {
      case 'missing':
        this.metadata = await this.createDefaultMetadata();
        await this.saveMetadata();
        break;
      case 'legacy':
        await this.migrateFromOldFormat(stored.metadata);
        break;
      case 'current':
        this.metadata = stored.metadata;
        await this.migrateTags();
        break;
      case 'unreadable':
        await this.startOverFromUnreadableMetadata(stored);
        break;
    }

    // Ensure all collections have uid, version, and settings fields
    await this.migrateCollectionFields();
  }

  /**
   * Keeps a copy of an index that cannot be read, then starts from an empty one
   * that the startup check against the vault fills from the collection files.
   * Without a copy the file is left alone and nothing is saved over it.
   */
  private async startOverFromUnreadableMetadata(stored: Extract<StoredMetadata, { kind: 'unreadable' }>): Promise<void> {
    console.error('[AssetService] The asset index could not be read:', stored.error);
    let copyPath: string;
    try {
      copyPath = await preserveUnreadableMetadata(this.app.vault.adapter, stored.path);
    } catch (error) {
      new Notice(`Atlas VTT could not read its asset index (${stored.path}) and left it untouched. Restart Obsidian to try again.`, 0);
      throw error;
    }
    new Notice(`Atlas VTT could not read its asset index and is rebuilding it from your collection files. The unreadable file was kept as ${copyPath}.`, 0);
    this.metadata = await this.createDefaultMetadata();
  }

  /**
   * Replaces the in-memory index with the one on disk. Waits for pending saves
   * and reads again when a save lands meanwhile, so it never goes back to an
   * older index; a file that cannot be read leaves the index in memory as it is.
   */
  private async rereadMetadata(): Promise<void> {
    for (;;) {
      await this.writes.idle();
      const savesBefore = this.saveCount;
      const stored = await this.readStoredMetadata();
      if (this.saveCount !== savesBefore) continue;
      if (stored.kind !== 'current') {
        console.error('[AssetService] Could not re-read the asset index; keeping the loaded one.', stored);
        return;
      }
      this.metadata = stored.metadata;
      await this.migrateTags();
      await this.migrateCollectionFields();
      return;
    }
  }

  private async createDefaultMetadata(): Promise<AssetMetadata> {
    return {
      collections: { [INITIAL_COLLECTION_ID]: createCollectionRecord(INITIAL_COLLECTION_ID) },
      defaultCollectionId: INITIAL_COLLECTION_ID,
      assets: {},
      version: 2
    };
  }

  /**
   * Ensures all collections have the uid, version, and settings fields.
   * Called at the end of loadMetadata() to migrate legacy collections.
   */
  private async migrateCollectionFields(): Promise<void> {
    if (!this.metadata) return;

    let needsSave = false;
    if (!this.metadata.vaultId) {
      this.metadata.vaultId = crypto.randomUUID();
      needsSave = true;
    }
    for (const collection of Object.values(this.metadata.collections)) {
      if (!collection.uid) {
        collection.uid = crypto.randomUUID();
        needsSave = true;
      }
      if (collection.version === undefined || collection.version === null) {
        collection.version = 1;
        needsSave = true;
      }
      if (!collection.settings) {
        collection.settings = { conditions: [] };
        needsSave = true;
      }
    }

    // Older imports could reuse a taken name; numbering them keeps every collection distinguishable.
    const takenNames: string[] = [];
    const defaultId = defaultCollectionIdOf(this.metadata);
    const defaultFirst = Object.values(this.metadata.collections)
      .sort((a, b) => Number(b.id === defaultId) - Number(a.id === defaultId));
    for (const collection of defaultFirst) {
      const stored = typeof collection.name === 'string' && collection.name.trim() ? collection.name : prettifyIdentifier(collection.id);
      const name = uniqueCollectionName(stored, takenNames);
      if (name !== collection.name) {
        collection.name = name;
        needsSave = true;
      }
      takenNames.push(name);
    }

    if (needsSave) {
      await this.saveMetadata();
    }
  }

  private async migrateFromOldFormat(oldMetadata: LegacyAssetMetadata): Promise<void> {
    this.metadata = await this.createDefaultMetadata();
    const now = Date.now();

    for (const [id, oldToken] of Object.entries(oldMetadata.tokens)) {
      if (!isLegacyTokenRecord(oldToken)) {
        console.warn(`[AssetService] Legacy token ${id} has no name or image path, not migrated`);
        continue;
      }

      // The image stays where it is (global assets folder).
      const createdAt = typeof oldToken.createdAt === 'number' ? oldToken.createdAt : now;
      this.metadata.assets[id] = {
        id,
        type: 'token',
        name: oldToken.name,
        imagePath: oldToken.imagePath,
        tags: Array.isArray(oldToken.tags) ? oldToken.tags.filter((tag): tag is string => typeof tag === 'string') : [],
        collection: defaultCollectionIdOf(this.metadata),
        createdAt,
        modifiedAt: typeof oldToken.modifiedAt === 'number' ? oldToken.modifiedAt : createdAt
      };
    }

    await this.saveMetadata();
  }

  /** Saves the index as it is now; saves reach the disk in the order they were made. */
  private saveMetadata(): Promise<void> {
    if (!this.metadata) return Promise.resolve();
    const content = JSON.stringify(this.metadata, null, 2);
    this.saveCount++;
    return this.writes.run(() => this.writeMetadataFile(content));
  }

  private async writeMetadataFile(content: string): Promise<void> {
    const oldPath = LEGACY_ASSETS_METADATA_PATH;
    const hasLegacyPath = await this.app.vault.adapter.exists(oldPath);
    const hasHiddenPath = await this.app.vault.adapter.exists(ASSETS_METADATA_PATH);
    const saveTargets = new Set<string>();

    // Prefer hidden metadata location, and create it when no legacy file exists.
    if (hasHiddenPath || !hasLegacyPath) {
      saveTargets.add(ASSETS_METADATA_PATH);
    }
    // Keep legacy metadata synchronized for backwards compatibility.
    if (hasLegacyPath) {
      saveTargets.add(oldPath);
    }

    for (const savePath of saveTargets) {
      const dir = savePath.substring(0, savePath.lastIndexOf('/'));
      await this.ensureDirectoryViaAdapter(dir);
      await this.app.vault.adapter.write(savePath, content);
    }
  }

  /**
   * Runs `rewrite` over both token lists of every encounter/player asset.
   * `rewrite` returns the new list, or null when it left the list untouched.
   */
  private rewriteGroupTokenRefs(rewrite: (tokens: GroupTokenRef[]) => GroupTokenRef[] | null): boolean {
    if (!this.metadata) {
      return false;
    }

    let metadataChanged = false;
    for (const asset of Object.values(this.metadata.assets)) {
      if (asset.type !== 'encounter' && asset.type !== 'player') {
        continue;
      }

      const group: { tokens: GroupTokenRef[]; data?: { tokens?: GroupTokenRef[] } } = asset;
      let assetChanged = false;

      if (Array.isArray(group.tokens)) {
        const next = rewrite(group.tokens);
        if (next) {
          group.tokens = next;
          assetChanged = true;
        }
      }

      if (group.data && Array.isArray(group.data.tokens)) {
        const next = rewrite(group.data.tokens);
        if (next) {
          group.data.tokens = next;
          assetChanged = true;
        }
      }

      if (assetChanged) {
        asset.modifiedAt = Date.now();
        metadataChanged = true;
      }
    }

    return metadataChanged;
  }

  private propagateTokenReferenceUpdate(token: TokenAsset): boolean {
    return this.rewriteGroupTokenRefs((tokens) => {
      let changed = false;
      const next = tokens.map((tokenRef) => {
        if (!tokenRef || tokenRef.id !== token.id) {
          return tokenRef;
        }

        const unchanged =
          tokenRef.name === token.name &&
          tokenRef.imagePath === token.imagePath &&
          tokenRef.statblockPath === token.statblockPath;
        if (unchanged) {
          return tokenRef;
        }

        const updatedRef: GroupTokenRef = { ...tokenRef, name: token.name, imagePath: token.imagePath };
        if (token.statblockPath !== undefined) {
          updatedRef.statblockPath = token.statblockPath;
        } else {
          delete updatedRef.statblockPath;
        }

        changed = true;
        return updatedRef;
      });

      return changed ? next : null;
    });
  }

  private removeTokenReferencesFromGroups(tokenId: string): boolean {
    return this.rewriteGroupTokenRefs((tokens) => {
      const next = tokens.filter((tokenRef) => tokenRef?.id !== tokenId);
      return next.length !== tokens.length ? next : null;
    });
  }

  private listGroups(): GroupAsset[] {
    return Object.values(this.metadata!.assets)
      .filter((asset): asset is GroupAsset => asset.type === 'encounter' || asset.type === 'player');
  }

  /** Encounters that contain any of the given token assets. */
  async getGroupsUsingTokens(tokenIds: readonly string[]): Promise<GroupAsset[]> {
    await this.ensureLoaded();
    const ids = new Set(tokenIds);
    return this.listGroups().filter((group) => groupTokenRefs(group).some((ref) => ids.has(ref.id)));
  }

  /** Deletes the given encounters if their token list is now empty. */
  private async deleteEmptiedGroups(groups: GroupAsset[]): Promise<void> {
    for (const group of groups) {
      if (groupTokenRefs(group).length === 0) await this.deleteAsset(group.id);
    }
  }

  // Collection management
  /** Creates a collection in a folder named like it; `name` must be a valid folder name no collection uses. */
  async createCollection(name: string, description?: string): Promise<CollectionMetadata> {
    await this.ensureLoaded();
    const id = this.assertCollectionFolderName(name);

    const collection: CollectionMetadata = { ...createCollectionRecord(id), publisherId: this.metadata!.vaultId! };
    if (description === undefined) delete collection.description;
    else collection.description = description;

    await this.ensureCollectionStructure(id);
    this.metadata!.collections[id] = collection;
    await this.saveMetadata();
    return collection;
  }

  async getCollections(): Promise<CollectionMetadata[]> {
    await this.ensureLoaded();

    return Object.values(this.metadata!.collections);
  }

  /** The collection new content goes to when none is chosen; it cannot be deleted. */
  getDefaultCollectionId(): string {
    return defaultCollectionIdOf(this.metadata);
  }

  /** The default collection of the loaded index, for code that has no service at hand. */
  static defaultCollectionId(): string {
    return defaultCollectionIdOf(AssetService.instance?.metadata ?? null);
  }

  /** Registers a record for a collection id that assets already point at. */
  private async ensureCollectionRecord(id: string): Promise<void> {
    if (this.metadata!.collections[id]) return;
    // The folder first: a vault check forgets records whose folder is missing.
    await this.ensureCollectionStructure(id);
    this.metadata!.collections[id] ??= createCollectionRecord(id);
    await this.saveMetadata();
  }

  /**
   * Renames a collection together with its folder, since a collection is named
   * like its folder. Every stored path into the folder follows, and the vault
   * rename event carries the new paths to open maps and map files. Returns the
   * collection as renamed.
   */
  async renameCollection(collectionId: string, name: string): Promise<CollectionMetadata> {
    await this.ensureLoaded();
    const collection = this.metadata!.collections[collectionId];
    if (!collection) throw new Error(`Collection ${collectionId} not found`);
    if (name.trim() === collectionId) return collection;
    const id = this.assertCollectionFolderName(name, collectionId);
    await this.moveCollectionFolder(collectionId, id);
    return this.metadata!.collections[id]!;
  }

  /** The trimmed `name` as a collection folder name; throws when it is invalid or taken by another collection. */
  private assertCollectionFolderName(name: string, exceptId?: string): string {
    const problem = collectionNameProblem(name);
    if (problem) throw new Error(problem);
    const id = name.trim();
    this.assertCollectionNameFree(id, exceptId);
    if (this.isCollectionFolderTaken(id, exceptId)) throw new Error(`A folder named "${id}" already exists in the collections folder`);
    return id;
  }

  /** Whether a folder other than `exceptId`'s in the collections folder has this name, compared without case like macOS and Windows do. */
  private isCollectionFolderTaken(id: string, exceptId?: string): boolean {
    const key = collectionNameKey(id);
    return (this.app.vault.getFolderByPath(COLLECTIONS_DIR)?.children ?? [])
      .some((child) => child.name !== exceptId && collectionNameKey(child.name) === key);
  }

  /**
   * Renames a collection's folder and moves its record along. Resolves once the
   * vault has renamed the folder; the vault's rename event may move the record
   * first, as for a folder renamed in Obsidian.
   */
  private async moveCollectionFolder(oldId: string, newId: string): Promise<void> {
    const folder = this.app.vault.getFolderByPath(collectionFolderPath(oldId));
    if (folder) await this.renameInVault(folder, collectionFolderPath(newId));
    if (!this.metadata!.collections[oldId]) return;
    await this.moveRecordWithInstall(oldId, newId);
    await this.saveMetadata();
  }

  /**
   * Renames through Obsidian, so links to the folder's notes follow. Obsidian
   * may first ask whether to update those links and only then settle its
   * promise; the rename itself is done once the vault reports it, so Atlas
   * never waits for that answer.
   */
  private renameInVault(folder: TFolder, newPath: string): Promise<void> {
    return new Promise((resolve, reject) => {
      const renamed = this.app.vault.on('rename', (file) => {
        if (file.path === newPath) settle(resolve);
      });
      const settle = (done: () => void): void => {
        this.app.vault.offref(renamed);
        done();
      };
      this.app.fileManager.renameFile(folder, newPath).then(
        () => settle(resolve),
        (error: unknown) => settle(() => reject(error instanceof Error ? error : new Error(String(error)))),
      );
    });
  }

  /** Moves a collection record to the folder `newId`, and its install record along, so updates still find its files. */
  private async moveRecordWithInstall(oldId: string, newId: string): Promise<void> {
    moveCollectionRecord(this.metadata!, oldId, newId);
    const uid = this.metadata!.collections[newId]?.uid;
    if (uid) await moveInstallRecord(this.app, uid, oldId, newId);
  }

  /**
   * Gives every collection its folder's name: the folder takes the collection's
   * name where it can (older versions named folders `default` or `winter-camp`),
   * otherwise the collection takes the folder's name. Returns whether any changed.
   */
  private async matchFolderNames(onlyId?: string): Promise<boolean> {
    const folders = (this.app.vault.getFolderByPath(COLLECTIONS_DIR)?.children ?? [])
      .filter((child) => child instanceof TFolder)
      .map((child) => child.name);
    const fixes = planFolderNameFixes(this.metadata!, folders)
      .filter((fix) => (onlyId === undefined || fix.id === onlyId) && !this.folderRenames.has(fix.id));
    let renamed = false;
    for (const fix of fixes) {
      const collection = this.metadata!.collections[fix.id];
      if (!collection) continue;
      if (fix.kind === 'rename-folder') {
        // Not awaited: the caller holds the index, and the record follows the folder by itself.
        this.folderRenames.add(fix.id);
        const rename = this.moveCollectionFolder(fix.id, fix.folder).finally(() => this.folderRenames.delete(fix.id));
        runInBackground(rename, `Renaming the folder of collection "${collection.name}"`);
        continue;
      }
      collection.name = fix.id;
      renamed = true;
    }
    if (renamed) await this.saveMetadata();
    return renamed;
  }

  /**
   * Gives a collection whose name was set elsewhere, such as by an import, a
   * folder of that name, or takes its folder's name when the name is taken.
   * The folder is renamed in the background; returns the collection as it is now.
   */
  async matchCollectionFolder(collectionId: string): Promise<CollectionMetadata | null> {
    await this.ensureLoaded();
    const uid = this.metadata!.collections[collectionId]?.uid;
    await this.matchFolderNames(collectionId);
    return Object.values(this.metadata!.collections).find((collection) => collection.uid === uid) ?? null;
  }

  /**
   * Follows a collection folder renamed in the vault: the record moves to the
   * new folder name as its id and name, and every stored path into the folder
   * is rewritten. A folder moved out of the collections folder is no longer a
   * collection. Returns whether `oldPath` was a collection folder.
   */
  async followCollectionFolderRename(oldPath: string, newPath: string): Promise<boolean> {
    await this.ensureLoaded();
    const oldId = collectionIdOfFolder(oldPath);
    const newId = collectionIdOfFolder(newPath);
    if (!oldId || oldId === newId || !this.metadata!.collections[oldId]) return false;

    if (newId) await this.moveRecordWithInstall(oldId, newId);
    else forgetCollection(this.metadata!, oldId);
    for (const id of Object.keys(this.metadata!.collections)) {
      if (!this.app.vault.getFolderByPath(collectionFolderPath(id))) await this.ensureCollectionStructure(id);
    }
    await this.saveMetadata();
    return true;
  }

  /**
   * Brings the index in line with the vault's files after changes Atlas did not
   * make itself: collection folders renamed, added or deleted in the file
   * manager or by a sync tool, scenes moved to another collection, asset files
   * added, moved or deleted. `deleted` holds the paths deleted since the last
   * check; only those remove records whose data lives in the index. Runs while
   * no import or refresh holds the index.
   */
  reconcileWithVault(deleted: ReadonlySet<string> = new Set()): Promise<VaultReconciliation> {
    return this.indexLock.run(async () => {
      await this.ensureLoaded();
      await this.matchFolderNames();
      const readings = await readVault(this.app, this.metadata!);
      // From the listing on, nothing awaits until the index is changed, so no other edit interleaves.
      const result = reconcileIndex(this.metadata!, listVault(this.app, readings, deleted));
      if (result.changed) await this.saveMetadata();
      for (const { from, to } of result.folderMoves) {
        const [oldId, newId] = [collectionIdOfFolder(from), collectionIdOfFolder(to)];
        const uid = newId ? this.metadata!.collections[newId]?.uid : undefined;
        if (oldId && newId && uid) await moveInstallRecord(this.app, uid, oldId, newId);
      }
      for (const id of result.missingFolders) await this.ensureCollectionStructure(id);
      await this.applyVaultFileOps(result);
      if (result.changed) this.notifyReconciled(result);
      return result;
    });
  }

  /** Moves and trashes the JSON copies the vault check asked for; a failure only skips that file. */
  private async applyVaultFileOps({ ops }: VaultReconciliation): Promise<void> {
    for (const { from, to } of ops.moves) {
      const file = this.app.vault.getFileByPath(from);
      if (!file) continue;
      try {
        await this.ensureDirectory(to.slice(0, to.lastIndexOf('/')));
        await this.app.fileManager.renameFile(file, to);
      } catch (error) {
        console.error(`[AssetService] Could not move ${from} to ${to}:`, error);
      }
    }
    for (const path of ops.trash) await this.trashFileIfPresent(path);
  }

  /** Calls `listener` after every vault check that changed the index; returns the unsubscribe function. */
  onReconciled(listener: (result: VaultReconciliation) => void): () => void {
    this.reconciledListeners.add(listener);
    return () => this.reconciledListeners.delete(listener);
  }

  private notifyReconciled(result: VaultReconciliation): void {
    for (const listener of this.reconciledListeners) {
      try {
        listener(result);
      } catch (error) {
        console.error('[AssetService] A vault check listener failed:', error);
      }
    }
  }

  async deleteCollection(collectionId: string): Promise<void> {
    if (!this.metadata || collectionId === defaultCollectionIdOf(this.metadata)) {
      return; // The default collection stays
    }

    // Delete all assets in the collection
    const assetsToDelete = Object.values(this.metadata.assets)
      .filter(asset => asset.collection === collectionId);
    
    for (const asset of assetsToDelete) {
      await this.deleteAsset(asset.id);
    }

    // Delete collection folder
    const collectionPath = `${COLLECTIONS_DIR}/${collectionId}`;
    const folder = this.app.vault.getAbstractFileByPath(collectionPath);
    if (folder instanceof TFolder) {
      await this.app.fileManager.trashFile(folder);
    }

    // Remove from metadata
    delete this.metadata.collections[collectionId];
    await this.saveMetadata();
  }

  // Generic asset management
  async addAsset(asset: NewAsset): Promise<Asset> {
    const newAsset: Asset = { ...asset, ...this.createAssetIdentity(asset.type) };
    return this.registerAsset(newAsset);
  }

  /** A new asset id; unique within this vault. */
  static newAssetId(type: Asset['type']): string {
    return `${type}-${Date.now()}-${Math.random().toString(36).substring(2, 8)}`;
  }

  private createAssetIdentity(type: Asset['type']): Pick<BaseAsset, 'id' | 'createdAt' | 'modifiedAt'> {
    const now = Date.now();
    return {
      id: AssetService.newAssetId(type),
      createdAt: now,
      modifiedAt: now
    };
  }

  /** Persists a fully built asset: data file, metadata entry and, for a token the user imported, the onboarding flag. */
  private async registerAsset<A extends Asset>(newAsset: A, userImport = true): Promise<A> {
    await this.ensureLoaded();

    if (newAsset.type !== 'token' && newAsset.type !== 'note' && !newAsset.filePath) {
      newAsset.filePath = this.getAssetPath(newAsset);
    }

    await this.ensureCollectionRecord(newAsset.collection);

    await this.writeRecordFile(newAsset);

    this.metadata!.assets[newAsset.id] = newAsset;
    try {
      await this.saveMetadata();
    } catch (error) {
      if (newAsset.type !== 'token') throw error;
      const saved = await wasTokenRegistrationSaved(this.app, newAsset);
      if (!saved) {
        delete this.metadata!.assets[newAsset.id];
        throw error;
      }
    }

    if (newAsset.type === 'token' && userImport) SettingsService.forApp(this.app)?.markTokenImported();
    return newAsset;
  }

  async getAssets<T extends Asset['type']>(collection: string | undefined, type: T): Promise<AssetOfType<T>[]>;
  async getAssets(collection?: string, type?: Asset['type']): Promise<Asset[]>;
  async getAssets(collection?: string, type?: Asset['type']): Promise<Asset[]> {
    await this.ensureLoaded();

    let assets = Object.values(this.metadata!.assets);
    if (collection) {
      // Case-insensitive collection comparison
      const filteredByCollection = assets.filter(asset => asset.collection.toLowerCase() === collection.toLowerCase());
      assets = filteredByCollection;
    }
    
    if (type) {
      const filteredByType = assets.filter(asset => asset.type === type);
      assets = filteredByType;
    }

    return assets;
  }

  async getAssetById(id: string): Promise<Asset | null> {
    await this.ensureLoaded();

    return this.metadata!.assets[id] || null;
  }

  async updateAsset(id: string, updates: AssetUpdates): Promise<void> {
    await this.ensureLoaded();

    const asset = this.metadata!.assets[id];
    if (!asset) return;

    // Properties explicitly set to undefined in updates are removed from the asset
    const keysToRemove = Object.entries<unknown>(updates)
      .filter(([, value]) => value === undefined)
      .map(([key]) => key);

    const updatedAsset: Asset = Object.assign({}, asset, updates, { modifiedAt: Date.now() });
    for (const key of keysToRemove) {
      Reflect.deleteProperty(updatedAsset, key);
    }

    this.metadata!.assets[id] = updatedAsset;

    if (updatedAsset.type === 'token') {
      this.propagateTokenReferenceUpdate(updatedAsset);
    }

    // Update asset data file if needed
    let fileContent: string | null = null;
    if (updatedAsset.type === 'map') {
      fileContent = this.serializeMapAsset(updatedAsset);
    } else if (updatedAsset.type !== 'token' && updatedAsset.type !== 'note' && 'data' in updates) {
      fileContent = JSON.stringify(updates.data, null, 2) || '{}';
    }
    if (fileContent !== null) {
      const content = fileContent;
      const file = this.app.vault.getAbstractFileByPath(this.getAssetPath(updatedAsset));
      if (file instanceof TFile) {
        await this.app.vault.process(file, () => content);
      }
    }

    await this.saveMetadata();
  }

  /** Content of the JSON file that accompanies a map asset. */
  private serializeMapAsset(asset: MapAsset): string {
    return JSON.stringify({
      id: asset.id,
      name: asset.name,
      mapFilePath: asset.mapFilePath,
      tags: asset.tags,
      collection: asset.collection,
      createdAt: asset.createdAt,
      modifiedAt: asset.modifiedAt
    }, null, 2);
  }

  /**
   * The JSON file a record needs written, or null when it needs none: a map's
   * always, since it repeats the record; the payload of other JSON-backed types
   * only when the file is missing, because older records keep it in the file alone.
   */
  pendingRecordFile(asset: Asset): { path: string; content: string } | null {
    if (asset.type === 'token' || asset.type === 'note') return null;
    const path = this.getAssetPath(asset);
    if (asset.type === 'map') return { path, content: this.serializeMapAsset(asset) };
    if (this.app.vault.getAbstractFileByPath(path)) return null;
    return { path, content: JSON.stringify(asset.data, null, 2) || '{}' };
  }

  private async writeRecordFile(asset: Asset): Promise<void> {
    const file = this.pendingRecordFile(asset);
    if (!file) return;
    const existing = this.app.vault.getAbstractFileByPath(file.path);
    if (existing instanceof TFile) await this.app.vault.process(existing, () => file.content);
    else await this.app.vault.create(file.path, file.content);
  }

  async deleteAsset(id: string): Promise<void> {
    await this.ensureLoaded();

    const asset = this.metadata!.assets[id];
    if (!asset) return;

    // Delete the asset file
    try {
      const assetPath = this.getAssetPath(asset);
      const file = this.app.vault.getAbstractFileByPath(assetPath);
      if (file instanceof TFile) {
        await this.app.fileManager.trashFile(file);
      }
    } catch (error) {
      console.error('[AssetService] Error deleting asset file:', error);
    }

    // For scene assets, also delete the map file and close any open leaves
    if (asset.type === 'scene') {
      // Load the scene data from the JSON file if not already loaded
      let sceneData = asset.data;
      if (!sceneData) {
        try {
          const sceneJsonPath = this.getAssetPath(asset);
          const sceneJsonFile = this.app.vault.getAbstractFileByPath(sceneJsonPath);
          if (sceneJsonFile instanceof TFile) {
            const parsed: unknown = JSON.parse(await this.app.vault.read(sceneJsonFile));
            if (isRecord(parsed) && typeof parsed.mapPath === 'string') {
              sceneData = { mapPath: parsed.mapPath };
            }
          }
        } catch (error) {
          console.error('[AssetService] Error loading scene data:', error);
        }
      }
      
      const mapPath = sceneData?.mapPath;
      if (mapPath) {
        try {
          // Delete the map file
          const mapFile = this.app.vault.getAbstractFileByPath(mapPath);
          if (mapFile instanceof TFile) {
            // Close any leaves showing this file
            const leaves = this.app.workspace.getLeavesOfType('atlas-view');
            for (const leaf of leaves) {
              const state = leaf.view?.getState?.();
              if (state?.file === mapPath) {
                leaf.detach();
              }
            }
            
            // Also check markdown leaves in case the .atlasmap file is open there
            const markdownLeaves = this.app.workspace.getLeavesOfType('markdown');
            for (const leaf of markdownLeaves) {
              const state = leaf.view?.getState?.();
              if (state?.file === mapPath) {
                leaf.detach();
              }
            }
            
            await this.app.fileManager.trashFile(mapFile);
          }
        } catch (error) {
          console.error('[AssetService] Error deleting scene map file:', error);
        }
      }
    }

    const emptiedGroups = asset.type === 'token' ? await this.getGroupsUsingTokens([asset.id]) : [];
    if (asset.type === 'token') {
      this.removeTokenReferencesFromGroups(asset.id);
      await this.trashFileIfPresent(asset.thumbnailPath);
    }

    // Remove from metadata
    delete this.metadata!.assets[id];
    await this.saveMetadata();

    await this.deleteEmptiedGroups(emptiedGroups);
  }

  private async trashFileIfPresent(path: string | undefined): Promise<void> {
    if (!path) return;
    const file = this.app.vault.getAbstractFileByPath(path);
    if (!(file instanceof TFile)) return;
    try {
      await this.app.fileManager.trashFile(file);
    } catch (error) {
      console.error('[AssetService] Error deleting file:', path, error);
    }
  }

  /** Vault path of the file that backs `asset`: the token image, the map's JSON record, or the JSON payload of other types. */
  getAssetFilePath(asset: Asset): string {
    return this.getAssetPath(asset);
  }

  async getCollection(collectionId: string): Promise<CollectionMetadata | null> {
    await this.ensureLoaded();
    return this.metadata!.collections[collectionId] ?? null;
  }

  async findCollectionByUid(uid: string): Promise<CollectionMetadata | null> {
    await this.ensureLoaded();
    return Object.values(this.metadata!.collections).find((collection) => collection.uid === uid) ?? null;
  }

  /** This vault's identity as a publisher of collections. */
  async getVaultId(): Promise<string> {
    await this.ensureLoaded();
    return this.metadata!.vaultId!;
  }

  /** Whether another collection than `exceptId` already uses `name`; names are compared without case. */
  async isCollectionNameTaken(name: string, exceptId?: string): Promise<boolean> {
    await this.ensureLoaded();
    return this.findCollectionByName(name, exceptId) !== undefined;
  }

  /** `name`, or `name (2)`, `name (3)`, … when another collection already uses it. */
  async freeCollectionName(name: string, exceptId?: string): Promise<string> {
    await this.ensureLoaded();
    return this.numberedCollectionName(name, exceptId);
  }

  /**
   * A folder name for a new collection called `name`: the name itself, or
   * `name (2)`, `name (3)`, … while a collection or a leftover folder has it,
   * so a deleted collection's files never leak into the new one.
   */
  async freeCollectionIdFor(name: string): Promise<string> {
    await this.ensureLoaded();
    const base = collectionFolderName(name);
    let id = base;
    for (let n = 2; this.findCollectionByName(id) || this.isCollectionFolderTaken(id); n++) id = `${base} (${n})`;
    return id;
  }

  private numberedCollectionName(name: string, exceptId?: string): string {
    return numberedCollectionName(this.metadata, name, exceptId);
  }

  private findCollectionByName(name: string, exceptId?: string): CollectionMetadata | undefined {
    const wanted = collectionNameKey(name);
    return Object.values(this.metadata!.collections)
      .find((collection) => collection.id !== exceptId && collectionNameKey(collection.name) === wanted);
  }

  private assertCollectionNameFree(name: string, exceptId?: string): void {
    if (this.findCollectionByName(name, exceptId)) throw new Error(`A collection named "${name.trim()}" already exists`);
  }

  /** Stores the release a publisher just exported, once the export has been written. */
  async recordCollectionRelease(
    collectionId: string,
    release: { version: number; releasedAt: number; author?: string | undefined; coverPath?: string | undefined },
  ): Promise<void> {
    await this.ensureLoaded();
    const collection = this.metadata!.collections[collectionId];
    if (!collection) throw new Error(`Collection ${collectionId} not found`);
    collection.version = release.version;
    collection.releasedAt = release.releasedAt;
    if (release.author === undefined) delete collection.author;
    else collection.author = release.author;
    if (release.coverPath === undefined) delete collection.coverPath;
    else collection.coverPath = release.coverPath;
    collection.publisherId = this.metadata!.vaultId!;
    await this.saveMetadata();
  }

  /**
   * Turns a copy of someone else's collection into this vault's own collection:
   * it gets a new identity and name, so it no longer receives the original's
   * updates and its exports are this vault's releases.
   */
  async forkCollection(collectionId: string, name: string, uid: string): Promise<CollectionMetadata> {
    await this.ensureLoaded();
    const collection = this.metadata!.collections[collectionId];
    if (!collection) throw new Error(`Collection ${collectionId} not found`);
    const id = name.trim() === collectionId ? collectionId : this.assertCollectionFolderName(name, collectionId);
    collection.uid = uid;
    collection.version = 1;
    collection.publisherId = this.metadata!.vaultId!;
    delete collection.releasedAt;
    collection.modifiedAt = Date.now();
    if (id !== collectionId) await this.moveCollectionFolder(collectionId, id);
    await this.saveMetadata();
    return this.metadata!.collections[id]!;
  }

  /**
   * Records an imported collection and its assets in one metadata save. The
   * files must already be in the vault at the paths the assets reference.
   * Returns the collection as recorded, with tags from older bundles grouped.
   */
  async commitCollectionImport({ collectionId, collection, upsert, remove }: CollectionImportCommit): Promise<CollectionMetadata> {
    await this.ensureLoaded();
    this.assertCollectionNameFree(collection.name, collectionId);
    await this.ensureCollectionStructure(collectionId);
    // Changes go to a copy that replaces the index only once it is saved, so a failed save leaves nothing half-applied.
    const current = this.metadata!;
    const assets = { ...current.assets };
    for (const id of remove) delete assets[id];
    for (const asset of upsert) assets[asset.id] = { ...asset, collection: collectionId };
    const collectionAssets = Object.values(assets).filter((asset) => asset.collection === collectionId);
    const recorded: CollectionMetadata = {
      ...collection,
      id: collectionId,
      // A bundle update can drop the field; tags then stay as the bundle left them.
      tags: groupLegacyTags(collection.tags ?? {}, collectionAssets) ?? collection.tags,
    };
    const next: AssetMetadata = { ...current, collections: { ...current.collections, [collectionId]: recorded }, assets };
    this.metadata = next;
    try {
      await this.saveMetadata();
    } catch (error) {
      this.metadata = current;
      throw error;
    }
    if (upsert.some((asset) => asset.type === 'token')) SettingsService.forApp(this.app)?.markTokenImported();
    return recorded;
  }

  /**
   * Records assets moved or copied into a collection, with the tags they carry,
   * in one save. Their files, record files included (`pendingRecordFile`),
   * must already be in place. A failed save leaves the index as it was.
   */
  async commitAssetTransfer({ collectionId, records, tags }: AssetTransferCommit): Promise<void> {
    await this.ensureLoaded();
    const current = this.metadata!;
    const collection = current.collections[collectionId];
    if (!collection) throw new Error(`Collection ${collectionId} not found`);
    const collectionTags = { ...collection.tags };
    for (const tag of tags) collectionTags[tagKey(tag.group, tag.id)] ??= tag;
    const assets = { ...current.assets };
    for (const record of records) assets[record.id] = record;
    this.metadata = {
      ...current,
      collections: { ...current.collections, [collectionId]: { ...collection, tags: collectionTags, modifiedAt: Date.now() } },
      assets,
    };
    try {
      await this.saveMetadata();
    } catch (error) {
      this.metadata = current;
      throw error;
    }
  }

  // Backward compatibility methods
  /** `userImport: false` adds a token Atlas provides, which does not count as the user's first import. */
  async addTokenAsset(
    asset: Omit<TokenAsset, 'id' | 'createdAt' | 'modifiedAt' | 'type'>,
    { userImport = true }: { userImport?: boolean } = {},
  ): Promise<TokenAsset> {
    return this.registerAsset<TokenAsset>({ ...asset, type: 'token', ...this.createAssetIdentity('token') }, userImport);
  }

  async getTokenAssets(): Promise<TokenAsset[]> {
    return this.getAssets(undefined, 'token');
  }

  async deleteTokenAsset(id: string): Promise<void> {
    await this.deleteAsset(id);
  }

  async updateTokenAsset(id: string, updates: Partial<Omit<TokenAsset, 'id' | 'createdAt' | 'type' | 'collection'>>): Promise<void> {
    await this.updateAsset(id, updates);
  }

  async createEncounter(encounterData: Omit<EncounterAsset, 'id' | 'createdAt' | 'modifiedAt' | 'type'>): Promise<EncounterAsset> {
    const encounter: EncounterAsset = {
      ...encounterData,
      ...this.createAssetIdentity('encounter'),
      type: 'encounter',
      data: {
        ...encounterData.data,
        tokens: encounterData.tokens,
        ...(encounterData.difficulty !== undefined && { difficulty: encounterData.difficulty }),
        ...(encounterData.formation !== undefined && { formation: encounterData.formation }),
      }
    };

    return this.registerAsset(encounter);
  }

  /**
   * Edits asset records in place, e.g. to rewrite paths after a vault rename.
   * `rewrite` returns whether it changed the asset; metadata is saved once if any did.
   */
  async rewriteAssets(rewrite: (asset: Asset) => boolean): Promise<boolean> {
    if (!this.metadata) return false;

    let changed = false;
    for (const asset of Object.values(this.metadata.assets)) {
      if (rewrite(asset)) changed = true;
    }

    if (changed) {
      await this.saveMetadata();
    }
    return changed;
  }

  /** Re-reads the index from disk, after any import in progress has finished. */
  async refreshMetadata(): Promise<void> {
    if (!this.metadata) {
      await this.ensureLoaded();
      return;
    }
    await this.indexLock.run(() => this.rereadMetadata());
  }

  /**
   * Gives every collection a tag registry, filled from its assets' tags when it
   * had none, and moves ungrouped tags into their tag groups.
   */
  private async migrateTags(): Promise<void> {
    if (!this.metadata) return;
    const assets = Object.values(this.metadata.assets);
    let changed = false;
    for (const collection of Object.values(this.metadata.collections)) {
      const collectionAssets = assets.filter((asset) => (asset.collection || defaultCollectionIdOf(this.metadata)) === collection.id);
      if (!collection.tags) {
        collection.tags = {};
        changed = true;
        for (const tagName of new Set(collectionAssets.flatMap((asset) => asset.tags ?? []))) {
          collection.tags[tagIdOf(tagName)] = { id: tagIdOf(tagName), name: tagName };
        }
      }
      const grouped = groupLegacyTags(collection.tags, collectionAssets);
      if (grouped) {
        collection.tags = grouped;
        changed = true;
      }
    }
    if (changed) await this.saveMetadata();
  }

  /** The tags of a group: registered in any collection or carried by any asset of the group, sorted by name. */
  async getAllTags(group: TagGroup): Promise<string[]> {
    await this.ensureLoaded();
    if (!this.metadata) return [];

    const tags = new Set<string>();
    for (const collection of Object.values(this.metadata.collections)) {
      for (const tag of Object.values(collection.tags ?? {})) {
        if (tag.group === group) tags.add(tag.name);
      }
    }
    for (const asset of Object.values(this.metadata.assets)) {
      if (tagGroupOf(asset.type) === group) asset.tags.forEach((tag) => tags.add(tag));
    }
    return Array.from(tags).sort();
  }

  /** The tags a collection registers in a group. */
  async getCollectionTags(collectionId: string, group: TagGroup): Promise<TagMetadata[]> {
    await this.ensureLoaded();
    const tags = this.metadata?.collections[collectionId]?.tags ?? {};
    return Object.values(tags).filter((tag) => tag.group === group);
  }

  /** Registers a tag in a collection's group; an existing tag of that name is returned as it is. */
  async createTag(collectionId: string, group: TagGroup, tagName: string): Promise<TagMetadata> {
    await this.ensureLoaded();
    if (!this.metadata) throw new Error('Metadata not loaded');

    const collection = this.metadata.collections[collectionId];
    if (!collection) throw new Error(`Collection ${collectionId} not found`);
    collection.tags ??= {};

    const id = tagIdOf(tagName);
    const existing = collection.tags[tagKey(group, id)];
    if (existing) return existing;

    const tag: TagMetadata = { id, name: tagName.trim(), group };
    collection.tags[tagKey(group, id)] = tag;
    await this.saveMetadata();
    return tag;
  }

  /**
   * Renames a tag. Its id follows the name, and every asset of the group in the
   * collection that carries the tag (by id or, as creators store it, by name) is retagged.
   */
  async renameTag(collectionId: string, group: TagGroup, tagId: string, name: string): Promise<TagMetadata> {
    await this.ensureLoaded();
    const tags = this.metadata!.collections[collectionId]?.tags;
    const tag = tags?.[tagKey(group, tagId)];
    if (!tags || !tag) throw new Error(`Tag ${tagId} not found`);

    const renamed: TagMetadata = { ...tag, id: tagIdOf(name), name: name.trim(), group };
    if (renamed.id !== tagId && tags[tagKey(group, renamed.id)]) throw new Error(`A tag named "${name}" already exists`);
    delete tags[tagKey(group, tagId)];
    tags[tagKey(group, renamed.id)] = renamed;

    const retag = (value: string): string => (value === tag.id ? renamed.id : value === tag.name ? renamed.name : value);
    for (const asset of this.assetsOfTagGroup(collectionId, group)) asset.tags = asset.tags.map(retag);
    await this.saveMetadata();
    return renamed;
  }

  /** Deletes a tag from a collection's group and removes it from the group's assets. */
  async deleteTag(collectionId: string, group: TagGroup, tagId: string): Promise<void> {
    await this.ensureLoaded();
    if (!this.metadata) throw new Error('Metadata not loaded');

    const tags = this.metadata.collections[collectionId]?.tags;
    const tag = tags?.[tagKey(group, tagId)];
    if (!tags || !tag) return;

    delete tags[tagKey(group, tagId)];
    for (const asset of this.assetsOfTagGroup(collectionId, group)) {
      asset.tags = asset.tags.filter((value) => !hasAssetTag([value], tag));
    }
    await this.saveMetadata();
  }

  private assetsOfTagGroup(collectionId: string, group: TagGroup): Asset[] {
    return Object.values(this.metadata!.assets)
      .filter((asset) => asset.collection === collectionId && tagGroupOf(asset.type) === group);
  }

  /**
   * Update asset tags
   */
  async updateAssetTags(assetId: string, tags: string[]): Promise<void> {
    await this.ensureLoaded();
    if (!this.metadata) throw new Error('Metadata not loaded');
    
    const asset = this.metadata.assets[assetId];
    if (!asset) throw new Error(`Asset ${assetId} not found`);
    
    asset.tags = tags;
    asset.modifiedAt = Date.now();
    
    await this.saveMetadata();
  }

  /** Update the settings for a collection */
  async updateCollectionSettings(collectionId: string, settings: Partial<CollectionSettings>): Promise<void> {
    await this.ensureLoaded();
    const collection = this.metadata!.collections[collectionId];
    if (!collection) throw new Error(`Collection ${collectionId} not found`);
    collection.settings = { ...collection.settings, ...settings };
    collection.modifiedAt = Date.now();
    // Open maps apply the change at once; the write to disk follows
    this.app.workspace.trigger('atlas-vtt:collection-settings-changed', collectionId);
    await this.saveMetadata();
  }

  /** Get settings for a collection, returns defaults if none set */
  getCollectionSettings(collectionId: string): CollectionSettings {
    const collection = this.metadata?.collections[collectionId];
    return collection?.settings ?? { conditions: [] };
  }

  /** The library token drawn with this artwork, read from the loaded index. */
  findTokenAssetByImagePath(imagePath: string): TokenAsset | null {
    if (!this.metadata) return null;
    return Object.values(this.metadata.assets).find(
      (asset): asset is TokenAsset => asset.type === 'token' && asset.imagePath === imagePath,
    ) ?? null;
  }

  /** Get the collection ID that a given map file belongs to */
  getCollectionForMap(mapFilePath: string): string | null {
    if (!this.metadata) return null;
    // Maps live under atlas-vtt/collections/{collectionId}/scenes/
    const match = mapFilePath.match(/collections\/([^/]+)\//);
    const candidate = match?.[1];
    if (!candidate) {
      return null;
    }
    if (this.metadata.collections[candidate]) {
      return candidate;
    }
    const normalized = candidate.toLowerCase();
    return Object.keys(this.metadata.collections).find((id) => id.toLowerCase() === normalized) ?? null;
  }

  /**
   * Reset the singleton instance (useful for testing)
   */
  static resetInstance(): void {
    AssetService.instance = null;
  }
}
