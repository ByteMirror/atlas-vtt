import { wasTokenRegistrationSaved } from './assetRegistrationRecovery';
import { SettingsService } from './SettingsService';
import { App, TFile, TFolder } from 'obsidian';
import { ensureAdapterFolder } from '../plugin/vaultFolders';
import type { TokenStateSnapshot } from '../types';
import type { CellCoord, EncounterFormation } from '../encounters/encounterFormation';
import { getDataFilePath } from '../utils/dataFileMigration';
import type { CollectionSettings } from '../types/collectionSettingsTypes';
import {
  isAssetMetadata,
  isLegacyAssetMetadata,
  isLegacyTokenRecord,
  isRecord,
  parseGroupTokenRefs,
  type LegacyAssetMetadata,
} from './assetMetadataGuards';

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
  ? { [K in Exclude<keyof A, 'id' | 'createdAt' | 'type'>]?: A[K] | undefined }
  : never;
/** Fields to change on an asset; an explicit `undefined` removes the field. */
export type AssetUpdates = AssetUpdatesOf<Asset>;

export type GroupAsset = EncounterAsset | PlayerAsset;

/** Token lists of a group asset: the top-level one and the copy inside its JSON payload. */
export function groupTokenRefs(asset: GroupAsset): GroupTokenRef[] {
  if (Array.isArray(asset.tokens)) return asset.tokens;
  return Array.isArray(asset.data?.tokens) ? asset.data.tokens : [];
}

export interface TagMetadata {
  id: string;
  name: string;
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

export const ATLAS_VTT_DIR = 'atlas-vtt';
export const COLLECTIONS_DIR = `${ATLAS_VTT_DIR}/collections`;
export const GLOBAL_ASSETS_DIR = `${ATLAS_VTT_DIR}/assets`;
const ASSETS_METADATA_PATH = getDataFilePath(`${ATLAS_VTT_DIR}/assets-metadata.json`);

export class AssetService {
  private static instance: AssetService | null = null;
  private app: App;
  private metadata: AssetMetadata | null = null;
  private initialization: Promise<void> | null = null;

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
    await this.ensureDefaultCollection();
    await this.loadMetadata();
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

  private async ensureDefaultCollection(): Promise<void> {
    const defaultCollectionPath = `${COLLECTIONS_DIR}/default`;
    await this.ensureDirectory(defaultCollectionPath);
    
    // Ensure all subdirectories exist ('assets' is global, not per collection)
    const subdirs = ['tokens', 'notes', 'statblocks', 'maps', 'characters', 'scenes', 'encounters', 'players'];
    for (const subdir of subdirs) {
      await this.ensureDirectory(`${defaultCollectionPath}/${subdir}`);
    }
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
    const collectionPath = `${COLLECTIONS_DIR}/${asset.collection}`;
    
    switch (asset.type) {
      case 'token':
        return asset.imagePath; // This will be in the global assets folder
      case 'map':
        return `${collectionPath}/maps/${asset.id}.json`; // JSON metadata file for the map
      case 'note':
        return asset.notePath;
      case 'statblock':
        return asset.filePath || `${collectionPath}/statblocks/${asset.id}.json`;
      case 'character':
        return asset.filePath || `${collectionPath}/characters/${asset.id}.json`;
      case 'scene':
        return asset.filePath || `${collectionPath}/scenes/${asset.id}.json`;
      case 'encounter':
        return asset.filePath || `${collectionPath}/encounters/${asset.id}.json`;
      case 'player':
        return asset.filePath || `${collectionPath}/players/${asset.id}.json`;
    }
  }

  private async loadMetadata(): Promise<void> {
    try {
      const oldPath = 'atlas-vtt/assets-metadata.json';
      let content: string | null = null;

      if (await this.app.vault.adapter.exists(ASSETS_METADATA_PATH)) {
        content = await this.app.vault.adapter.read(ASSETS_METADATA_PATH);
      } else if (await this.app.vault.adapter.exists(oldPath)) {
        content = await this.app.vault.adapter.read(oldPath);
      }

      if (!content) {
        // Create default metadata
        this.metadata = await this.createDefaultMetadata();
        await this.saveMetadata();
      } else {
        const parsed: unknown = JSON.parse(content);

        if (isLegacyAssetMetadata(parsed)) {
          await this.migrateFromOldFormat(parsed);
        } else if (isAssetMetadata(parsed)) {
          this.metadata = parsed;
          // Migrate tags to collection-based system if needed
          await this.migrateTagsToCollections();
        } else {
          // Invalid metadata structure, create default
          this.metadata = await this.createDefaultMetadata();
          await this.saveMetadata();
        }
      }
    } catch (error) {
      console.error('[AssetService] Error loading metadata:', error);
      this.metadata = await this.createDefaultMetadata();
    }

    // Ensure all collections have uid, version, and settings fields
    await this.migrateCollectionFields();
    // Recover from partially missing metadata by reconciling known files.
    await this.reconcileMetadataWithVault();
  }

  private async createDefaultMetadata(): Promise<AssetMetadata> {
    return {
      collections: {
        'default': {
          id: 'default',
          uid: crypto.randomUUID(),
          version: 1,
          name: 'Default',
          description: 'Default collection',
          tags: {}, // Initialize with empty tags
          settings: { conditions: [] },
          createdAt: Date.now(),
          modifiedAt: Date.now()
        }
      },
      assets: {},
      version: 2
    };
  }

  private prettifyIdentifier(identifier: string): string {
    const words = identifier
      .replace(/[-_]+/g, ' ')
      .trim()
      .split(/\s+/)
      .filter(Boolean);

    if (words.length === 0) {
      return identifier;
    }

    return words
      .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
      .join(' ');
  }

  private createCollectionMetadata(id: string): CollectionMetadata {
    const now = Date.now();
    const name = id === 'default' ? 'Default' : this.prettifyIdentifier(id);
    return {
      id,
      uid: crypto.randomUUID(),
      version: 1,
      name,
      description: `${name} collection`,
      tags: {},
      settings: { conditions: [] },
      createdAt: now,
      modifiedAt: now
    };
  }

  private getCollectionIdFromPath(path: string): string | null {
    const match = path.match(/^atlas-vtt\/collections\/([^/]+)\//);
    return match?.[1] ?? null;
  }

  private createRecoveredId(prefix: string, seed: string): string {
    let hash = 0;
    for (let i = 0; i < seed.length; i++) {
      hash = ((hash << 5) - hash) + seed.charCodeAt(i);
      hash |= 0;
    }
    return `${prefix}-recovered-${Math.abs(hash).toString(36)}`;
  }

  private fileNameWithoutExtension(path: string): string {
    const parts = path.split('/');
    const fileName = parts[parts.length - 1] ?? path;
    return fileName.replace(/\.[^.]+$/, '');
  }

  private async readJsonFile(file: TFile): Promise<unknown> {
    try {
      const content = await this.app.vault.read(file);
      return JSON.parse(content);
    } catch {
      return null;
    }
  }

  private normalizeTagArray(tags: unknown): string[] {
    if (!Array.isArray(tags)) return [];
    return tags.filter((tag): tag is string => typeof tag === 'string');
  }

  private isRecoverableImagePath(path: string): boolean {
    return /\.(png|jpe?g|webp|gif)$/i.test(path);
  }

  private stripGeneratedTokenFileSuffix(baseName: string): string {
    return baseName
      .replace(/[-_]\d{10,}[-_][a-z0-9]{4,}$/i, '')
      .replace(/[-_]\d{10,}$/i, '');
  }

  private deriveRecoveredTokenName(path: string): string {
    const baseName = this.fileNameWithoutExtension(path);
    const cleanedBase = this.stripGeneratedTokenFileSuffix(baseName);
    return this.prettifyIdentifier(cleanedBase || baseName);
  }

  private recoverTokenAssetsFromVaultFiles(vaultFiles: TFile[]): TokenAsset[] {
    if (!this.metadata) {
      return [];
    }

    const now = Date.now();
    const recovered: TokenAsset[] = [];
    const existingTokenImagePaths = new Set<string>();
    const encounterOrPlayerTokenPathToCollection = new Map<string, string>();

    for (const asset of Object.values(this.metadata.assets)) {
      if (asset.type === 'token') {
        if (asset.imagePath) {
          existingTokenImagePaths.add(asset.imagePath);
        }
        continue;
      }

      if (asset.type === 'encounter' || asset.type === 'player') {
        for (const token of groupTokenRefs(asset)) {
          if (token && typeof token.imagePath === 'string' && token.imagePath.length > 0) {
            encounterOrPlayerTokenPathToCollection.set(token.imagePath, asset.collection || 'default');
          }
        }
      }
    }

    for (const file of vaultFiles) {
      const path = file.path;
      if (!this.isRecoverableImagePath(path)) {
        continue;
      }
      if (existingTokenImagePaths.has(path)) {
        continue;
      }

      const collectionTokenMatch = path.match(
        /^atlas-vtt\/collections\/([^/]+)\/(?:.+\/)?tokens\/.+$/i
      );

      let collectionId: string | null = null;
      if (collectionTokenMatch) {
        collectionId = collectionTokenMatch[1]!;
      } else if (encounterOrPlayerTokenPathToCollection.has(path)) {
        collectionId = encounterOrPlayerTokenPathToCollection.get(path)!;
      } else {
        continue;
      }

      const recoveredAsset: TokenAsset = {
        id: this.createRecoveredId('token', path),
        type: 'token',
        name: this.deriveRecoveredTokenName(path),
        imagePath: path,
        tags: [],
        collection: collectionId,
        createdAt: now,
        modifiedAt: now
      };

      if (this.metadata.assets[recoveredAsset.id]) {
        continue;
      }

      recovered.push(recoveredAsset);
      existingTokenImagePaths.add(path);
    }

    return recovered;
  }

  private async recoverAssetsFromVaultFiles(vaultFiles: TFile[]): Promise<Asset[]> {
    const recoveredAssets = new Map<string, Asset>();
    const recoveredSceneMapPaths = new Set<string>();
    const now = Date.now();

    // Recover structured assets from their JSON files first.
    for (const file of vaultFiles) {
      const mapMatch = file.path.match(/^atlas-vtt\/collections\/([^/]+)\/maps\/([^/]+)\.json$/);
      if (mapMatch) {
        const collectionId = mapMatch[1]!;
        const fallbackId = mapMatch[2]!;
        const parsed = await this.readJsonFile(file);
        if (!isRecord(parsed)) {
          continue;
        }
        const mapFilePath = typeof parsed.mapFilePath === 'string' ? parsed.mapFilePath : '';
        if (!mapFilePath) {
          continue;
        }
        const createdAt = typeof parsed.createdAt === 'number' ? parsed.createdAt : now;
        const modifiedAt = typeof parsed.modifiedAt === 'number' ? parsed.modifiedAt : createdAt;
        const mapAsset: MapAsset = {
          id: typeof parsed.id === 'string' && parsed.id.trim() ? parsed.id : fallbackId,
          type: 'map',
          name: typeof parsed.name === 'string' && parsed.name.trim()
            ? parsed.name
            : this.fileNameWithoutExtension(mapFilePath),
          mapFilePath,
          tags: this.normalizeTagArray(parsed.tags),
          collection: collectionId,
          createdAt,
          modifiedAt
        };
        recoveredAssets.set(mapAsset.id, mapAsset);
        continue;
      }

      const typedMatch = file.path.match(/^atlas-vtt\/collections\/([^/]+)\/(scenes|encounters|players|characters|statblocks)\/(.+)\.json$/);
      if (!typedMatch) {
        continue;
      }

      const collectionId = typedMatch[1]!;
      const folderType = typedMatch[2]!;
      const assetId = this.fileNameWithoutExtension(file.path);
      const parsed = await this.readJsonFile(file);
      const parsedObject = isRecord(parsed) ? parsed : {};
      const createdAt = typeof parsedObject.createdAt === 'number' ? parsedObject.createdAt : now;
      const modifiedAt = typeof parsedObject.modifiedAt === 'number' ? parsedObject.modifiedAt : createdAt;
      const tags = this.normalizeTagArray(parsedObject.tags);

      if (folderType === 'scenes') {
        const parsedMapPath = typeof parsedObject.mapPath === 'string' ? parsedObject.mapPath : '';
        const mapPath = parsedMapPath || file.path.replace(/\.json$/, '.atlasmap');
        if (mapPath) {
          recoveredSceneMapPaths.add(mapPath);
        }
        const sceneAsset: SceneAsset = {
          id: assetId,
          type: 'scene',
          name: typeof parsedObject.name === 'string' && parsedObject.name.trim()
            ? parsedObject.name
            : this.fileNameWithoutExtension(mapPath || assetId),
          filePath: file.path,
          tags,
          collection: collectionId,
          createdAt,
          modifiedAt,
          data: {
            ...parsedObject,
            mapPath
          }
        };
        recoveredAssets.set(sceneAsset.id, sceneAsset);
        continue;
      }

      const base: BaseAsset = {
        id: assetId,
        name: typeof parsedObject.name === 'string' && parsedObject.name.trim()
          ? parsedObject.name
          : this.prettifyIdentifier(assetId),
        filePath: file.path,
        tags,
        collection: collectionId,
        createdAt,
        modifiedAt
      };
      recoveredAssets.set(assetId, this.recoverJsonAsset(folderType, base, parsedObject));
    }

    // Recover scene assets directly from .atlasmap files that have no matching scene JSON.
    for (const file of vaultFiles) {
      const sceneFileMatch = file.path.match(/^atlas-vtt\/collections\/([^/]+)\/(?:.+\/)?scenes\/([^/]+)\.atlasmap$/);
      if (!sceneFileMatch) {
        continue;
      }

      const collectionId = sceneFileMatch[1]!;
      if (recoveredSceneMapPaths.has(file.path)) {
        continue;
      }

      const sceneName = this.fileNameWithoutExtension(file.path);
      const sceneId = this.createRecoveredId('scene', file.path);
      if (recoveredAssets.has(sceneId)) {
        continue;
      }

      const recoveredScene: SceneAsset = {
        id: sceneId,
        type: 'scene',
        name: sceneName,
        tags: [],
        collection: collectionId,
        createdAt: now,
        modifiedAt: now,
        data: {
          mapPath: file.path
        }
      };
      recoveredAssets.set(sceneId, recoveredScene);
    }

    return Array.from(recoveredAssets.values());
  }

  /** Rebuilds a JSON-backed asset from its own data file (the file holds the asset's `data` payload). */
  private recoverJsonAsset(folderType: string, base: BaseAsset, payload: Record<string, unknown>): Asset {
    if (folderType === 'encounters' || folderType === 'players') {
      const tokens = parseGroupTokenRefs(payload.tokens);
      return {
        ...base,
        type: folderType === 'encounters' ? 'encounter' : 'player',
        tokens,
        data: { ...payload, tokens }
      };
    }
    return { ...base, type: folderType === 'characters' ? 'character' : 'statblock', data: payload };
  }

  private async reconcileMetadataWithVault(): Promise<void> {
    if (!this.metadata || typeof this.app.vault.getFiles !== 'function') {
      return;
    }

    const vaultFiles = this.app.vault.getFiles();
    if (!vaultFiles || vaultFiles.length === 0) {
      return;
    }
    const vaultFilePaths = new Set(vaultFiles.map((file) => file.path));
    const encounterOrPlayerTokenRefs = new Set<string>();
    for (const asset of Object.values(this.metadata.assets)) {
      if (asset.type !== 'encounter' && asset.type !== 'player') {
        continue;
      }
      for (const token of groupTokenRefs(asset)) {
        if (token && typeof token.imagePath === 'string' && token.imagePath.length > 0) {
          encounterOrPlayerTokenRefs.add(token.imagePath);
        }
      }
    }

    let needsSave = false;

    if (!this.metadata.collections.default) {
      this.metadata.collections.default = this.createCollectionMetadata('default');
      needsSave = true;
    }

    // Register collection IDs that exist on disk but are missing in metadata.
    for (const file of vaultFiles) {
      const collectionId = this.getCollectionIdFromPath(file.path);
      if (!collectionId || this.metadata.collections[collectionId]) {
        continue;
      }
      this.metadata.collections[collectionId] = this.createCollectionMetadata(collectionId);
      needsSave = true;
    }

    // If metadata was wiped, rebuild a usable index from persisted files.
    if (Object.keys(this.metadata.assets).length === 0) {
      const recoveredAssets = await this.recoverAssetsFromVaultFiles(vaultFiles);
      if (recoveredAssets.length > 0) {
        for (const asset of recoveredAssets) {
          this.metadata.assets[asset.id] = asset;
        }
        needsSave = true;
      }
    }

    // Remove stale token metadata entries that no longer point to an existing file.
    for (const [id, asset] of Object.entries(this.metadata.assets)) {
      if (asset.type !== 'token') {
        continue;
      }
      const imagePath = asset.imagePath;
      const isCollectionTokenPath = typeof imagePath === 'string' &&
        /^atlas-vtt\/collections\/[^/]+\/(?:.+\/)?tokens\/.+$/i.test(imagePath);
      const isEncounterOrPlayerThumbnail = typeof imagePath === 'string' && (
        imagePath.startsWith(`${GLOBAL_ASSETS_DIR}/encounter-thumbnails/`) ||
        imagePath.startsWith(`${GLOBAL_ASSETS_DIR}/player-thumbnails/`)
      );
      const isRecoveredId = id.startsWith('token-recovered-');
      const isAllowedRecoveredGlobalToken = !!imagePath && encounterOrPlayerTokenRefs.has(imagePath);

      if (!imagePath || !vaultFilePaths.has(imagePath)) {
        delete this.metadata.assets[id];
        needsSave = true;
        continue;
      }

      // Clean up previously over-broad recovered entries from global assets.
      if (
        isEncounterOrPlayerThumbnail ||
        (isRecoveredId && !isCollectionTokenPath && !isAllowedRecoveredGlobalToken)
      ) {
        delete this.metadata.assets[id];
        needsSave = true;
        continue;
      }

      if (isRecoveredId && imagePath) {
        const normalizedName = this.deriveRecoveredTokenName(imagePath);
        if (normalizedName && asset.name !== normalizedName) {
          asset.name = normalizedName;
          asset.modifiedAt = Date.now();
          needsSave = true;
        }
      }
    }

    const recoveredTokens = this.recoverTokenAssetsFromVaultFiles(vaultFiles);
    if (recoveredTokens.length > 0) {
      for (const token of recoveredTokens) {
        this.metadata.assets[token.id] = token;
      }
      needsSave = true;
    }

    if (needsSave) {
      await this.saveMetadata();
    }
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
        tags: this.normalizeTagArray(oldToken.tags),
        collection: 'default',
        createdAt,
        modifiedAt: typeof oldToken.modifiedAt === 'number' ? oldToken.modifiedAt : createdAt
      };
    }

    await this.saveMetadata();
  }

  private async saveMetadata(): Promise<void> {
    if (!this.metadata) return;
    
    const content = JSON.stringify(this.metadata, null, 2);
    const oldPath = 'atlas-vtt/assets-metadata.json';
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
  async createCollection(name: string, description?: string): Promise<CollectionMetadata> {
    await this.ensureLoaded();
    this.assertCollectionNameFree(name);

    const id = this.freeCollectionId(name);
    const now = Date.now();
    
    const collection: CollectionMetadata = {
      id,
      uid: crypto.randomUUID(),
      version: 1,
      publisherId: this.metadata!.vaultId!,
      name,
      ...(description !== undefined && { description }),
      tags: {}, // Initialize empty tags
      settings: { conditions: [] },
      createdAt: now,
      modifiedAt: now
    };

    await this.ensureCollectionStructure(id);
    
    this.metadata!.collections[id] = collection;
    
    await this.saveMetadata();
    
    return collection;
  }

  async getCollections(): Promise<CollectionMetadata[]> {
    await this.ensureLoaded();

    return Object.values(this.metadata!.collections);
  }

  /** Finds a collection by its display name or id; the UI lists names, metadata is keyed by id, and a name wins over another collection's id. */
  async resolveCollectionId(nameOrId: string): Promise<string | null> {
    const collections = await this.getCollections();
    return (collections.find((collection) => collection.name === nameOrId) ?? collections.find((collection) => collection.id === nameOrId))?.id ?? null;
  }

  async renameCollection(collectionId: string, name: string): Promise<void> {
    await this.ensureLoaded();
    const collection = this.metadata!.collections[collectionId];
    if (!collection) throw new Error(`Collection ${collectionId} not found`);
    this.assertCollectionNameFree(name, collectionId);
    collection.name = name;
    collection.modifiedAt = Date.now();
    await this.saveMetadata();
  }

  async deleteCollection(collectionId: string): Promise<void> {
    if (!this.metadata || collectionId === 'default') {
      return; // Can't delete default collection
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

  /** Persists a fully built asset: data file, metadata entry and onboarding flag. */
  private async registerAsset<A extends Asset>(newAsset: A): Promise<A> {
    await this.ensureLoaded();

    if (newAsset.type !== 'token' && newAsset.type !== 'map' && newAsset.type !== 'note' && !newAsset.filePath) {
      newAsset.filePath = this.getAssetPath(newAsset);
    }

    // Ensure collection exists
    if (!this.metadata!.collections[newAsset.collection]) {
      await this.createCollection(newAsset.collection);
    }

    // Save asset data if needed
    if (newAsset.type === 'map') {
      const mapJsonPath = `${COLLECTIONS_DIR}/${newAsset.collection}/maps/${newAsset.id}.json`;
      await this.app.vault.create(mapJsonPath, this.serializeMapAsset(newAsset));
    } else if (newAsset.type !== 'token' && newAsset.type !== 'note') {
      const content = JSON.stringify(newAsset.data, null, 2) || '{}';
      await this.app.vault.create(this.getAssetPath(newAsset), content);
    }

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

    if (newAsset.type === 'token') SettingsService.forApp(this.app)?.markTokenImported();
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

    // If collection is being changed, move the asset
    if (updates.collection && updates.collection !== asset.collection) {
      await this.moveAssetToCollection(id, updates.collection);
      return;
    }

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

  private async moveAssetToCollection(assetId: string, targetCollection: string): Promise<void> {
    await this.ensureLoaded();

    const asset = this.metadata!.assets[assetId];
    if (!asset) return;

    // Ensure target collection exists
    if (!this.metadata!.collections[targetCollection]) {
      await this.createCollection(targetCollection);
    }

    const oldPath = this.getAssetPath(asset);
    const updatedAsset = { ...asset, collection: targetCollection, modifiedAt: Date.now() };
    const oldCollectionPrefix = `${COLLECTIONS_DIR}/${asset.collection}/`;
    if (
      (asset.type === 'statblock' ||
        asset.type === 'character' ||
        asset.type === 'scene' ||
        asset.type === 'encounter' ||
        asset.type === 'player') &&
      asset.filePath
    ) {
      if (asset.filePath.startsWith(oldCollectionPrefix)) {
        const relativePath = asset.filePath.substring(oldCollectionPrefix.length);
        updatedAsset.filePath = `${COLLECTIONS_DIR}/${targetCollection}/${relativePath}`;
      } else {
        delete updatedAsset.filePath;
      }
    }
    const newPath = this.getAssetPath(updatedAsset);

    // Move the file
    try {
      if (oldPath !== newPath) {
        const newParent = newPath.substring(0, newPath.lastIndexOf('/'));
        await this.ensureDirectory(newParent);
        const file = this.app.vault.getAbstractFileByPath(oldPath);
        if (file instanceof TFile) {
          await this.app.fileManager.renameFile(file, newPath);
        }
      }
    } catch (error) {
      console.error('[AssetService] Error moving asset file:', error);
      return;
    }

    // Update metadata
    this.metadata!.assets[assetId] = updatedAsset;
    await this.saveMetadata();
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
    let candidate = name;
    for (let n = 2; this.findCollectionByName(candidate, exceptId); n++) candidate = `${name} (${n})`;
    return candidate;
  }

  /** A new id derived from `name` that no collection uses yet. */
  async freeCollectionIdFor(name: string): Promise<string> {
    await this.ensureLoaded();
    return this.freeCollectionId(name);
  }

  private freeCollectionId(name: string): string {
    const base = name.trim().toLowerCase().replace(/[\s/\\]+/g, '-').replace(/^\.+/, '') || 'collection';
    // A leftover folder of a deleted collection must not leak its files into the new one.
    const isTaken = (id: string): boolean => Boolean(this.metadata!.collections[id] || this.app.vault.getAbstractFileByPath(`${COLLECTIONS_DIR}/${id}`));
    let id = base;
    for (let n = 2; isTaken(id); n++) id = `${base}-${n}`;
    return id;
  }

  private findCollectionByName(name: string, exceptId?: string): CollectionMetadata | undefined {
    const wanted = name.trim().toLocaleLowerCase();
    return Object.values(this.metadata!.collections)
      .find((collection) => collection.id !== exceptId && collection.name.trim().toLocaleLowerCase() === wanted);
  }

  private assertCollectionNameFree(name: string, exceptId?: string): void {
    if (this.findCollectionByName(name, exceptId)) throw new Error(`A collection named "${name.trim()}" already exists`);
  }

  /** Stores the release a publisher just exported, once the export has been written. */
  async recordCollectionRelease(collectionId: string, release: { version: number; releasedAt: number; author?: string | undefined }): Promise<void> {
    await this.ensureLoaded();
    const collection = this.metadata!.collections[collectionId];
    if (!collection) throw new Error(`Collection ${collectionId} not found`);
    collection.version = release.version;
    collection.releasedAt = release.releasedAt;
    if (release.author === undefined) delete collection.author;
    else collection.author = release.author;
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
    this.assertCollectionNameFree(name, collectionId);
    collection.uid = uid;
    collection.name = name;
    collection.version = 1;
    collection.publisherId = this.metadata!.vaultId!;
    delete collection.releasedAt;
    collection.modifiedAt = Date.now();
    await this.saveMetadata();
    return collection;
  }

  /**
   * Records an imported collection and its assets in one metadata save. The
   * files must already be in the vault at the paths the assets reference.
   */
  async commitCollectionImport({ collectionId, collection, upsert, remove }: CollectionImportCommit): Promise<void> {
    await this.ensureLoaded();
    this.assertCollectionNameFree(collection.name, collectionId);
    await this.ensureCollectionStructure(collectionId);
    // Changes go to a copy that replaces the index only once it is saved, so a failed save leaves nothing half-applied.
    const current = this.metadata!;
    const next: AssetMetadata = {
      ...current,
      collections: { ...current.collections, [collectionId]: { ...collection, id: collectionId } },
      assets: { ...current.assets },
    };
    for (const id of remove) delete next.assets[id];
    for (const asset of upsert) next.assets[asset.id] = { ...asset, collection: collectionId };
    this.metadata = next;
    try {
      await this.saveMetadata();
    } catch (error) {
      this.metadata = current;
      throw error;
    }
    if (upsert.some((asset) => asset.type === 'token')) SettingsService.forApp(this.app)?.markTokenImported();
  }

  // Backward compatibility methods
  async addTokenAsset(asset: Omit<TokenAsset, 'id' | 'createdAt' | 'modifiedAt' | 'type'>): Promise<TokenAsset> {
    return this.registerAsset<TokenAsset>({ ...asset, type: 'token', ...this.createAssetIdentity('token') });
  }

  async getTokenAssets(): Promise<TokenAsset[]> {
    return this.getAssets(undefined, 'token');
  }

  async deleteTokenAsset(id: string): Promise<void> {
    await this.deleteAsset(id);
  }

  async updateTokenAsset(id: string, updates: Partial<Omit<TokenAsset, 'id' | 'createdAt' | 'type'>>): Promise<void> {
    await this.updateAsset(id, updates);
  }

  async createEncounter(encounterData: Omit<EncounterAsset, 'id' | 'createdAt' | 'modifiedAt' | 'type' | 'collection'>): Promise<EncounterAsset> {
    const encounter: EncounterAsset = {
      ...encounterData,
      ...this.createAssetIdentity('encounter'),
      type: 'encounter',
      collection: 'default', // Use default collection
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

  async refreshMetadata(): Promise<void> {
    await this.loadMetadata();
  }

  /**
   * Migrate existing tags to collection-based system
   */
  private async migrateTagsToCollections(): Promise<void> {
    if (!this.metadata) return;
    
    // Check if collections have tags property
    let needsMigration = false;
    Object.values(this.metadata.collections).forEach(collection => {
      if (!collection.tags) {
        collection.tags = {};
        needsMigration = true;
      }
    });
    
    if (needsMigration) {
      // Collect all unique tags from assets and create them in their collections
      const tagsByCollection = new Map<string, Set<string>>();
      
      Object.values(this.metadata.assets).forEach(asset => {
        if (asset.tags && asset.tags.length > 0) {
          const collectionId = asset.collection || 'default';
          if (!tagsByCollection.has(collectionId)) {
            tagsByCollection.set(collectionId, new Set<string>());
          }
          asset.tags.forEach(tag => {
            tagsByCollection.get(collectionId)!.add(tag);
          });
        }
      });
      
      // Create tags in collections
      tagsByCollection.forEach((tags, collectionId) => {
        const collection = this.metadata!.collections[collectionId];
        if (collection) {
          tags.forEach(tagName => {
            const tagId = tagName.toLowerCase().replace(/\s+/g, '-');
            collection.tags[tagId] = {
              id: tagId,
              name: tagName
            };
          });
        }
      });
      
      await this.saveMetadata();
    }
  }

  /**
   * Get all unique registered and assigned tags across all collections.
   */
  async getAllTags(): Promise<string[]> {
    await this.ensureLoaded();
    if (!this.metadata) return [];
    
    const tags = new Set<string>();
    Object.values(this.metadata.collections).forEach(collection => {
      Object.values(collection.tags ?? {}).forEach(tag => tags.add(tag.name));
    });
    Object.values(this.metadata.assets).forEach(asset => {
      asset.tags.forEach(tag => tags.add(tag));
    });
    
    return Array.from(tags).sort();
  }

  /**
   * Get all tags for a specific collection
   */
  async getCollectionTags(collectionId: string): Promise<TagMetadata[]> {
    await this.ensureLoaded();
    if (!this.metadata) return [];
    
    const collection = this.metadata.collections[collectionId];
    if (!collection || !collection.tags) return [];
    
    return Object.values(collection.tags);
  }

  /**
   * Create a new tag in a collection
   */
  async createTag(collectionId: string, tagName: string): Promise<TagMetadata> {
    await this.ensureLoaded();
    if (!this.metadata) throw new Error('Metadata not loaded');
    
    const collection = this.metadata.collections[collectionId];
    if (!collection) throw new Error(`Collection ${collectionId} not found`);
    
    // Initialize tags if not present
    if (!collection.tags) {
      collection.tags = {};
    }
    
    // Create tag with ID based on name
    const tagId = tagName.toLowerCase().replace(/\s+/g, '-');
    const tag: TagMetadata = {
      id: tagId,
      name: tagName
    };
    
    collection.tags[tagId] = tag;
    await this.saveMetadata();
    
    return tag;
  }

  /**
   * Delete a tag from a collection and remove it from all assets
   */
  async deleteTag(collectionId: string, tagId: string): Promise<void> {
    await this.ensureLoaded();
    if (!this.metadata) throw new Error('Metadata not loaded');
    
    const collection = this.metadata.collections[collectionId];
    if (!collection || !collection.tags) return;
    
    // Remove tag from collection
    delete collection.tags[tagId];
    
    // Remove tag from all assets in this collection
    Object.values(this.metadata.assets).forEach(asset => {
      if (asset.collection === collectionId) {
        asset.tags = asset.tags.filter(t => t !== tagId);
      }
    });
    
    await this.saveMetadata();
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
    await this.saveMetadata();
  }

  /** Get settings for a collection, returns defaults if none set */
  getCollectionSettings(collectionId: string): CollectionSettings {
    const collection = this.metadata?.collections[collectionId];
    return collection?.settings ?? { conditions: [] };
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
