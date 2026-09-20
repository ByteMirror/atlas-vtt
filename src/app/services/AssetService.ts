import { SettingsService } from './SettingsService';
import { App, TFile, TFolder } from 'obsidian';
import type { TokenStateSnapshot } from '../types';
import type { CellCoord, EncounterFormation } from '../encounters/encounterFormation';
import { showAtlasToast } from '../react/components/AtlasToast';
import { getDataFilePath } from '../utils/dataFileMigration';
import type { CollectionSettings } from '../types/collectionSettingsTypes';

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

export interface StatblockAsset extends BaseAsset {
  type: 'statblock';
  data: any; // Statblock data structure
}

export interface CharacterAsset extends BaseAsset {
  type: 'character';
  data: any; // Character data structure
}

export interface SceneAsset extends BaseAsset {
  type: 'scene';
  mapId?: string;
  data: any; // Scene data structure
}

export interface EncounterAsset extends BaseAsset {
  type: 'encounter';
  tokens: {
    id: string;
    name: string;
    imagePath: string;
    x?: number;
    y?: number;
    statblockPath?: string;
    size?: number;
    /** Cell offset from the encounter's anchor token (see EncounterFormation). */
    cell?: CellCoord;
    /** Pitch-normalised world offset from the anchor token. */
    offset?: { x: number; y: number };
    /** Full token state at save time (HP, conditions, statblock link, ...). Restored verbatim on spawn. */
    state?: TokenStateSnapshot;
  }[];
  /** Grid the token layout was captured on. Absent for encounters saved without positions. */
  formation?: EncounterFormation;
  difficulty?: 'easy' | 'medium' | 'hard' | 'deadly';
  thumbnailUrl?: string; // Generated thumbnail for the encounter
  data: any; // Encounter data structure
}

export interface PlayerAsset extends BaseAsset {
  type: 'player';
  tokens: {
    id: string;
    name: string;
    imagePath: string;
    x?: number;
    y?: number;
    statblockPath?: string;
    size?: number;
  }[];
  level?: number;
  class?: string;
  thumbnailUrl?: string; // Generated thumbnail for the player group
  data: any; // Player data structure
}

export type Asset = TokenAsset | MapAsset | NoteAsset | StatblockAsset | CharacterAsset | SceneAsset | EncounterAsset | PlayerAsset;

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
        const parsed = JSON.parse(content);

        // Check if we need to migrate from old format
        if (parsed && typeof parsed === 'object' && 'tokens' in parsed && !('assets' in parsed)) {
          // Migrate from old format
          await this.migrateFromOldFormat(parsed);
        } else if (parsed && typeof parsed === 'object' && 'assets' in parsed && 'collections' in parsed && 'version' in parsed) {
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

  private async readJsonFile(file: TFile): Promise<any> {
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
        const tokens = Array.isArray(asset.tokens)
          ? asset.tokens
          : Array.isArray(asset.data?.tokens)
            ? asset.data.tokens
            : [];
        for (const token of tokens) {
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
        if (!parsed || typeof parsed !== 'object') {
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
      const parsedObject = parsed && typeof parsed === 'object' ? parsed : {};
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
            ...(parsedObject as Record<string, unknown>),
            mapPath
          }
        };
        recoveredAssets.set(sceneAsset.id, sceneAsset);
        continue;
      }

      const assetType = folderType === 'encounters'
        ? 'encounter'
        : folderType === 'players'
          ? 'player'
          : folderType === 'characters'
            ? 'character'
            : 'statblock';
      const fallbackName = this.prettifyIdentifier(assetId);
      const baseAsset: Asset = {
        id: assetId,
        type: assetType,
        name: typeof parsedObject.name === 'string' && parsedObject.name.trim()
          ? parsedObject.name
          : fallbackName,
        filePath: file.path,
        tags,
        collection: collectionId,
        createdAt,
        modifiedAt,
        data: parsedObject
      } as Asset;
      recoveredAssets.set(baseAsset.id, baseAsset);
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
      const tokens = Array.isArray((asset as any).tokens)
        ? (asset as any).tokens
        : Array.isArray((asset as any).data?.tokens)
          ? (asset as any).data.tokens
          : [];
      for (const token of tokens) {
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

  private async migrateFromOldFormat(oldMetadata: any): Promise<void> {
    this.metadata = await this.createDefaultMetadata();
    
    // Migrate tokens
    if (oldMetadata.tokens) {
      for (const [id, token] of Object.entries(oldMetadata.tokens)) {
        const oldToken = token as any;
        
        // Keep image in the same location (global assets folder)
        const imagePath = oldToken.imagePath;
        
        const newToken: TokenAsset = {
          id,
          type: 'token',
          name: oldToken.name,
          imagePath: imagePath,
          tags: oldToken.tags || [],
          collection: 'default',
          createdAt: oldToken.createdAt,
          modifiedAt: oldToken.modifiedAt
        };
        
        this.metadata.assets[id] = newToken;
      }
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

  private propagateTokenReferenceUpdate(token: TokenAsset): boolean {
    if (!this.metadata) {
      return false;
    }

    const syncTokenList = (tokens: any[]): { changed: boolean; next: any[] } => {
      let changed = false;
      const next = tokens.map((tokenRef) => {
        if (!tokenRef || typeof tokenRef !== 'object' || tokenRef.id !== token.id) {
          return tokenRef;
        }

        const updatedRef: Record<string, unknown> = {
          ...tokenRef,
          name: token.name,
          imagePath: token.imagePath,
        };

        if (token.statblockPath !== undefined) {
          updatedRef.statblockPath = token.statblockPath;
        } else {
          delete updatedRef.statblockPath;
        }

        const unchanged =
          tokenRef.name === updatedRef.name &&
          tokenRef.imagePath === updatedRef.imagePath &&
          tokenRef.statblockPath === updatedRef.statblockPath;
        if (unchanged) {
          return tokenRef;
        }

        changed = true;
        return updatedRef;
      });

      return { changed, next };
    };

    let metadataChanged = false;
    for (const asset of Object.values(this.metadata.assets)) {
      if (asset.type !== 'encounter' && asset.type !== 'player') {
        continue;
      }

      let assetChanged = false;

      if (Array.isArray(asset.tokens)) {
        const result = syncTokenList(asset.tokens);
        if (result.changed) {
          asset.tokens = result.next;
          assetChanged = true;
        }
      }

      const dataTokens = asset.data?.tokens;
      if (Array.isArray(dataTokens)) {
        const result = syncTokenList(dataTokens);
        if (result.changed) {
          asset.data.tokens = result.next;
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

  private removeTokenReferencesFromGroups(tokenId: string): boolean {
    if (!this.metadata) {
      return false;
    }

    const removeFromList = (tokens: any[]): { changed: boolean; next: any[] } => {
      const next = tokens.filter((tokenRef) => !(tokenRef && typeof tokenRef === 'object' && tokenRef.id === tokenId));
      return { changed: next.length !== tokens.length, next };
    };

    let metadataChanged = false;
    for (const asset of Object.values(this.metadata.assets)) {
      if (asset.type !== 'encounter' && asset.type !== 'player') {
        continue;
      }

      let assetChanged = false;

      if (Array.isArray(asset.tokens)) {
        const result = removeFromList(asset.tokens);
        if (result.changed) {
          asset.tokens = result.next;
          assetChanged = true;
        }
      }

      const dataTokens = asset.data?.tokens;
      if (Array.isArray(dataTokens)) {
        const result = removeFromList(dataTokens);
        if (result.changed) {
          asset.data.tokens = result.next;
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
  async addAsset(asset: Omit<Asset, 'id' | 'createdAt' | 'modifiedAt'>): Promise<Asset> {
    if (!this.metadata) {
      await this.loadMetadata();
    }

    const now = Date.now();
    const id = `${asset.type}-${now}-${Math.random().toString(36).substring(2, 8)}`;
    
    const newAsset: Asset = {
      ...asset,
      id,
      createdAt: now,
      modifiedAt: now
    } as Asset;

    if (
      (newAsset.type === 'statblock' ||
        newAsset.type === 'character' ||
        newAsset.type === 'scene' ||
        newAsset.type === 'encounter' ||
        newAsset.type === 'player') &&
      !newAsset.filePath
    ) {
      newAsset.filePath = this.getAssetPath(newAsset);
    }

    // Ensure collection exists
    if (!this.metadata!.collections[asset.collection]) {
      await this.createCollection(asset.collection);
    }

    // Save asset data if needed
    if (asset.type === 'statblock' || asset.type === 'character' || asset.type === 'scene' || asset.type === 'encounter' || asset.type === 'player' || asset.type === 'map') {
      const assetPath = this.getAssetPath(newAsset);
      
      if (asset.type === 'map') {
        // For maps, create a JSON file with map metadata
        const mapData = {
          id: newAsset.id,
          name: newAsset.name,
          mapFilePath: (newAsset as MapAsset).mapFilePath,
          tags: newAsset.tags,
          collection: newAsset.collection,
          createdAt: newAsset.createdAt,
          modifiedAt: newAsset.modifiedAt
        };
        const content = JSON.stringify(mapData, null, 2);
        const mapJsonPath = `${COLLECTIONS_DIR}/${asset.collection}/maps/${newAsset.id}.json`;
        await this.app.vault.create(mapJsonPath, content);
      } else {
        const content = JSON.stringify((newAsset as any).data, null, 2) || '{}';
        await this.app.vault.create(assetPath, content);
      }
    }

    this.metadata!.assets[id] = newAsset;
    await this.saveMetadata();

    if (newAsset.type === 'token') SettingsService.forApp(this.app)?.markTokenImported();
    return newAsset;
  }

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

  async updateAsset(id: string, updates: Partial<Omit<Asset, 'id' | 'createdAt' | 'type'>> & Record<string, any>): Promise<void> {
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

    // First, check which properties in updates are undefined and should be removed
    const keysToRemove = Object.keys(updates).filter(key => updates[key] === undefined);
    
    // Create the updated asset
    const updatedAsset = {
      ...asset,
      ...updates,
      modifiedAt: Date.now()
    };
    
    // Remove properties that were explicitly set to undefined in updates
    keysToRemove.forEach(key => {
      delete (updatedAsset as Record<string, unknown>)[key];
    });
    
    // Debug logging for statblockPath updates
    
    this.metadata!.assets[id] = updatedAsset;

    if (asset.type === 'token') {
      this.propagateTokenReferenceUpdate(updatedAsset as TokenAsset);
    }

    // Update asset data file if needed
    if (asset.type === 'statblock' || asset.type === 'character' || asset.type === 'scene' || asset.type === 'encounter' || asset.type === 'player' || asset.type === 'map') {
      const assetPath = this.getAssetPath(this.metadata!.assets[id]);
      
      if (asset.type === 'map') {
        // For maps, update the JSON metadata file
        const mapData = {
          id: updatedAsset.id,
          name: updatedAsset.name,
          mapFilePath: (updatedAsset as MapAsset).mapFilePath,
          tags: updatedAsset.tags,
          collection: updatedAsset.collection,
          createdAt: updatedAsset.createdAt,
          modifiedAt: updatedAsset.modifiedAt
        };
        const content = JSON.stringify(mapData, null, 2);
        const file = this.app.vault.getAbstractFileByPath(assetPath);
        if (file instanceof TFile) {
          await this.app.vault.process(file, () => content);
        }
      } else if ('data' in updates) {
        const content = JSON.stringify(updates.data, null, 2) || '{}';
        const file = this.app.vault.getAbstractFileByPath(assetPath);
        if (file instanceof TFile) {
          await this.app.vault.process(file, () => content);
        }
      }
    }

    await this.saveMetadata();
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
            const content = await this.app.vault.read(sceneJsonFile);
            sceneData = JSON.parse(content);
          }
        } catch (error) {
          console.error('[AssetService] Error loading scene data:', error);
        }
      }
      
      if (sceneData?.mapPath) {
        try {
          // Delete the map file
          const mapFile = this.app.vault.getAbstractFileByPath(sceneData.mapPath);
          if (mapFile instanceof TFile) {
            // Close any leaves showing this file
            const leaves = this.app.workspace.getLeavesOfType('atlas-view');
            for (const leaf of leaves) {
              const state = leaf.view?.getState?.();
              if (state?.file === sceneData.mapPath) {
                leaf.detach();
              }
            }
            
            // Also check markdown leaves in case the .atlasmap file is open there
            const markdownLeaves = this.app.workspace.getLeavesOfType('markdown');
            for (const leaf of markdownLeaves) {
              const state = leaf.view?.getState?.();
              if (state?.file === sceneData.mapPath) {
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
    const importData = JSON.parse(metadataContent) as unknown as {
      collection: CollectionMetadata;
      assets: Asset[];
      version: number;
      exportDate: number;
      collectionUid?: string;
      collectionVersion?: number;
    };

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
    return await this.addAsset({ ...asset, type: 'token' }) as TokenAsset;
  }

  async getTokenAssets(): Promise<TokenAsset[]> {
    return await this.getAssets(undefined, 'token') as TokenAsset[];
  }

  async deleteTokenAsset(id: string): Promise<void> {
    await this.deleteAsset(id);
  }

  async updateTokenAsset(id: string, updates: Partial<Omit<TokenAsset, 'id' | 'createdAt' | 'type'>>): Promise<void> {
    await this.updateAsset(id, updates);
  }

  async createEncounter(encounterData: Omit<EncounterAsset, 'id' | 'createdAt' | 'modifiedAt' | 'type' | 'collection'>): Promise<EncounterAsset> {
    const encounter: Omit<EncounterAsset, 'id' | 'createdAt' | 'modifiedAt'> = {
      ...encounterData,
      type: 'encounter',
      collection: 'default', // Use default collection
      data: {
        tokens: encounterData.tokens,
        difficulty: encounterData.difficulty,
        formation: encounterData.formation,
      }
    };
    
    return await this.addAsset(encounter) as EncounterAsset;
  }

  async createPlayer(playerData: Omit<PlayerAsset, 'id' | 'createdAt' | 'modifiedAt' | 'type' | 'collection'>): Promise<PlayerAsset> {
    const player: Omit<PlayerAsset, 'id' | 'createdAt' | 'modifiedAt'> = {
      ...playerData,
      type: 'player',
      collection: 'default', // Use default collection
      data: {
        tokens: playerData.tokens,
        level: playerData.level,
        class: playerData.class,
      }
    };
    
    return await this.addAsset(player) as PlayerAsset;
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
