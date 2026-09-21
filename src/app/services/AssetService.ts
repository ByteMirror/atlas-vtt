import { SettingsService } from './SettingsService';
import { App, TFile, TFolder } from 'obsidian';
import type { TokenStateSnapshot } from '../types';
import type { CellCoord, EncounterFormation } from '../encounters/encounterFormation';
import { showAtlasToast } from '../react/components/AtlasToast';
import { getDataFilePath } from '../utils/dataFileMigration';
import type { CollectionSettings } from '../types/collectionSettingsTypes';
import {
  isAssetMetadata,
  isCollectionExport,
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
  type: 'token';
  imagePath: string;
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

type GroupAsset = EncounterAsset | PlayerAsset;

/** Token lists of a group asset: the top-level one and the copy inside its JSON payload. */
function groupTokenRefs(asset: GroupAsset): GroupTokenRef[] {
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
  /** Integer version, bumped before re-export */
  version: number;
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
}

const ATLAS_VTT_DIR = 'atlas-vtt';
const COLLECTIONS_DIR = `${ATLAS_VTT_DIR}/collections`;
const GLOBAL_ASSETS_DIR = `${ATLAS_VTT_DIR}/assets`;
const ASSETS_METADATA_PATH = getDataFilePath(`${ATLAS_VTT_DIR}/assets-metadata.json`);

export class AssetService {
  private static instance: AssetService | null = null;
  private app: App;
  private metadata: AssetMetadata | null = null;

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

  async initialize(): Promise<void> {
    // Ensure base directories exist
    await this.ensureDirectory(ATLAS_VTT_DIR);
    await this.ensureDirectory(GLOBAL_ASSETS_DIR);
    await this.ensureDirectory(COLLECTIONS_DIR);
    
    // Create default collection if it doesn't exist
    await this.ensureDefaultCollection();
    
    // Load metadata
    await this.loadMetadata();
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
    const parts = path.split('/').filter(Boolean);
    let currentPath = '';

    for (const part of parts) {
      currentPath = currentPath ? `${currentPath}/${part}` : part;
      if (await this.app.vault.adapter.exists(currentPath)) {
        continue;
      }
      try {
        await this.app.vault.adapter.mkdir(currentPath);
      } catch (error) {
        if (!(error instanceof Error) || !error.message.includes('already exists')) {
          throw error;
        }
      }
    }
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

  // Collection management
  async createCollection(name: string, description?: string): Promise<CollectionMetadata> {
    if (!this.metadata) {
      await this.loadMetadata();
    }

    const id = name.toLowerCase().replace(/\s+/g, '-');
    const now = Date.now();
    
    const collection: CollectionMetadata = {
      id,
      uid: crypto.randomUUID(),
      version: 1,
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
    if (!this.metadata) {
      await this.loadMetadata();
    }

    return Object.values(this.metadata!.collections);
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

  private createAssetIdentity(type: Asset['type']): Pick<BaseAsset, 'id' | 'createdAt' | 'modifiedAt'> {
    const now = Date.now();
    return {
      id: `${type}-${now}-${Math.random().toString(36).substring(2, 8)}`,
      createdAt: now,
      modifiedAt: now
    };
  }

  /** Persists a fully built asset: data file, metadata entry and onboarding flag. */
  private async registerAsset<A extends Asset>(newAsset: A): Promise<A> {
    if (!this.metadata) {
      await this.loadMetadata();
    }

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
    await this.saveMetadata();

    if (newAsset.type === 'token') SettingsService.forApp(this.app)?.markTokenImported();
    return newAsset;
  }

  async getAssets<T extends Asset['type']>(collection: string | undefined, type: T): Promise<AssetOfType<T>[]>;
  async getAssets(collection?: string, type?: Asset['type']): Promise<Asset[]>;
  async getAssets(collection?: string, type?: Asset['type']): Promise<Asset[]> {
    await this.loadMetadata();

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
    if (!this.metadata) {
      await this.loadMetadata();
    }

    return this.metadata!.assets[id] || null;
  }

  async updateAsset(id: string, updates: AssetUpdates): Promise<void> {
    if (!this.metadata) {
      await this.loadMetadata();
    }

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
    if (!this.metadata) {
      await this.loadMetadata();
    }

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

    if (asset.type === 'token') {
      this.removeTokenReferencesFromGroups(asset.id);
    }

    // Remove from metadata
    delete this.metadata!.assets[id];
    await this.saveMetadata();
  }

  private async moveAssetToCollection(assetId: string, targetCollection: string): Promise<void> {
    if (!this.metadata) {
      await this.loadMetadata();
    }

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

  // Import/Export functionality
  async exportCollection(collectionId: string): Promise<Blob> {
    if (!this.metadata) {
      await this.loadMetadata();
    }

    const collection = this.metadata!.collections[collectionId];
    if (!collection) {
      throw new Error(`Collection ${collectionId} not found`);
    }

    // Get all assets in the collection
    const assets = Object.values(this.metadata!.assets)
      .filter(asset => asset.collection === collectionId);

    // Create a zip file with all collection data
    const { default: JSZip } = await import('jszip');
    const zip = new JSZip();

    // Add metadata
    const exportMetadata = {
      collection,
      assets,
      version: this.metadata!.version,
      exportDate: Date.now(),
      collectionUid: collection.uid,
      collectionVersion: collection.version,
    };
    zip.file('metadata.json', JSON.stringify(exportMetadata, null, 2));

    // Add all asset files and images
    const processedFiles = new Set<string>();
    
    for (const asset of assets) {
      // Handle asset data files (JSON files for statblocks, characters, etc.)
      const assetPath = this.getAssetPath(asset);
      const file = this.app.vault.getAbstractFileByPath(assetPath);
      
      if (file instanceof TFile && !processedFiles.has(assetPath)) {
        try {
          const content = await this.app.vault.readBinary(file);
          // For collection-specific files, preserve the relative path
          if (assetPath.startsWith(`${COLLECTIONS_DIR}/${collectionId}/`)) {
            const relativePath = assetPath.replace(`${COLLECTIONS_DIR}/${collectionId}/`, '');
            zip.file(relativePath, content);
          }
          // For global assets, place them in an assets folder
          else if (assetPath.startsWith(GLOBAL_ASSETS_DIR)) {
            const relativePath = assetPath.replace(`${ATLAS_VTT_DIR}/`, '');
            zip.file(relativePath, content);
          }
          processedFiles.add(assetPath);
        } catch (error) {
          console.error(`[AssetService] Error reading file ${assetPath}:`, error);
        }
      }
      
      // For tokens, also include their images from the global assets folder
      if (asset.type === 'token' && asset.imagePath) {
        const imageFile = this.app.vault.getAbstractFileByPath(asset.imagePath);
        if (imageFile instanceof TFile && !processedFiles.has(asset.imagePath)) {
          try {
            const content = await this.app.vault.readBinary(imageFile);
            const relativePath = asset.imagePath.replace(`${ATLAS_VTT_DIR}/`, '');
            zip.file(relativePath, content);
            processedFiles.add(asset.imagePath);
          } catch (error) {
            console.error(`[AssetService] Error reading image ${asset.imagePath}:`, error);
          }
        }
      }
    }

    // Include statblock .md files referenced by tokens
    for (const asset of assets) {
      if (asset.type === 'token') {
        const statblockPath = asset.statblockPath;
        if (statblockPath && !processedFiles.has(statblockPath)) {
          const sbFile = this.app.vault.getAbstractFileByPath(statblockPath);
          if (sbFile instanceof TFile) {
            try {
              const content = await this.app.vault.readBinary(sbFile);
              zip.file(`statblocks/${sbFile.name}`, content);
              processedFiles.add(statblockPath);
            } catch (error) {
              console.error(`[AssetService] Error reading statblock ${statblockPath}:`, error);
            }
          }
        }
      }
    }

    // Generate zip blob
    const zipBlob = await zip.generateAsync({ type: 'blob' });
    return zipBlob;
  }

  async importCollection(data: Blob): Promise<void> {
    const { default: JSZip } = await import('jszip');
    const zip = await JSZip.loadAsync(data);

    // Read metadata
    const metadataFile = zip.file('metadata.json');
    if (!metadataFile) {
      throw new Error('Invalid collection export: missing metadata.json');
    }

    const metadataContent = await metadataFile.async('string');
    const importData: unknown = JSON.parse(metadataContent);
    if (!isCollectionExport(importData)) {
      throw new Error('Invalid collection export: malformed metadata.json');
    }

    // Extract uid/version with backward compat for old exports
    const importUid = importData.collectionUid ?? importData.collection.uid;
    const importVersion = importData.collectionVersion ?? importData.collection.version ?? 1;

    // Check for existing collection with same UID
    const existingEntry = Object.entries(this.metadata!.collections)
      .find(([_, c]) => c.uid === importUid);

    let decision: 'create-new' | 'update' | 'already-current' | 'newer-exists';
    if (!existingEntry) {
      decision = 'create-new';
    } else if (importVersion > existingEntry[1].version) {
      decision = 'update';
    } else if (importVersion === existingEntry[1].version) {
      decision = 'already-current';
    } else {
      decision = 'newer-exists';
    }

    // Handle early-exit decisions
    if (decision === 'already-current') {
      showAtlasToast(`Collection "${importData.collection.name}" is already up to date (v${importVersion}).`);
      return;
    }
    if (decision === 'newer-exists') {
      showAtlasToast(`A newer version of "${importData.collection.name}" already exists locally (v${existingEntry![1].version} > v${importVersion}).`);
      return;
    }

    // Resolve collection ID based on decision
    let collectionId: string;
    if (decision === 'create-new') {
      const created = await this.createCollection(importData.collection.name, importData.collection.description);
      collectionId = created.id;
      // Overwrite UID and version with imported values
      const col = this.metadata!.collections[collectionId]!;
      col.uid = importUid;
      col.version = importVersion;
      col.settings = importData.collection.settings;
    } else {
      // decision === 'update'
      collectionId = existingEntry![0];
      const col = this.metadata!.collections[collectionId]!;
      col.version = importVersion;
      col.settings = importData.collection.settings;
      col.modifiedAt = Date.now();
    }

    // Import all assets
    for (const asset of importData.assets) {
      // Check if asset already exists
      if (this.metadata!.assets[asset.id]) {
        console.warn(`[AssetService] Asset ${asset.id} already exists, skipping`);
        continue;
      }

      // Handle token images (stored in the global assets folder)
      if (asset.type === 'token' && asset.imagePath) {
        const imagePath = asset.imagePath.replace(`${ATLAS_VTT_DIR}/`, '');
        const imageFile = zip.file(imagePath);
        if (imageFile) {
          const content = await imageFile.async('arraybuffer');
          const targetPath = `${ATLAS_VTT_DIR}/${imagePath}`;

          const parentPath = targetPath.substring(0, targetPath.lastIndexOf('/'));
          await this.ensureDirectory(parentPath);

          await this.app.vault.createBinary(targetPath, content);
        }
      }

      // Handle data files (statblocks, characters, scenes, encounters, players)
      if (asset.type === 'statblock' || asset.type === 'character' || asset.type === 'scene' || asset.type === 'encounter' || asset.type === 'player') {
        const fallbackDataPath = `${asset.type === 'encounter' ? 'encounters' : asset.type === 'player' ? 'players' : asset.type + 's'}/${asset.id}.json`;
        const dataPath =
          typeof asset.filePath === 'string'
            ? (asset.filePath.replace(/^atlas-vtt\/collections\/[^/]+\//, '') || fallbackDataPath)
            : fallbackDataPath;
        const dataFile = zip.file(dataPath);
        if (dataFile) {
          const content = await dataFile.async('arraybuffer');
          const targetPath = `${COLLECTIONS_DIR}/${collectionId}/${dataPath}`;

          const parentPath = targetPath.substring(0, targetPath.lastIndexOf('/'));
          await this.ensureDirectory(parentPath);

          await this.app.vault.createBinary(targetPath, content);
        }
      }

      // Add asset to metadata
      const importedAsset = {
        ...asset,
        collection: collectionId
      };
      if (typeof importedAsset.filePath === 'string') {
        importedAsset.filePath = (importedAsset.filePath)
          .replace(/^atlas-vtt\/collections\/[^/]+\//, `${COLLECTIONS_DIR}/${collectionId}/`);
      }
      this.metadata!.assets[asset.id] = importedAsset;
    }

    // Import statblock .md files
    const statblockImports: Promise<void>[] = [];
    zip.folder('statblocks')?.forEach((relativePath, file) => {
      if (!relativePath.endsWith('.md')) return;
      statblockImports.push((async (): Promise<void> => {
        try {
          const content = await file.async('arraybuffer');
          const targetPath = `${COLLECTIONS_DIR}/${collectionId}/statblocks/${relativePath}`;
          const parentPath = targetPath.substring(0, targetPath.lastIndexOf('/'));
          await this.ensureDirectory(parentPath);
          if (!this.app.vault.getAbstractFileByPath(targetPath)) {
            await this.app.vault.createBinary(targetPath, content);
          }
        } catch (error) {
          console.error(`[AssetService] Error importing statblock ${relativePath}:`, error);
        }
      })());
    });
    await Promise.all(statblockImports);

    // Save updated metadata and notify user
    await this.saveMetadata();
    if (importData.assets.some(asset => asset.type === 'token')) SettingsService.forApp(this.app)?.markTokenImported();
    const action = decision === 'create-new' ? 'Imported' : 'Updated';
    showAtlasToast(`${action} collection "${importData.collection.name}" (v${importVersion}).`);
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
    await this.loadMetadata();
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
    await this.loadMetadata();
    if (!this.metadata) return [];
    
    const collection = this.metadata.collections[collectionId];
    if (!collection || !collection.tags) return [];
    
    return Object.values(collection.tags);
  }

  /**
   * Create a new tag in a collection
   */
  async createTag(collectionId: string, tagName: string): Promise<TagMetadata> {
    await this.loadMetadata();
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
    await this.loadMetadata();
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
    await this.loadMetadata();
    if (!this.metadata) throw new Error('Metadata not loaded');
    
    const asset = this.metadata.assets[assetId];
    if (!asset) throw new Error(`Asset ${assetId} not found`);
    
    asset.tags = tags;
    asset.modifiedAt = Date.now();
    
    await this.saveMetadata();
  }

  /** Update the settings for a collection */
  async updateCollectionSettings(collectionId: string, settings: Partial<CollectionSettings>): Promise<void> {
    if (!this.metadata) await this.loadMetadata();
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
