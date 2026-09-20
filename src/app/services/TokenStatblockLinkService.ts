import { App, TFile, Notice, Modal } from 'obsidian';
import { EventEmitter } from 'events';
import { AssetService } from './AssetService';
import { loadStatblockOverrides } from '../packages/components/asset-manager/utils/statblockLoader';
import { parseResourceValue } from './statblockResources';

export interface TokenStatblockLink {
  tokenImagePath: string;
  statblockPath: string;
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
   * Links a character to a statblock, ensuring one-to-one relationship.
   * This will unlink any other characters that were using this statblock.
   */
  async linkCharacterToStatblock(
    characterId: string,
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
    
    // Check if this statblock is already linked to another character
    const existingCharacter = await this.getCharacterLinkedToStatblock(statblockPath);
    if (existingCharacter && existingCharacter.id !== characterId) {
      if (showConfirmation) {
        const confirmed = await this.showConfirmationDialog(
          'Statblock Already Linked',
          `This statblock is already linked to another character. Do you want to unlink it and link to this character instead?`
        );
        if (!confirmed) return false;
      }
      
      // Unlink the existing character
      await this.unlinkCharacter(existingCharacter.id, { updateStatblockAvatar: false });
    }
    
    // Update the character asset in AssetService
    try {
      const character = await this.assetService.getAssetById(characterId);
      if (character && character.type === 'character') {
        await this.assetService.updateAsset(characterId, {
          statblockPath: statblockPath
        });
        
        // Update the statblock's token-image field if requested
        if (updateStatblockAvatar && (character as any).imagePath) {
          await this.updateStatblockImage(statblockPath, (character as any).imagePath);
        }
        
        // Force the AssetService to reload its metadata
        await this.assetService.refreshMetadata();
        
        // Emit event
        this.emit('link-changed', {
          type: 'linked',
          tokenImagePath: (character as any).imagePath || '',
          statblockPath,
        } as LinkChangeEvent);
        
        // Update all spawned tokens on all maps
        if ((character as any).imagePath) {
          await this.updateAllSpawnedTokens((character as any).imagePath, statblockPath);
        }
        
        new Notice(`Character linked to statblock successfully`);
        return true;
      }
    } catch (error) {
      console.error('[TokenStatblockLinkService] Failed to link character:', error);
      new Notice('Failed to link character to statblock');
    }
    
    return false;
  }

  /**
   * Links a token to a statblock, ensuring one-to-one relationship.
   * This will unlink any other tokens that were using this statblock.
   * @deprecated Use linkCharacterToStatblock for new implementations
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
      await this.assetService.updateAsset(asset.id, {
        ...asset,
        statblockPath: statblockPath
      });
      
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
    } as LinkChangeEvent);
    
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
    const allAssets = await this.assetService.getAssets();
    const tokenAssets = allAssets.filter(asset => 
      asset.type === 'token' && (asset as any).imagePath === tokenImagePath
    );
    
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
    } as LinkChangeEvent);
    
    // Update all spawned tokens on all maps
    await this.updateAllSpawnedTokens(tokenImagePath, null);
    
    return true;
  }
  
  /**
   * Gets the statblock linked to a token.
   */
  async getStatblockLinkedToToken(tokenImagePath: string): Promise<string | null> {
    const allAssets = await this.assetService.getAssets();
    const tokenAssets = allAssets.filter(asset => 
      asset.type === 'token' && (asset as any).imagePath === tokenImagePath
    );
    
    for (const asset of tokenAssets) {
      if ((asset as any).statblockPath) {
        return (asset as any).statblockPath;
      }
    }
    return null;
  }
  
  /**
   * Gets the token linked to a statblock.
   */
  async getTokenLinkedToStatblock(statblockPath: string): Promise<string | null> {
    // First check if any token assets have this statblock linked
    const allAssets = await this.assetService.getAssets();
    const linkedTokenAssets = allAssets.filter(asset => 
      asset.type === 'token' && (asset as any).statblockPath === statblockPath
    );
    
    if (linkedTokenAssets.length > 0) {
      const firstLinkedToken = linkedTokenAssets[0] as any;
      return firstLinkedToken.imagePath;
    }
    
    // Otherwise fall back to the image recorded in the statblock's frontmatter.
    const statblockFile = this.app.vault.getAbstractFileByPath(statblockPath);
    if (!(statblockFile instanceof TFile)) return null;

    return this.readStatblockImage(statblockFile);
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
    const statblockFile = this.app.vault.getAbstractFileByPath(statblockPath);
    if (!(statblockFile instanceof TFile)) {
      new Notice('Statblock not found');
      return null;
    }

    const existing = await this.getTokenLinkedToStatblock(statblockPath);
    if (existing) {
      new Notice('This statblock already has a token');
      return null;
    }

    const image = this.readStatblockImage(statblockFile);
    if (!image) {
      new Notice('This statblock has no image to import');
      return null;
    }

    // The frontmatter may hold a wikilink or a bare vault path.
    const linkpath = image.replace(/(^\[\[|\]\]$)/g, '').split('|')[0] ?? '';
    const imageFile = this.app.metadataCache.getFirstLinkpathDest(linkpath, statblockPath);
    if (!imageFile) {
      new Notice(`Statblock image not found: ${linkpath}`);
      return null;
    }

    try {
      await this.assetService.addTokenAsset({
        name: statblockFile.basename,
        imagePath: imageFile.path,
        tags: [],
        collection: 'default',
        statblockPath,
      });
      await this.assetService.refreshMetadata();

      this.emit('link-changed', {
        type: 'linked',
        tokenImagePath: imageFile.path,
        statblockPath,
      } as LinkChangeEvent);

      new Notice(`Created token from ${statblockFile.basename}`);
      return imageFile.path;
    } catch (error) {
      console.error('[TokenStatblockLinkService] Failed to create token from statblock:', error);
      new Notice('Failed to create token from statblock image');
      return null;
    }
  }

  /**
   * The statblock's image. Fantasy Statblocks' `image` is authoritative; the
   * legacy `token-image` from the removed in-house system is read as a fallback
   * so statblocks linked before the migration keep working.
   */
  public readStatblockImage(file: TFile): string | null {
    const frontmatter = this.app.metadataCache.getFileCache(file)?.frontmatter;
    const image = frontmatter?.image ?? frontmatter?.['token-image'];
    return typeof image === 'string' && image.length ? image : null;
  }

  /**
   * Gets the character linked to a statblock.
   */
  async getCharacterLinkedToStatblock(statblockPath: string): Promise<any> {
    const allAssets = await this.assetService.getAssets(undefined, 'character');
    const linkedCharacters = allAssets.filter(asset => 
      (asset as any).statblockPath === statblockPath
    );
    
    if (linkedCharacters.length > 0) {
      const firstLinkedCharacter = linkedCharacters[0];
      return firstLinkedCharacter;
    }
    
    return null;
  }

  /**
   * Gets the statblock linked to a character.
   */
  async getStatblockLinkedToCharacter(characterId: string): Promise<string | null> {
    try {
      const character = await this.assetService.getAssetById(characterId);
      if (character && character.type === 'character') {
        return (character as any).statblockPath || null;
      }
    } catch (error) {
      console.error('[TokenStatblockLinkService] Failed to get character:', error);
    }
    return null;
  }

  /**
   * Unlinks a character from its statblock.
   */
  async unlinkCharacter(
    characterId: string,
    options: { 
      updateStatblockAvatar?: boolean;
    } = {}
  ): Promise<boolean> {
    const { updateStatblockAvatar = true } = options;
    
    try {
      const character = await this.assetService.getAssetById(characterId);
      if (!character || character.type !== 'character') {
        new Notice('Character not found');
        return false;
      }
      
      const statblockPath = (character as any).statblockPath;
      
      // Update the character to remove statblock link
      await this.assetService.updateAsset(characterId, {
        statblockPath: null
      });
      
      // Update the statblock's token-image field if requested
      if (updateStatblockAvatar && statblockPath) {
        await this.updateStatblockImage(statblockPath, null);
      }
      
      // Force the AssetService to reload its metadata
      await this.assetService.refreshMetadata();
      
      // Emit event
      if (statblockPath) {
        this.emit('link-changed', {
          type: 'unlinked',
          tokenImagePath: (character as any).imagePath || '',
          statblockPath: null,
          previousStatblockPath: statblockPath
        } as LinkChangeEvent);
        
        // Update all spawned tokens on all maps
        if ((character as any).imagePath) {
          await this.updateAllSpawnedTokens((character as any).imagePath, null);
        }
      }
      
      new Notice(`Character unlinked from statblock successfully`);
      return true;
      
    } catch (error) {
      console.error('[TokenStatblockLinkService] Failed to unlink character:', error);
      new Notice('Failed to unlink character from statblock');
      return false;
    }
  }
  
  /**
   * Updates the token-image field in a statblock's frontmatter.
   */
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
      await this.app.fileManager.processFrontMatter(file, (frontmatter) => {
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
      const mapData = JSON.parse(content) as Record<string, any>;
      
      if (!mapData.state?.objects?.tokens) return null;
      
      let modified = false;
      const tokens = mapData.state.objects.tokens;
      
      for (const tokenId in tokens) {
        const token = tokens[tokenId];
        if (token.imagePath === tokenImagePath || token.asset === tokenImagePath) {
          if (statblockPath) {
            token.statblockPath = statblockPath;

            if (statblockData) {
              token.name = statblockData.name;
              token.hp = statblockData.hp;
              token.maxHp = statblockData.maxHp;
              token.stress = statblockData.stress;
              token.maxStress = statblockData.maxStress;
              token.difficulty = statblockData.difficulty;
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
            delete token.difficulty;
            delete token.showNameplate;
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
    hp: { current: number; max: number } | number;
    maxHp: number;
    stress?: number;
    maxStress?: number;
    difficulty?: string;
  } | null> {
    const file = this.app.vault.getAbstractFileByPath(statblockPath);
    if (!(file instanceof TFile)) return null;
    
    const metadata = this.app.metadataCache.getFileCache(file);
    const overrides = await loadStatblockOverrides(this.app, statblockPath);
    if (!metadata?.frontmatter && !overrides.name) return null;
    const fm = metadata?.frontmatter ?? {};
    const hp = overrides.hp ?? parseResourceValue(fm.hp ?? fm.Health ?? fm.health) ?? { current: 10, max: 10 };
    const stress = parseResourceValue(fm.stress, true);
    return {
      name: overrides.name ?? fm.name ?? 'Unknown',
      hp,
      maxHp: hp.max,
      ...(overrides.stress !== undefined ? { stress: overrides.stress, maxStress: overrides.maxStress } :
        stress ? { stress: stress.current, maxStress: stress.max } : {}),
      difficulty: overrides.difficulty ?? fm.tier ?? fm.difficulty,
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
  private async findAssetByAnyPath(path: string): Promise<any> {
    // Get all token assets and search for matching paths
    const allAssets = await this.assetService.getAssets(undefined, 'token');
    const normalizedSearchPath = this.normalizeResourcePath(path);
    
    for (const assetData of allAssets) {
      // Cast to TokenAsset since we filtered for token type
      const tokenAsset = assetData as any;
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