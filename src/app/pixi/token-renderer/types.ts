/**
 * Token Renderer Type Definitions
 * 
 * These interfaces model the current behavior of the TokenRenderer class
 * to enable future refactoring into focused modules.
 */

import type { Container, Texture, Application } from 'pixi.js';
import type { TokenEntity } from '../../types';
import type { GridSystem } from '../../grid/GridSystem';

/**
 * Token sprite creation and management
 */
export interface ITokenSpriteFactory {
  /**
   * Creates a complete token container with all visual elements
   * @param token The token entity data
   * @param texture The loaded texture for the token
   * @returns Promise resolving to the created container with token visuals
   */
  createTokenSprite(token: TokenEntity, texture: Texture): Promise<Container>;
  
  /**
   * Updates the size of a token sprite based on grid changes
   * @param tokenId The token identifier
   * @param container The token container to update
   * @param size The new size multiplier
   */
  updateTokenSize(tokenId: string, container: Container, size: number): void;
  
  /**
   * Updates the position of a token sprite
   * @param container The token container to update
   * @param x The new x coordinate
   * @param y The new y coordinate
   */
  updateTokenPosition(container: Container, x: number, y: number): void;
  
  /**
   * Updates the rotation of a token sprite
   * @param container The token container to update
   * @param rotation The rotation in degrees
   */
  updateTokenRotation(container: Container, rotation: number): void;
  
  /**
   * Destroys a token sprite and cleans up resources
   * @param tokenId The token identifier
   * @param container The token container to destroy
   */
  destroyTokenSprite(tokenId: string, container: Container): void;
}

/**
 * Texture loading and caching
 */
export interface ITextureCache {
  /**
   * Gets a texture from cache or loads it
   * @param imagePath The path to the image in the vault
   * @returns Promise resolving to the loaded texture
   */
  getTexture(imagePath: string): Promise<Texture>;
  
  /**
   * Load a texture for a token character object
   * @param character The character object containing imagePath
   * @returns Promise resolving to the loaded texture
   */
  loadTokenTexture(character: any): Promise<Texture>;
  
  /**
   * Gets a ring texture from cache or generates it
   * @param size The size of the ring
   * @param color The color of the ring
   * @param strokeWidth The width of the ring stroke
   * @returns The ring texture
   */
  getRingTexture(size: number, color: string, strokeWidth: number): Texture;
  
  /**
   * Gets a gradient texture from cache or generates it
   * @param width The width of the gradient
   * @param height The height of the gradient
   * @param innerColor The inner color
   * @param outerColor The outer color
   * @returns The gradient texture
   */
  getGradientTexture(width: number, height: number, innerColor: string, outerColor: string): Texture;
  
  /**
   * Clears a specific texture from cache
   * @param key The cache key to clear
   */
  clearTexture(key: string): void;
  
  /**
   * Destroys all cached textures and clears cache
   */
  destroyAll(): void;
}

/**
 * Token UI overlay management (HP bars, nameplates, etc.)
 */
export interface ITokenUIManager {
  /**
   * Creates UI elements for a token
   * @param tokenId The token identifier
   * @param container The token container to attach UI to
   * @param token The token entity data
   * @returns The TokenUIRenderer instance or null if not a character token
   */
  createTokenUI(tokenId: string, container: Container, token: TokenEntity): any;
  
  /**
   * Updates UI elements for a token
   * @param tokenId The token identifier
   * @param token The updated token entity data
   */
  updateTokenUI(tokenId: string, token: TokenEntity): void;
  
  /**
   * Updates selection UI for tokens
   * @param selectedTokenIds Array of selected token IDs
   */
  updateSelectionUI(selectedTokenIds: string[]): void;
  
  /**
   * Shows token controls UI (rotation, resize handles)
   * @param tokenId The token identifier
   * @param container The token container
   */
  showTokenControls(tokenId: string, container: Container): void;
  
  /**
   * Hides token controls UI
   */
  hideTokenControls(): void;
  
  /**
   * Destroys UI elements for a token
   * @param tokenId The token identifier
   */
  destroyTokenUI(tokenId: string): void;
  
  /**
   * Destroys all UI elements
   */
  destroyAll(): void;
}

/**
 * Token interaction handling (pointer events, context menus)
 */
export interface ITokenInteractionController {
  /**
   * Attaches interaction handlers to a token
   * @param tokenId The token identifier
   * @param container The token container
   * @param token The token entity data
   */
  attachInteractionHandlers(tokenId: string, container: Container, token: TokenEntity): void;
  
  /**
   * Removes interaction handlers from a token
   * @param tokenId The token identifier
   * @param container The token container
   */
  removeInteractionHandlers(tokenId: string, container: Container): void;
  
  /**
   * Sets up hover handlers for a token
   * @param tokenId The token identifier
   * @param container The token container
   * @param onHover Callback for hover start
   * @param onHoverEnd Callback for hover end
   */
  setupHoverHandlers(
    tokenId: string, 
    container: Container,
    onHover: (tokenId: string) => void,
    onHoverEnd: (tokenId: string) => void
  ): void;
  
  /**
   * Handles drag operations
   * @param tokenId The token identifier
   * @param startX Starting X coordinate
   * @param startY Starting Y coordinate
   * @param onMove Callback for drag movement
   * @param onEnd Callback for drag end
   */
  handleDrag(
    tokenId: string,
    startX: number,
    startY: number,
    onMove: (x: number, y: number) => void,
    onEnd: (finalX: number, finalY: number, path: Array<{x: number, y: number, timestamp: number}>) => void
  ): void;
  
  /**
   * Emits context menu event
   * @param tokenId The token identifier
   * @param x Screen X coordinate
   * @param y Screen Y coordinate
   */
  emitContextMenu(tokenId: string, x: number, y: number): void;
  
  /**
   * Cleans up all interaction handlers
   */
  destroyAll(): void;
}

/**
 * Token state synchronization between store and visuals
 */
export interface ITokenSyncService {
  /**
   * Initializes synchronization with the store
   */
  initialize(): void;
  
  /**
   * Forces synchronization of pending tokens
   */
  forceSyncTokens(): void;
  
  /**
   * Checks if a token is currently animating
   * @param tokenId The token identifier
   * @returns True if the token is animating
   */
  isTokenAnimating(tokenId: string): boolean;
  
  /**
   * Animates a token to a target position
   * @param tokenId The token identifier
   * @param targetX Target X coordinate
   * @param targetY Target Y coordinate
   */
  animateTokenToPosition(
    tokenId: string, 
    targetX: number, 
    targetY: number,
    options?: {
      transient?: boolean;
    }
  ): void;
  
  /**
   * Plays back a recorded token path
   * @param tokenId The token identifier
   * @param finalX Final X coordinate
   * @param finalY Final Y coordinate
   * @param path Array of path points with timestamps
   * @param originalDuration Duration of the original movement
   */
  playTokenPath(
    tokenId: string,
    finalX: number,
    finalY: number,
    path: Array<{x: number, y: number, timestamp: number}>,
    originalDuration: number
  ): void;
  
  /**
   * Cancels any ongoing animation for a token
   * @param tokenId The token identifier
   */
  cancelAnimation(tokenId: string): void;
  
  /**
   * Cleans up synchronization subscriptions
   */
  destroyAll(): void;
}

/**
 * Composite interface for the complete token renderer
 * This represents the current TokenRenderer's public API
 */
export interface ITokenRenderer {
  /**
   * Sets the PIXI application reference
   * @param app The PIXI application
   */
  setPixiApp(app: Application | null): void;
  
  /**
   * Gets the container holding all tokens
   * @returns The token container
   */
  getTokenContainer(): Container;
  
  /**
   * Gets all token sprites
   * @returns Record of token IDs to containers
   */
  getTokenSprites(): Record<string, Container>;
  
  /**
   * Updates all token sizes (typically after grid change)
   */
  updateAllTokenSizes(): void;
  
  /**
   * Sets callback for when all tokens are loaded
   * @param callback Function to call when loading completes
   */
  onWhenAllTokensLoaded(callback: () => void): void;
  
  /**
   * Destroys the token renderer and cleans up resources
   */
  destroy(): void;
}

/**
 * Configuration options for token renderer modules
 */
export interface ITokenRendererConfig {
  viewId?: string;
  gridSystem: GridSystem;
  pixiApp?: Application;
}
