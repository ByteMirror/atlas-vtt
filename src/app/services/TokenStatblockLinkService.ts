import { StatblockTokenImportService } from './StatblockTokenImportService';
import { App, TFile, Notice, Modal } from 'obsidian';
import { EventEmitter } from 'events';
import { AssetService, type TokenAsset } from './AssetService';
import { loadStatblockOverrides } from '../packages/components/asset-manager/utils/statblockLoader';
import { parseResourceValue } from './statblockResources';
import { isPersistedMapEnvelope } from './MapPersistence';
import type { BaseToken, Character } from '../types';
import { ATLAS_NATIVE_MODAL_CLASSES } from '../ui/nativeModal';

export interface TokenStatblockLink {
  tokenImagePath: string;
  statblockPath: string;
}

/**
 * The statblock-derived fields of a token as stored in a map file. Linking
 * writes them onto the token whatever its `kind`, so all are optional here.
 */
type StoredStatblockFields = Pick<BaseToken, 'imagePath'>
  & Partial<Pick<Character, 'name' | 'hp' | 'stress' | 'maxStress' | 'maxHpOverridden' | 'maxStressOverridden' | 'difficulty' | 'statblockPath' | 'statblockName'>>
  & {
    /** Written by older versions and never read; still stripped on unlink. */
    maxHp?: number;
  };

/** A frontmatter scalar usable as text; YAML may hold a name or tier as a number. */
function frontmatterLabel(value: unknown): string | undefined {
  if (typeof value === 'number') return String(value);
  return typeof value === 'string' && value !== '' ? value : undefined;
}

function setOrDelete<T, K extends keyof T>(target: T, key: K, value: T[K] | undefined): void {
  if (value === undefined) {
    delete target[key];
  } else {
    target[key] = value;
  }
}

export interface LinkChangeEvent {
  type: 'linked' | 'unlinked';
  tokenImagePath: string;
  statblockPath: string | null;
  previousStatblockPath?: string | null;
}

/**
 * Centralized service for managing token-statblock relationships.
 * Ensures one-to-one relationships and handles all synchronization.
 */
export class TokenStatblockLinkService extends EventEmitter {
  private static instance: TokenStatblockLinkService | null = null;
  private app: App;
  private assetService: AssetService;
  
  private constructor(app: App) {
    super();
    this.app = app;
    this.assetService = AssetService.getInstance(app);
    // Initialize the AssetService
    this.assetService.initialize().catch(err => {
      console.error('[TokenStatblockLinkService] Failed to initialize AssetService:', err);
    });
  }
  
  static getInstance(app?: App): TokenStatblockLinkService {
    if (!TokenStatblockLinkService.instance) {
      if (!app) {
        throw new Error('TokenStatblockLinkService must be initialized with an App instance');
      }
      TokenStatblockLinkService.instance = new TokenStatblockLinkService(app);
    }
    return TokenStatblockLinkService.instance;
  }
  
  /**
   * Links the token asset identified by its image path to a statblock, keeping
   * the relationship one-to-one: a token previously using this statblock is
   * unlinked, as is this token's previous statblock. Map tokens spawned from
   * the image are updated too.
   */
  async linkTokenToStatblock(
    tokenImagePath: string, 
    statblockPath: string,
    options: { 
      showConfirmation?: boolean;
      updateStatblockAvatar?: boolean;
    } = {}
  ): Promise<boolean> {
    const { showConfirmation = true, updateStatblockAvatar = true } = options;
    
    // Get the statblock file
    const statblockFile = this.app.vault.getAbstractFileByPath(statblockPath);
    if (!(statblockFile instanceof TFile)) {
      new Notice(`Statblock not found: ${statblockPath}`);
      return false;
    }
    
    // Check if this statblock is already linked to another token
    const existingTokenPath = await this.getTokenLinkedToStatblock(statblockPath);
    if (existingTokenPath && existingTokenPath !== tokenImagePath) {
      if (showConfirmation) {
        const confirmed = await this.showConfirmationDialog(
          'Statblock Already Linked',
          `This statblock is already linked to another token. Do you want to unlink it and link to this token instead?`
        );
        if (!confirmed) return false;
      }
      
      // Unlink the existing token - make sure to clear its asset metadata
      await this.unlinkToken(existingTokenPath, { updateStatblockAvatar: false, notify: false });
    }
    
    // Check if this token is already linked to another statblock
    const currentStatblockPath = await this.getStatblockLinkedToToken(tokenImagePath);
    if (currentStatblockPath && currentStatblockPath !== statblockPath) {
      // Unlink from current statblock
      await this.unlinkToken(tokenImagePath, { updateStatblockAvatar: true, notify: false });
    }
    
    // Find the asset using improved path matching
    const asset = await this.findAssetByAnyPath(tokenImagePath);
    let finalTokenPath = tokenImagePath;
    
    if (asset) {
      // Use the asset's canonical imagePath for consistency
      finalTokenPath = asset.imagePath;
      await this.assetService.updateAsset(asset.id, { statblockPath });
      
      // Update the statblock's token-image field if requested
      if (updateStatblockAvatar) {
        await this.updateStatblockImage(statblockPath, finalTokenPath);
      }
    } else {
      // If we can't find the asset, still try to update the statblock if requested
      if (updateStatblockAvatar) {
        await this.updateStatblockImage(statblockPath, tokenImagePath);
      }
    }
    
    // Wait a bit to ensure the save has completed
    await new Promise(resolve => window.setTimeout(resolve, 100));
    
    // Force the AssetService to reload its metadata
    await this.assetService.refreshMetadata();
    
    // Emit event
    this.emit('link-changed', {
      type: 'linked',
      tokenImagePath: finalTokenPath,
      statblockPath,
      previousStatblockPath: currentStatblockPath
    });
    
    // Update all spawned tokens on all maps
    await this.updateAllSpawnedTokens(finalTokenPath, statblockPath);
    
    this.app.workspace.trigger('atlas-vtt:refresh-assets');
    
    // Show success notice
    new Notice(`Token linked to statblock successfully`);
    
    return true;
  }
  
  /**
   * Unlinks a token from its statblock.
   * `notify` fires the asset-manager refresh event; pass false when the unlink
   * is one step of a larger operation that refreshes once at the end.
   */
  async unlinkToken(
    tokenImagePath: string,
    options: { 
      updateStatblockAvatar?: boolean;
      notify?: boolean;
    } = {}
  ): Promise<boolean> {
    const { updateStatblockAvatar = true, notify = true } = options;
    
    // Get current statblock
    const statblockPath = await this.getStatblockLinkedToToken(tokenImagePath);
    if (!statblockPath) return true; // Already unlinked
    
    // Update the asset service
    const tokenAssets = (await this.assetService.getTokenAssets())
      .filter(asset => asset.imagePath === tokenImagePath);

    for (const asset of tokenAssets) {
      // Explicitly set statblockPath to undefined to trigger removal
      await this.assetService.updateAsset(asset.id, { statblockPath: undefined });
    }
    
    // Wait a bit to ensure the save has completed
    await new Promise(resolve => window.setTimeout(resolve, 100));
    
    // Force the AssetService to reload its metadata to avoid cache issues
    await this.assetService.refreshMetadata();
    
    if (notify) this.app.workspace.trigger('atlas-vtt:refresh-assets');
    
    // Show a notice to confirm unlinking
    new Notice(`Token unlinked from statblock`);
    
    // Clear the statblock's image if it still points at this token.
    if (updateStatblockAvatar) {
      const statblockFile = this.app.vault.getAbstractFileByPath(statblockPath);
      if (statblockFile instanceof TFile) {
        const currentImage = this.readStatblockImage(statblockFile);
        // Path comparison handles differing formats (app:// URLs, relative paths).
        if (currentImage && this.arePathsEquivalent(currentImage, tokenImagePath)) {
          await this.updateStatblockImage(statblockPath, null);
        }
      }
    }
    
    // Emit event
    this.emit('link-changed', {
      type: 'unlinked',
      tokenImagePath,
      statblockPath: null,
      previousStatblockPath: statblockPath
    });
    
    // Update all spawned tokens on all maps
    await this.updateAllSpawnedTokens(tokenImagePath, null);
    
    return true;
  }
  
  /**
   * Gets the statblock linked to a token.
   */
  async getStatblockLinkedToToken(tokenImagePath: string): Promise<string | null> {
    const tokenAssets = await this.assetService.getTokenAssets();
    const linked = tokenAssets.find(asset => asset.imagePath === tokenImagePath && asset.statblockPath);
    return linked?.statblockPath ?? null;
  }
  
  /**
   * Gets the token linked to a statblock.
   */
  async getTokenLinkedToStatblock(statblockPath: string): Promise<string | null> {
    // First check if any token assets have this statblock linked
    const tokenAssets = await this.assetService.getTokenAssets();
    const linkedToken = tokenAssets.find(asset => asset.statblockPath === statblockPath);
    if (linkedToken) {
      return linkedToken.imagePath;
    }
    
    return null;
  }

  /**
   * Creates a token asset from the statblock's own artwork and links it.
   *
   * The reverse of the usual flow: rather than making a token first and linking
   * it, this imports a statblock that already carries an image.
   *
   * Returns the created token's image path, or null when there is nothing to
   * import or a token is already linked.
   */
  async createTokenFromStatblockImage(statblockPath: string): Promise<string | null> {
    try {
      const result = await new StatblockTokenImportService(this.app, this.assetService).import([statblockPath], 'default');
      const item = result.items[0];
      if (item?.asset) {
        this.emit('link-changed', { type: 'linked', tokenImagePath: item.asset.imagePath, statblockPath });
        new Notice(`Created token from ${item.name}`);
        return item.asset.imagePath;
      }
      new Notice(item?.message ?? 'No token created.');
    } catch (error) {
      new Notice(error instanceof Error ? error.message : 'Could not import this statblock.');
    }
    return null;
  }

  /**
   * The statblock's image. Fantasy Statblocks' `image` is authoritative; the
   * legacy `token-image` from the removed in-house system is read as a fallback
   * so statblocks linked before the migration keep working.
   */
  public readStatblockImage(file: TFile): string | null {
    const frontmatter: Record<string, unknown> | undefined = this.app.metadataCache.getFileCache(file)?.frontmatter;
    const image = frontmatter?.image ?? frontmatter?.['token-image'];
    return typeof image === 'string' && image.length ? image : null;
  }

  /**
   * Writes the token image into the statblock's frontmatter.
   *
   * Fantasy Statblocks renders the `image` field, so that is the source of
   * truth. The legacy `token-image` field (from the removed in-house statblock
   * system) is still read elsewhere as a fallback but is no longer written; it
   * is cleared alongside `image` on unlink so a stale value cannot resurface.
   */
  private async updateStatblockImage(statblockPath: string, tokenImagePath: string | null): Promise<void> {
    const file = this.app.vault.getAbstractFileByPath(statblockPath);
    if (!(file instanceof TFile)) return;

    try {
      await this.app.fileManager.processFrontMatter(file, (frontmatter: Record<string, unknown>) => {
        if (tokenImagePath) {
          frontmatter.image = tokenImagePath;
        } else {
          delete frontmatter.image;
          delete frontmatter['token-image'];
        }
      });
    } catch (error) {
      console.error('[TokenStatblockLinkService] Failed to write statblock image:', error);
    }
  }
  /**
   * Updates all spawned tokens on all maps that use the given image.
   */
  private async updateAllSpawnedTokens(tokenImagePath: string, statblockPath: string | null): Promise<void> {
    const mapFiles = this.app.vault.getFiles().filter(f => f.extension === 'atlasmap');
    const statblockData = statblockPath ? await this.extractStatblockData(statblockPath) : null;

    /** Returns the rewritten map JSON, or null when no token on the map uses the image. */
    const rewriteMap = (content: string): string | null => {
      const mapData: unknown = JSON.parse(content);
      if (!isPersistedMapEnvelope(mapData)) return null;

      const tokens = mapData.state?.objects?.tokens;
      if (!tokens) return null;

      let modified = false;

      for (const token of Object.values<StoredStatblockFields>(tokens)) {
        if (token.imagePath === tokenImagePath) {
          if (statblockPath) {
            token.statblockPath = statblockPath;

            if (statblockData) {
              token.name = statblockData.name;
              token.hp = statblockData.hp;
              setOrDelete(token, 'stress', statblockData.stress);
              setOrDelete(token, 'maxStress', statblockData.maxStress);
              setOrDelete(token, 'difficulty', statblockData.difficulty);
              delete token.maxHpOverridden;
              delete token.maxStressOverridden;
            }
          } else {
            // Unlink from statblock - clear ALL statblock-derived data
            delete token.statblockPath;
            delete token.name;
            delete token.statblockName;
            delete token.hp;
            delete token.maxHp;
            delete token.stress;
            delete token.maxStress;
            delete token.maxHpOverridden;
            delete token.maxStressOverridden;
            delete token.difficulty;
          }
          modified = true;
        }
      }
      
      return modified ? JSON.stringify(mapData, null, 2) : null;
    };

    for (const mapFile of mapFiles) {
      try {
        if (rewriteMap(await this.app.vault.read(mapFile)) === null) continue;
        await this.app.vault.process(mapFile, (latest) => rewriteMap(latest) ?? latest);
      } catch (error) {
        console.error(`Error updating tokens in map ${mapFile.path}:`, error);
      }
    }
  }
  
  /**
   * Extracts relevant data from a statblock.
   */
  private async extractStatblockData(statblockPath: string): Promise<{
    name: string;
    hp: { current: number; max: number };
    stress?: number;
    maxStress?: number;
    difficulty?: string;
  } | null> {
    const file = this.app.vault.getAbstractFileByPath(statblockPath);
    if (!(file instanceof TFile)) return null;
    
    const metadata = this.app.metadataCache.getFileCache(file);
    const overrides = await loadStatblockOverrides(this.app, statblockPath);
    if (!metadata?.frontmatter && !overrides.name) return null;
    const fm: Record<string, unknown> = metadata?.frontmatter ?? {};
    const hp = overrides.hp ?? parseResourceValue(fm.hp ?? fm.Health ?? fm.health) ?? { current: 10, max: 10 };
    const stress = parseResourceValue(fm.stress, true);
    const difficulty = overrides.difficulty ?? frontmatterLabel(fm.tier) ?? frontmatterLabel(fm.difficulty);
    return {
      name: overrides.name ?? frontmatterLabel(fm.name) ?? 'Unknown',
      hp,
      ...(overrides.stress !== undefined
        ? { stress: overrides.stress, ...(overrides.maxStress !== undefined && { maxStress: overrides.maxStress }) }
        : stress ? { stress: stress.current, maxStress: stress.max } : {}),
      ...(difficulty !== undefined && { difficulty }),
    };
  }
  
  /**
   * Shows a confirmation dialog.
   */
  private async showConfirmationDialog(title: string, message: string): Promise<boolean> {
    return new Promise((resolve) => {
      let resolved = false;
      
      class ConfirmModal extends Modal {
        constructor(app: App) {
          super(app);
        }

        onOpen() {
          const { contentEl } = this;
          this.modalEl.addClass(...ATLAS_NATIVE_MODAL_CLASSES);
          this.titleEl.setText(title);
          contentEl.setText(message);
          
          contentEl.createDiv({ cls: "modal-button-container" }, (buttonContainer) => {
            buttonContainer.createEl("button", { text: "Cancel" }, (btn) => {
              btn.onclick = () => {
                resolved = true;
                this.close();
                resolve(false);
              };
            });
            
            buttonContainer.createEl("button", { text: "Confirm", cls: "mod-cta" }, (btn) => {
              btn.onclick = () => {
                resolved = true;
                this.close();
                resolve(true);
              };
            });
          });
        }

        onClose() {
          // Only resolve if we haven't already resolved via button click
          if (!resolved) {
            resolve(false);
          }
        }
      }
      
      const modal = new ConfirmModal(this.app);
      modal.open();
    });
  }
  
  /**
   * Normalizes a resource path for comparison by extracting the essential file path.
   */
  private normalizeResourcePath(path: string): string {
    if (!path) return '';
    
    // Handle resource URLs (app://) - extract the actual file path
    if (path.startsWith('app://')) {
      // Find the start of the actual file path (after the protocol and ID)
      // Pattern: app://[hash]/[actual-path]?[timestamp]
      const match = path.match(/app:\/\/[^/]+\/(.+?)(?:\?.*)?$/);
      if (match && match[1]) {
        const extractedPath = match[1];
        // Check if it contains atlas-vtt path - find the LAST occurrence to handle nested paths
        if (extractedPath.includes('/atlas-vtt/')) {
          // Find the last atlas-vtt anchor point to handle paths like /test-vault/atlas-vtt/
          const atlasIndex = extractedPath.lastIndexOf('/atlas-vtt/');
          if (atlasIndex !== -1) {
            const normalizedPath = extractedPath.substring(atlasIndex + 1); // Remove leading slash
            return normalizedPath;
          }
        }
        
        // Also check for atlas-vtt without leading slash
        if (extractedPath.includes('atlas-vtt/')) {
          const atlasIndex = extractedPath.lastIndexOf('atlas-vtt/');
          if (atlasIndex !== -1) {
            const normalizedPath = extractedPath.substring(atlasIndex);
            return normalizedPath;
          }
        }
        
        // If no atlas-vtt anchor, return as-is (might already be normalized)
        return extractedPath;
      }
    }
    
    // For regular paths, ensure they start with atlas-vtt/ if they don't already
    let normalized = path;
    if (normalized.startsWith('/')) {
      normalized = normalized.substring(1);
    }
    
    return normalized;
  }
  
  /**
   * Compares two paths to determine if they reference the same file.
   * Handles resource URLs vs file paths and timestamp differences.
   */
  public arePathsEquivalent(path1: string, path2: string): boolean {
    if (!path1 || !path2) return path1 === path2;
    
    const normalized1 = this.normalizeResourcePath(path1);
    const normalized2 = this.normalizeResourcePath(path2);
    
    const result = normalized1 === normalized2;
    return result;
  }
  
  /**
   * Finds an asset by any path format (resource URL or file path).
   */
  private async findAssetByAnyPath(path: string): Promise<TokenAsset | null> {
    const tokenAssets = await this.assetService.getTokenAssets();
    const normalizedSearchPath = this.normalizeResourcePath(path);
    
    for (const tokenAsset of tokenAssets) {
      if (tokenAsset.imagePath) {
        const assetNormalized = this.normalizeResourcePath(tokenAsset.imagePath);
        // Try both direct path match and normalized path match
        if (tokenAsset.imagePath === path || assetNormalized === normalizedSearchPath) {
          return tokenAsset;
        }
      }
    }
    
    return null;
  }
  
  /**
   * Cleanup method
   */
  destroy(): void {
    this.removeAllListeners();
    TokenStatblockLinkService.instance = null;
  }
}