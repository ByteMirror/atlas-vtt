import type { AtlasSettings } from '../services/SettingsService';
import type { LayerVisibility } from './playerSafeFrame';
import { Sprite, Container, Graphics, Circle, Texture, Application, FederatedPointerEvent } from "pixi.js";
import { Viewport } from "pixi-viewport";
import { App as ObsidianApp, TFile, parseYaml } from 'obsidian';
import type { TokenEntity } from "../types";
import type { GridSystem } from "../grid/GridSystem";
import { getDrawingBounds } from "./drawingGeometry";
import type { ViewAtlasStore } from '../storeFactory';
import { EventEmitter } from 'events';
import { StatblockDialogService } from '../services/StatblockDialogService';
import { AssetService } from '../services/AssetService';
import { AssetValidationService } from '../services/AssetValidationService';
import { TokenStatblockLinkService } from '../services/TokenStatblockLinkService';
import { SpriteFactory } from './token-renderer/SpriteFactory';
import { computeTokenPixelSize } from './token-renderer/tokenSizing';
import { TextureCache } from './token-renderer/TextureCache';
import { UIManager } from './token-renderer/UIManager';
import { InteractionController } from './token-renderer/InteractionController';
import { SyncService } from './token-renderer/SyncService';
import { updateInstanceBadge } from './token-renderer/InstanceBadge';
import type { ConditionDefinition } from '../types/collectionSettingsTypes';
import { setCanvasCursor } from './utils/canvasCursor';
import { markHandled, resetHandled } from './utils/handledEvents';
import { runInBackground } from '../utils/backgroundTask';

export class TokenRenderer {
  private obsApp: ObsidianApp;
  private viewport: Viewport;
  private gridSystem: GridSystem;
  private tokenContainer: Container;
  private tokenSprites: Record<string, Container | null> = {};
  private tokenRings: Record<string, Graphics | Sprite> = {};
  private _unsubscribeFromStore?: () => void;
  private _unsubscribeFromViewport?: () => void;
  private selectionOverlayUpdater: () => void;
  private store: ViewAtlasStore;
  private eventBus: EventEmitter;
  private statblockDialogService: StatblockDialogService;
  private assetService: AssetService;
  private assetValidationService?: AssetValidationService;
  private tokenStatblockLinkService: TokenStatblockLinkService;
  private spriteFactory: SpriteFactory;
  private textureCache: TextureCache;
  private uiManager: UIManager;
  private interactionController: InteractionController;
  private syncService: SyncService;
  
  
  // Batch sorting optimization
  private sortPending: boolean = false;
  private sortTimeout: number | null = null;
  
  // Store reference to PIXI app for renderer access
  private pixiApp: Application | null = null;
  
  // Track loading tokens
  private tokensLoading: Set<string> = new Set();
  private allTokensLoadedCallback?: () => void;
  private viewId: string;
  private themeObserver: MutationObserver | null = null;
  private isLocalPlayerMode: boolean = false;

  // Store event handlers for proper cleanup
  private _handleGridTypeChange?: EventListener;
  private _handleRotationUpdate?: EventListener;
  private _handleResizeUpdate?: EventListener;
  private _handleRotationEnded?: EventListener;
  private _handleResizeEnded?: EventListener;
  private _handleAssetPathChanged?: EventListener;

  // Fog provider pattern — wired by PixiRendererOrchestrator
  private fogHitTestProvider?: (worldX: number, worldY: number) => string | null;
  private fogClickHandler?: (fogId: string, e: FederatedPointerEvent) => void;
  private drawingHitTestProvider?: (worldX: number, worldY: number) => string | null;
  private drawingClickHandler?: (drawingId: string, e: FederatedPointerEvent) => void;
  private drawingDragStartHandler?: (e: FederatedPointerEvent) => void;

  // Pin provider pattern — wired by PixiRendererOrchestrator
  private pinHitTestProvider?: (worldX: number, worldY: number) => string | null;
  private pinClickHandler?: (pinId: string, e: FederatedPointerEvent) => void;
  private pinHoverHandler?: (type: 'over' | 'out', pinId: string, e: FederatedPointerEvent) => void;
  private lastHoveredPinId: string | null = null;

  // Wall provider pattern — wired by PixiRendererOrchestrator
  private wallPointerDownHandler?: (worldX: number, worldY: number, e: FederatedPointerEvent) => boolean;
  private wallPointerMoveHandler?: (worldX: number, worldY: number, e: FederatedPointerEvent) => void;
  private wallPointerUpHandler?: () => void;
  private wallDoubleClickHandler?: (worldX: number, worldY: number) => void;
  private wallContextMenuHandler?: (worldX: number, worldY: number, screenX: number, screenY: number) => void;
  private wallCursorProvider?: (worldX: number, worldY: number) => string;

  // Audio provider pattern — wired by PixiRendererOrchestrator
  private audioPointerDownHandler?: (worldX: number, worldY: number, e: FederatedPointerEvent) => boolean;
  private audioPointerMoveHandler?: (worldX: number, worldY: number, e: FederatedPointerEvent) => void;

  constructor(
    obsApp: ObsidianApp,
    viewport: Viewport,
    gridSystem: GridSystem,
    selectionOverlayUpdater: () => void,
    store: ViewAtlasStore,
    eventBus: EventEmitter,
    viewId?: string
  ) {
    this.obsApp = obsApp;
    this.viewport = viewport;
    this.gridSystem = gridSystem;
    this.selectionOverlayUpdater = selectionOverlayUpdater;
    this.store = store;
    this.eventBus = eventBus;
    this.viewId = viewId || `tokenrenderer-${Date.now()}-${Math.random()}`;
    this.statblockDialogService = new StatblockDialogService(obsApp);
    this.assetService = AssetService.getInstance(obsApp);
    this.assetService.initialize().catch(err => {
      console.error('[TokenRenderer] Failed to initialize AssetService:', err);
    });
    this.tokenStatblockLinkService = TokenStatblockLinkService.getInstance(obsApp);

    // Check if this is a player view to disable interactions
    const isPlayerView = this.store.getState().isPlayerView || false;

    // Initialize sprite factory
    this.spriteFactory = new SpriteFactory(this.gridSystem, isPlayerView);
    this.spriteFactory.setTokenRingTextureReadyCallback(() => {
      // Rebuild rings once the textured asset is available.
      this.updateAllTokenSizes();
    });
    void this.spriteFactory.preloadTokenRingTexture();

    // Initialize texture cache
    this.textureCache = new TextureCache(this.obsApp);

    // Initialize UI manager
    this.uiManager = new UIManager(this.viewport, this.store, this.viewId, isPlayerView);
    
    // Provide token sprite access to UI manager
    this.uiManager.setTokenSpriteProvider((tokenId: string) => this.tokenSprites[tokenId] || null);
    
    // Initialize interaction controller
    this.interactionController = new InteractionController(
      this.viewport, 
      this.store, 
      this.gridSystem, 
      this.eventBus,
      this.obsApp,
      isPlayerView
    );
    
    // Set up interaction controller callbacks
    this.interactionController.setTokenSpriteProvider((tokenId: string) => this.tokenSprites[tokenId] || null);
    this.interactionController.setUIPositionUpdater((tokenId: string, x: number, y: number) => 
      this.uiManager.syncUIPosition(tokenId, x, y)
    );
    this.interactionController.setControlsPositionUpdater((x: number, y: number, tokenSize: number) =>
      this.uiManager.updateControlsPosition(x, y, tokenSize)
    );
    this.interactionController.setHandlePositionUpdater(() => 
      this.uiManager.updateHandlePositions()
    );
    this.interactionController.setSelectionUpdateCallback(() => {
      if (typeof this.selectionOverlayUpdater === 'function') {
        this.selectionOverlayUpdater();
      }
    });
    
    // Wire condition definitions provider (shared by InteractionController + UIManager/TokenUIRenderers)
    const conditionDefsProvider = (): ConditionDefinition[] => {
      const mapPath = this.store.getState().mapPath;
      if (!mapPath) return [];
      const collectionId = this.assetService.getCollectionForMap(mapPath);
      if (!collectionId) return [];
      return this.assetService.getCollectionSettings(collectionId).conditions;
    };
    this.interactionController.conditionDefsProvider = conditionDefsProvider;
    this.uiManager.conditionDefsProvider = conditionDefsProvider;

    // Initialize sync service
    this.syncService = new SyncService(this.store, this.gridSystem, this.eventBus);
    
    // Set up sync service callbacks
    this.syncService.setTokenSpriteProvider((tokenId: string) => this.tokenSprites[tokenId] || null);
    this.syncService.setUIPositionUpdater((tokenId: string, x: number, y: number) => 
      this.uiManager.syncUIPosition(tokenId, x, y)
    );
    this.syncService.setControlsPositionUpdater((x: number, y: number, tokenSize: number) =>
      this.uiManager.updateControlsPosition(x, y, tokenSize)
    );
    this.syncService.setTokensChangedCallback((newTokens, prevTokens) =>
      runInBackground(this.syncTokens(newTokens, prevTokens), 'Token sync')
    );
    this.syncService.setAnimationStartCallback((tokenId: string) => {
      // Could add visual feedback for animation start
    });
    this.syncService.setAnimationEndCallback((tokenId: string) => {
      // Could add visual feedback for animation end
    });

    this.tokenContainer = new Container();
    this.tokenContainer.label = 'tokenContainer';
    this.tokenContainer.sortableChildren = true;
    this.tokenContainer.eventMode = 'passive';
    this.tokenContainer.interactiveChildren = false;
    this.tokenContainer.zIndex = 0;
    this.viewport.addChild(this.tokenContainer);

    // Initialize sync service
    this.syncService.initialize();

    // Set up viewport-level event handlers for token hit testing
    this.setupViewportEventHandlers();
    
    // Method to force sync tokens during loading (called before hiding loading screen)
    (this as any).forceSyncTokens = () => {
      this.syncService.forceSyncTokens();
    };
    
    
    // Only sync tokens if we have a valid map path
    // This prevents syncing with stale tokens from previous maps
    const currentMapPath = this.store.getState().mapPath;
    if (currentMapPath) {
      runInBackground(this.syncTokens(this.store.getState().objects.tokens, {}), 'Initial token sync');
      // Ensure all existing tokens (including ones without explicit ringColor)
      // get their ring rebuilt with the current renderer implementation.
      this.onWhenAllTokensLoaded(() => this.updateAllTokenSizes());
    }
    
    
    // Set up theme observer
    this.setupThemeObserver();
    
    
    
    // Listen for player mode changes (local player view toggle)
    const handlePlayerModeChange = (isPlayerMode: boolean) => {
      this.isLocalPlayerMode = isPlayerMode;
      this.refreshTokenVisibility();
    };
    
    this.eventBus.on('player-mode-changed', handlePlayerModeChange);

    // Listen for GM view toggle to update hidden token visibility
    let prevGMView = this.store.getState().isGMView;
    const gmViewUnsubscribe = this.store.subscribe((state) => {
      if (state.isGMView !== prevGMView) {
        prevGMView = state.isGMView;
        this.refreshTokenVisibility();
      }
    });
    const origUnsubGM = this._unsubscribeFromStore;
    this._unsubscribeFromStore = () => {
      gmViewUnsubscribe();
      origUnsubGM?.();
    };

    // Refresh instance badges when showInstanceBadges setting changes
    let prevShowBadges = this.store.getState().tokenSettings?.showInstanceBadges ?? true;
    const badgesUnsubscribe = this.store.subscribe((state) => {
      const showBadges = state.tokenSettings?.showInstanceBadges ?? true;
      if (showBadges !== prevShowBadges) {
        prevShowBadges = showBadges;
        this.refreshInstanceBadges();
      }
    });
    const origUnsubBadges = this._unsubscribeFromStore;
    this._unsubscribeFromStore = () => {
      badgesUnsubscribe();
      origUnsubBadges?.();
    };

    // Listen for map load events to properly sync tokens
    const handleMapLoaded = () => {
      // First, clear all existing token sprites (tokenSprites is an object, not a Map)
      for (const [, sprite] of Object.entries(this.tokenSprites)) {
        if (sprite) {
          sprite.destroy();
        }
      }
      this.tokenSprites = {};
      
      // Also clear token rings
      this.tokenRings = {};
      
      // Clear only token-specific UI elements, not the singleton controls
      // This preserves TokenControlsUI, TokenRotationUI, and TokenResizeUI
      this.uiManager.destroyAllTokenUIs();
      
      // Clear selection to ensure controls are hidden
      this.store.getState().clearSelection();
      
      // Then sync with the new map's tokens
      const currentTokens = this.store.getState().objects.tokens;
      runInBackground(this.syncTokens(currentTokens, {}), 'Token sync after map change');
      this.onWhenAllTokensLoaded(() => this.updateAllTokenSizes());
    };
    
    this.eventBus.on('map-loaded', handleMapLoaded);
    
    // Listen for grid type changes to re-snap tokens
    this._handleGridTypeChange = ((event: CustomEvent) => {
      this.resnapAllTokens();
    }) as EventListener;

    window.addEventListener('atlas-grid-type-changed', this._handleGridTypeChange);
    
    // Listen for rotation updates during drag
    this._handleRotationUpdate = ((event: CustomEvent) => {
      const tokenIds = event.detail?.tokenIds || [];
      const tokens = this.store.getState().objects.tokens;

      // Force re-sync specific tokens to update their rotation
      for (const tokenId of tokenIds) {
        const token = tokens[tokenId];
        if (token) {
          // Trigger visual update by calling syncTokens with just this token
          runInBackground(this.syncTokens({ [tokenId]: token }, { [tokenId]: token }), `Token sync for ${tokenId}`);
        }
      }
    }) as EventListener;

    window.addEventListener('atlas-tokens-rotation-update', this._handleRotationUpdate);
    
    // Listen for rotation start/end events to manage UI visibility
    this._handleRotationEnded = ((event: Event) => {
      // Re-show resize handles if tokens are still selected
      const selectedIds = this.store.getState().selectedIds;
      const isPlayerView = this.store.getState().isPlayerView;

      if (!isPlayerView && selectedIds.length > 0) {
        // Show resize handles for all selected tokens
        this.uiManager.getResizeUI()?.showHandles(selectedIds, this.tokenSprites as Record<string, Container>);
      }
    });

    // Listen for resize end events to re-show rotation handles
    this._handleResizeEnded = ((event: Event) => {
      // Re-show rotation handles if tokens are still selected
      const selectedIds = this.store.getState().selectedIds;
      const isPlayerView = this.store.getState().isPlayerView;

      if (!isPlayerView && selectedIds.length > 0) {
        // Show rotation handles for all selected tokens
        this.uiManager.getRotationUI()?.showHandles(selectedIds, this.tokenSprites as Record<string, Container>);
      }
    });

    window.addEventListener('atlas-token-rotation-ended', this._handleRotationEnded);
    window.addEventListener('atlas-token-resize-ended', this._handleResizeEnded);
    
    // Listen for resize updates during drag
    this._handleResizeUpdate = ((event: CustomEvent) => {
      const tokenIds = event.detail?.tokenIds || [];
      const tokens = this.store.getState().objects.tokens;

      // Get temporary sizes from resize UI
      for (const tokenId of tokenIds) {
        const token = tokens[tokenId];
        if (token) {
          const tempSize = this.uiManager.getResizeUI()?.getTemporarySize(tokenId);
          if (tempSize !== undefined) {
            // Update the visual size without storing to state
            const tokenGroup = this.tokenSprites[tokenId];
            if (tokenGroup instanceof Container) {
              // Find the sprite in the children (it's not always at index 0)
              let sprite: Sprite | null = null;
              for (const child of tokenGroup.children) {
                if (child instanceof Sprite) {
                  sprite = child;
                  break;
                }
              }

              if (sprite) {
                const tokenSize = computeTokenPixelSize(this.gridSystem.getOptions().size, tempSize);

                // Update sprite size
                sprite.width = tokenSize;
                sprite.height = tokenSize;

                // Update mask and hit area
                const maskRadius = tokenSize / 2;
                const circleMask = sprite.mask as Graphics;
                if (circleMask) {
                  circleMask.clear();
                  circleMask.circle(0, 0, maskRadius);
                  circleMask.fill(0xffffff);
                  circleMask.hitArea = new Circle(0, 0, maskRadius);
                }
                sprite.hitArea = new Circle(0, 0, maskRadius);

                // Update background
                const tokenBackground = tokenGroup.getChildByLabel('tokenBackground') as Graphics;
                if (tokenBackground) {
                  tokenBackground.clear();
                  tokenBackground.circle(0, 0, maskRadius);
                  tokenBackground.fill({ color: 0x000000, alpha: 0 });
                  tokenBackground.hitArea = new Circle(0, 0, maskRadius);
                }

                // Update token UI (health bar, nameplate) scale
                this.uiManager.syncUIScale(tokenId, tokenSize);

                // Always refresh ring, even when token has no explicit ringColor,
                // so default ring tokens stay in sync with renderer updates.
                const ringColor = (token as any).ringColor;
                this.updateTokenRing(tokenId, tokenGroup, tokenSize, ringColor);
              }
            }
          }
        }
      }
    }) as EventListener;

    window.addEventListener('atlas-tokens-resize-update', this._handleResizeUpdate);
    
    // Listen to statblock metadata changes
    const handleMetadataChange = this.obsApp.metadataCache.on('changed', async (file: TFile) => {
      // Check if this is a statblock file being edited
      const cache = this.obsApp.metadataCache.getFileCache(file);
      const metadata = cache;
      if (!metadata?.frontmatter) return;
      
      // Check if it's a character/statblock file (has HP or is marked as a character)
      const isCharacter = metadata.frontmatter.hp !== undefined || 
                         metadata.frontmatter.isCharacter === true ||
                         metadata.frontmatter.type === 'character';
      
      if (isCharacter) {
        const statblockPath = file.path;

        // Read through the link service so this listener and the writer agree
        // on which frontmatter key holds the statblock's image.
        const newTokenImage = this.tokenStatblockLinkService.readStatblockImage(file);
        if (newTokenImage) {
          // Get the current token linked to this statblock
          const currentTokenImage = await this.tokenStatblockLinkService.getTokenLinkedToStatblock(statblockPath);
          
          // If the token-image has changed, update the link
          if (!currentTokenImage || !this.tokenStatblockLinkService.arePathsEquivalent(currentTokenImage, newTokenImage)) {
            // Use the centralized service to link the new token to the statblock
            // This will automatically handle unlinking the old token and updating all instances
            await this.tokenStatblockLinkService.linkTokenToStatblock(
              newTokenImage,
              statblockPath,
              { 
                showConfirmation: false, // No confirmation needed for metadata-driven updates
                updateStatblockAvatar: false // We're responding to a statblock change, don't update it again
              }
            );
          }
        } else {
          // If token-image was removed, check if we need to unlink
          const currentTokenImage = await this.tokenStatblockLinkService.getTokenLinkedToStatblock(statblockPath);
          if (currentTokenImage) {
            // Unlink the token from this statblock
            await this.tokenStatblockLinkService.unlinkToken(
              currentTokenImage,
              { updateStatblockAvatar: false } // We're responding to a statblock change, don't update it again
            );
          }
        }
        
        // Update tokens on the current map that are linked to this statblock with new data
        const tokens = this.store.getState().objects.tokens;
        for (const [tokenId, token] of Object.entries(tokens)) {
          const character = token as any;
          if (character.statblockPath === statblockPath) {
            // Update token with fresh data from the statblock
            let updates: any = {};
            
            const frontmatter = metadata.frontmatter;
            if (frontmatter) {
              // Extract HP - handle both formats
              if (typeof frontmatter.hp === 'number') {
                updates.hp = { current: character.hp?.current ?? frontmatter.hp, max: frontmatter.hp };
              } else if (typeof frontmatter.hp === 'object' && frontmatter.hp !== null) {
                updates.hp = {
                  current: character.hp?.current ?? frontmatter.hp.current ?? frontmatter.hp.max ?? 0,
                  max: frontmatter.hp.max || frontmatter.hp.current || 0
                };
              }
              
              // Update other attributes (but preserve current values like stress)
              updates.name = frontmatter.name || character.name;
              
              if (frontmatter.stress !== undefined) {
                updates.maxStress = frontmatter.stress;
                // Preserve current stress, don't reset it
                if (character.stress === undefined) {
                  updates.stress = 0;
                }
              }
              
              if (frontmatter.difficulty !== undefined) {
                updates.difficulty = frontmatter.difficulty;
              }
              
              // Update the token image if it has changed
              if (newTokenImage && character.imagePath !== newTokenImage) {
                updates.imagePath = newTokenImage;
              }
            }
            
            if (Object.keys(updates).length > 0) {
              this.store.getState().updateToken(tokenId, updates);
            }
          }
        }
      }
    });
    
    // Listen for token-statblock link changes from the centralized service
    const handleLinkChange = (event: any) => {
      // Find tokens on the current map that use the affected image
      const tokens = this.store.getState().objects.tokens;
      const affectedTokenIds: string[] = [];
      
      for (const [tokenId, token] of Object.entries(tokens)) {
        const tokenImagePath = (token as any).imagePath;
        if (tokenImagePath === event.tokenImagePath) {
          affectedTokenIds.push(tokenId);
        }
      }
      
      // Update affected tokens based on the event
      if (event.type === 'linked' && event.statblockPath) {
        // Token was linked to a statblock - update all instances with statblock data
        void this.updateTokensWithStatblockData(affectedTokenIds, event.statblockPath);
      } else if (event.type === 'unlinked') {
        // Token was unlinked from statblock - clear ALL statblock-derived data
        for (const tokenId of affectedTokenIds) {
          const token = tokens[tokenId];
          if (token) {
            this.store.getState().updateToken(tokenId, {
              statblockPath: undefined,
              name: undefined,
              statblockName: undefined,
              hp: undefined,
              stress: undefined,
              difficulty: undefined,
              showNameplate: false
            } as any);
          }
        }
      }
    };
    
    // Subscribe to link changes
    this.tokenStatblockLinkService.on('link-changed', handleLinkChange);
    
    // Store cleanup function
    const originalUnsubscribe = this._unsubscribeFromViewport;
    this._unsubscribeFromViewport = () => {
      if (originalUnsubscribe) originalUnsubscribe();
      // Clean up player mode listener
      this.eventBus.off('player-mode-changed', handlePlayerModeChange);
      // Clean up map load listeners
      this.eventBus.off('map-loaded', handleMapLoaded);
      // Clean up metadata change listener
      this.obsApp.metadataCache.offref(handleMetadataChange);
      // Clean up link change listener
      if (this.tokenStatblockLinkService && typeof this.tokenStatblockLinkService.off === 'function') {
        this.tokenStatblockLinkService.off('link-changed', handleLinkChange);
      }
    };
  }
  
  public onWhenAllTokensLoaded(callback: () => void): void {
    this.allTokensLoadedCallback = callback;
    
    // If no tokens are loading, call immediately
    if (this.tokensLoading.size === 0) {
      callback();
    }
  }

  // Backward-compatible alias used by older call sites during renderer initialization.
  public setAllTokensLoadedCallback(callback: () => void): void {
    this.onWhenAllTokensLoaded(callback);
  }
  
  private checkAllTokensLoaded(): void {
    if (this.tokensLoading.size === 0 && this.allTokensLoadedCallback) {
      this.allTokensLoadedCallback();
      delete this.allTokensLoadedCallback; // Clear after calling
    }
  }
  
  private requestSort(): void {
    if (this.sortPending) return;
    
    this.sortPending = true;
    
    // Clear any existing timeout
    if (this.sortTimeout !== null) {
      window.clearTimeout(this.sortTimeout);
    }
    
    // Use requestAnimationFrame instead of setTimeout for better performance
    window.requestAnimationFrame(() => {
      if (!this.sortPending) return; // Double check in case it was cancelled
      
      // Only sort if we have children
      if (this.tokenContainer.children.length > 0) {
        this.tokenContainer.sortChildren();
      }
      
      this.sortPending = false;
      this.sortTimeout = null;
    });
  }

  private syncUIPosition(tokenId: string, x: number, y: number): void {
    this.uiManager.syncUIPosition(tokenId, x, y);
  }


  private reestablishTokenInteractivity(tokenGroup: Container): void {
    const isPlayerView = this.store.getState().isPlayerView || false;
    
    // Update the isPlayerView flag used by InteractionController
    this.interactionController.isPlayerView = isPlayerView;
    this.spriteFactory.isPlayerView = isPlayerView;

    // Sprites are always eventMode='none' — viewport-level dispatch handles everything.
    // No need to toggle eventMode or re-attach handlers.
    tokenGroup.eventMode = 'passive';
    tokenGroup.interactiveChildren = false;
  }

  private updateTokenRing(tokenId: string, tokenGroup: Container, size: number, ringColor?: string): void {
    const tokenSettings = this.store.getState().tokenSettings || {
      showNameplates: false,
      showHPBars: true,
      showStressBars: false,
      tokenRingSize: 1
    };

    const sizeWithMultiplier = size * tokenSettings.tokenRingSize;
    const resolvedRingColor = ringColor || '#ffffff';

    // Route all ring redraws through SpriteFactory to keep visuals consistent
    // between initial create and subsequent updates (size/color changes).
    const ring = this.spriteFactory.createTokenRing(tokenGroup, resolvedRingColor, sizeWithMultiplier);
    if (ring) {
      this.tokenRings[tokenId] = ring;
    } else {
      delete this.tokenRings[tokenId];
    }

    // Update instance badge position/size for ring size changes
    const token = this.store.getState().objects.tokens[tokenId];
    if (token) {
      const allTokens = this.store.getState().objects.tokens;
      const sameCount = Object.values(allTokens).filter(t => t.imagePath === token.imagePath).length;
      const showBadge = sameCount >= 2 && (this.store.getState().tokenSettings?.showInstanceBadges ?? true);
      updateInstanceBadge(tokenGroup, token.instanceNumber ?? 1, sizeWithMultiplier, showBadge);
    }
  }

  /**
   * Re-evaluates instance badges for every token on the map.
   * Called when the showInstanceBadges setting changes.
   */
  private refreshInstanceBadges(): void {
    const tokens = this.store.getState().objects.tokens;
    const tokenSettings = this.store.getState().tokenSettings;
    const showBadges = tokenSettings?.showInstanceBadges ?? true;

    // Group tokens by imagePath
    const tokensByImage = new Map<string, TokenEntity[]>();
    for (const token of Object.values(tokens)) {
      const group = tokensByImage.get(token.imagePath) || [];
      group.push(token);
      tokensByImage.set(token.imagePath, group);
    }

    // Update all badges
    for (const [, groupTokens] of tokensByImage) {
      const shouldShow = showBadges && groupTokens.length >= 2;
      for (const token of groupTokens) {
        const tokenGroup = this.tokenSprites[token.id];
        if (tokenGroup) {
          const tokenSize = (tokenGroup as any).tokenSize || 70;
          updateInstanceBadge(tokenGroup, token.instanceNumber ?? 1, tokenSize, shouldShow);
        }
      }
    }
  }

  private isInPlayerMode(): boolean {
    const isPlayerView = this.store.getState().isPlayerView || false;
    const isGMView = this.store.getState().isGMView;
    return this.isLocalPlayerMode || isPlayerView || !isGMView;
  }

  private applyTokenVisibilityPolicy(
    token: TokenEntity,
    tokenGroup: Container,
    prevToken?: TokenEntity
  ): void {
    const isHidden = token.isHidden ?? false;

    if (isHidden && this.isInPlayerMode()) {
      tokenGroup.visible = false;
      tokenGroup.alpha = 1.0;
      this.uiManager.setTokenUIVisibility(token.id, false);
      return;
    }

    tokenGroup.visible = true;
    this.uiManager.setTokenUIVisibility(token.id, true);
    tokenGroup.alpha = isHidden ? 0.5 : 1.0;

    this.updateHiddenIcon(token.id, tokenGroup, isHidden).catch(err => {
      console.error('[TokenRenderer] Failed to update hidden icon:', err);
    });

    if (!prevToken || (prevToken.isHidden ?? false) !== isHidden) {
      this.reestablishTokenInteractivity(tokenGroup);
    }
  }

  /**
   * Re-applies visibility to every rendered token. Needed when the perspective
   * changes (GM view / player mode): the tokens themselves are unchanged, so an
   * incremental sync would skip them and hidden tokens would stay on screen.
   */
  private refreshTokenVisibility(): void {
    const tokens = this.store.getState().objects.tokens;
    for (const [id, tokenGroup] of Object.entries(this.tokenSprites)) {
      const token = tokens[id];
      if (token && tokenGroup) {
        this.applyTokenVisibilityPolicy(token, tokenGroup);
      }
    }
  }

  private syncTokens = async (
    tokensRecord: Record<string, TokenEntity>,
    prevTokensRecord: Record<string, TokenEntity>
  ): Promise<void> => {

    if (!this.gridSystem) {
        console.warn("[TokenRenderer] syncTokens called before gridSystem is initialized.");
        return;
    }

    const container = this.tokenContainer;
    const newIds = new Set(Object.keys(tokensRecord));

    // Use this.tokenSprites as source of truth for what sprites exist,
    // not prevTokensRecord which may be stale or incomplete from Zustand batching
    const spriteIds = Object.keys(this.tokenSprites);

    // Detect which tokens actually changed (for incremental updates)
    const changedTokenIds = new Set<string>();
    const newTokenIds = new Set<string>();
    const deletedTokenIds = new Set<string>();

    // Find deleted tokens
    for (const id of spriteIds) {
      if (!newIds.has(id)) {
        deletedTokenIds.add(id);
      }
    }

    // Find new and changed tokens
    for (const [id, token] of Object.entries(tokensRecord)) {
      const prevToken = prevTokensRecord?.[id];
      if (!prevToken) {
        newTokenIds.add(id);
      } else if (this.hasTokenChanged(token, prevToken)) {
        changedTokenIds.add(id);
      }
    }

    const totalChanges = changedTokenIds.size + newTokenIds.size + deletedTokenIds.size;

    // Handle deleted tokens
    for (const id of deletedTokenIds) {
      const tokenGroup = this.tokenSprites[id];
      const prevToken = prevTokensRecord?.[id];

      if (tokenGroup) {
        // Clean up interaction handlers
        this.interactionController.removeInteractionHandlers(id, tokenGroup);

        // Clean up texture from cache if we have the imagePath
        const imagePath = prevToken?.imagePath;
        if (imagePath) {
          // Check if any other tokens are still using this texture
          const stillInUse = Object.values(tokensRecord).some(t => t.imagePath === imagePath);
          if (!stillInUse) {
            // Use TextureCache's clearTexture method which handles destruction
            this.textureCache.clearTexture(imagePath);
          }
        }

        container.removeChild(tokenGroup);
        tokenGroup.destroy({children: true, texture: false});
        delete this.tokenSprites[id];
        // Clean up ring tracking (ring is destroyed with tokenGroup)
        delete this.tokenRings[id];
        // Clean up token UI
        this.uiManager.destroyTokenUI(id);
      }
    }

    // Process only changed and new tokens (skip unchanged tokens entirely)
    for (const token of Object.values(tokensRecord)) {
      const existingSprite = this.tokenSprites[token.id];
      const prevToken = prevTokensRecord?.[token.id];
      const isNewToken = newTokenIds.has(token.id);
      const isChangedToken = changedTokenIds.has(token.id);

      // Skip unchanged existing tokens entirely (major optimization)
      if (existingSprite !== undefined && !isNewToken && !isChangedToken) {
        continue;
      }

      // Skip if we have a token sprite (including placeholder)
      const existingTokenGroup = existingSprite as Container;
      if (existingSprite !== undefined) {
        // If it's still being created (null placeholder), skip
        if (existingSprite === null) {
          continue;
        }

        // Only update position if it changed
        if (!prevToken || prevToken.x !== token.x || prevToken.y !== token.y) {
          // Don't update position if token is animating - let animation complete naturally
          if (!this.syncService.isTokenAnimating(token.id)) {
            // Cancel any ongoing animation for this token to ensure store position takes precedence
            this.syncService.cancelAnimation(token.id);
            existingTokenGroup.position.set(token.x, token.y);
            this.uiManager.syncUIPosition(token.id, token.x, token.y);
          }
          
          // Update rotation handle positions when token moves
          this.uiManager.updateHandlePositions();
        }
        
        // Update rotation if it changed or if there's a temporary rotation
        const tempRotation = this.uiManager.getRotationUI()?.getTemporaryRotation(token.id);
        const displayRotation = tempRotation !== undefined ? tempRotation : (token.rotation || 0);

        // Find the sprite in the children (it's not always at index 0)
        let sprite: Sprite | null = null;
        for (const child of existingTokenGroup.children) {
          if (child instanceof Sprite) {
            sprite = child;
            break;
          }
        }
        
        if (sprite) {
          sprite.rotation = displayRotation * Math.PI / 180; // Convert degrees to radians
        }
        
        // Update rotation handle positions when token rotates
        if (!prevToken || prevToken.rotation !== token.rotation || tempRotation !== undefined) {
          this.uiManager.updateHandlePositions();
        }
        
        // Check for temporary size during resize
        const tempSize = this.uiManager.getResizeUI()?.getTemporarySize(token.id);
        
        // Update resize handle positions when token size changes
        const sizeChanged = !prevToken || (prevToken as any).size !== (token as any).size || tempSize !== undefined;
        if (sizeChanged) {
          this.uiManager.getResizeUI()?.updateHandlePositions();
          // Also update rotation handles since token size affects their position
          // Build temporary sizes map for all tokens
          const tempSizes: Record<string, number> = {};
          if (tempSize !== undefined) {
            tempSizes[token.id] = tempSize;
          }
          this.uiManager.getRotationUI()?.updateHandlePositions(undefined, tempSizes);
        }
        
        // Update size if it changed (not temporary)
        if (!prevToken || (prevToken as any).size !== (token as any).size) {
          // Only update actual size if there's no temporary size override
          if (tempSize === undefined) {
            const newSize = (token as any).size || 1;
            this.spriteFactory.updateTokenSize(token.id, existingTokenGroup, newSize);
            const tokenSize = computeTokenPixelSize(this.gridSystem.getOptions().size, newSize);
            
            // Update UI scale
            this.uiManager.syncUIScale(token.id, tokenSize);
            
            // Always refresh ring, even when token has no explicit ringColor.
            const ringColor = (token as any).ringColor;
            this.updateTokenRing(token.id, existingTokenGroup, tokenSize, ringColor);
          }
        }

        if (!prevToken || token.imagePath !== prevToken.imagePath) {
          try {
            await this.updateTokenSpriteTexture(token, existingTokenGroup, prevToken?.imagePath);
          } catch (error) {
            console.error(`[TokenRenderer] Failed to update token texture for ${token.id}:`, error);
          }
        }
        
        this.applyTokenVisibilityPolicy(token, existingTokenGroup, prevToken);
        
        // Update z-index if layer changed
        if (!prevToken || prevToken.layer !== token.layer) {
          existingTokenGroup.zIndex = token.layer || 0;
          this.requestSort();
        }
        
        // Update ring color if it changed
        const newRingColor = (token as any).ringColor;
        const prevRingColor = prevToken ? (prevToken as any).ringColor : undefined;
        if (newRingColor !== prevRingColor) {
          // Calculate token size for ring update
          const currentSize = tempSize !== undefined ? tempSize : ((token as any).size || 1);
          const tokenSize = computeTokenPixelSize(this.gridSystem.getOptions().size, currentSize);
          
          this.updateTokenRing(token.id, existingTokenGroup, tokenSize, newRingColor);
        }
        
        // Check for defeated status changes
        const isDefeated = (token as any).isDefeated || false;
        const wasDefeated = prevToken ? (prevToken as any).isDefeated || false : false;
        if (isDefeated !== wasDefeated) {
          this.updateDefeatedState(token.id, existingTokenGroup, isDefeated);
        }
        
        // Update token UI with any state changes
        this.uiManager.updateTokenUI(token.id, token);
        
        continue;
      }
      
      // Mark token as loading to prevent duplicate creation
      this.tokenSprites[token.id] = null;
      this.tokensLoading.add(token.id);
      
      // Create new token sprite asynchronously
      void (async () => {
        try {
          let character = token as any;
          
          // Check if this token is linked to a statblock via its image
          if (character.imagePath) {
            const linkedStatblockPath = await this.tokenStatblockLinkService.getStatblockLinkedToToken(character.imagePath);
            if (linkedStatblockPath && !character.statblockPath) {
              // Token is linked to a statblock but doesn't have the path set yet
              character = { ...character, statblockPath: linkedStatblockPath };
              
              // Load initial data from the statblock
              try {
                const statblockFile = this.obsApp.vault.getAbstractFileByPath(linkedStatblockPath);
                if (statblockFile instanceof TFile) {
                  const metadata = this.obsApp.metadataCache.getFileCache(statblockFile);
                  const frontmatter = metadata?.frontmatter;
                  if (frontmatter) {
                    // Extract HP - handle both formats
                    if (typeof frontmatter.hp === 'number') {
                      character.hp = { current: frontmatter.hp, max: frontmatter.hp };
                    } else if (typeof frontmatter.hp === 'object' && frontmatter.hp !== null) {
                      character.hp = {
                        current: frontmatter.hp.current || frontmatter.hp.max || 0,
                        max: frontmatter.hp.max || frontmatter.hp.current || 0
                      };
                    }
                    
                    // Extract other attributes
                    character.name = frontmatter.name || character.name;
                    character.showNameplate = true;
                    
                    if (frontmatter.stress !== undefined) {
                      character.stress = 0; // Current stress starts at 0
                      character.maxStress = frontmatter.stress;
                    }
                    
                    if (frontmatter.difficulty !== undefined) {
                      character.difficulty = frontmatter.difficulty;
                    }
                  }
                }
              } catch (error) {
                console.error(`[TokenRenderer] Failed to load statblock data for token ${token.id}:`, error);
              }
            }
          }
          
          // Enhance character with statblock name if needed
          character = await this.enhanceCharacterWithStatblockName(character);
          
          // Load texture
          const texture = await this.textureCache.loadTokenTexture(character);
          
          // Create sprite through factory
          const tokenGroup = await this.spriteFactory.createTokenSprite(character, texture);
          
          // Set up interaction handlers
          this.interactionController.attachInteractionHandlers(token.id, tokenGroup, token);
          
          // Add to container
          container.addChild(tokenGroup);
          
          // Store sprite reference
          this.tokenSprites[token.id] = tokenGroup;
          
          // Remove from loading set
          this.tokensLoading.delete(token.id);
          
          // Check if all tokens are loaded
          this.checkAllTokensLoaded();
          
          // Create UI elements
          this.uiManager.createTokenUI(token.id, tokenGroup, character);
          
          this.applyTokenVisibilityPolicy(character as TokenEntity, tokenGroup);
          
          // Request sort for proper z-ordering
          this.requestSort();
          
          // Also ensure viewport sorts its children to maintain UI above tokens
          this.viewport.sortChildren();
        } catch (error) {
          console.error(`[TokenRenderer] Failed to create sprite for token ${token.id}:`, error);
          // Clean up on error
          delete this.tokenSprites[token.id];
          this.tokensLoading.delete(token.id);
          this.checkAllTokensLoaded();
        }
      })();
    }

    // Update instance badges for all tokens after any changes
    if (totalChanges > 0) {
      this.refreshInstanceBadges();
    }
  };

  private async updateTokenSpriteTexture(
    token: TokenEntity,
    tokenGroup: Container,
    previousImagePath?: string
  ): Promise<void> {
    const sprite = tokenGroup.getChildByLabel('tokenSprite') as Sprite | null;
    if (!sprite) {
      return;
    }

    const texture = await this.textureCache.loadTokenTexture(token as any);

    // Abort if this sprite was replaced while awaiting texture load.
    if (this.tokenSprites[token.id] !== tokenGroup) {
      return;
    }

    sprite.texture = texture;
    const tokenSize = (tokenGroup as any).tokenSize;
    if (typeof tokenSize === 'number' && Number.isFinite(tokenSize) && tokenSize > 0) {
      sprite.width = tokenSize;
      sprite.height = tokenSize;
    }

    if (!previousImagePath || previousImagePath === token.imagePath) {
      return;
    }

    const stillInUse = Object.values(this.store.getState().objects.tokens).some(
      (otherToken) => otherToken.id !== token.id && otherToken.imagePath === previousImagePath
    );
    if (!stillInUse) {
      this.textureCache.clearTexture(previousImagePath);
    }
  }

  /**
   * Checks if a token has any property changes that require visual updates.
   * Used by syncTokens for incremental updates optimization.
   */
  private hasTokenChanged(token: TokenEntity, prevToken: TokenEntity): boolean {
    // Position changes
    if (token.x !== prevToken.x || token.y !== prevToken.y) return true;

    // Rotation changes
    if (token.rotation !== prevToken.rotation) return true;

    // Layer/z-index changes
    if (token.layer !== prevToken.layer) return true;

    // Extended properties (cast to any for optional fields)
    const t = token as any;
    const p = prevToken as any;

    // Size changes
    if (t.size !== p.size) return true;

    // Ring color changes
    if (t.ringColor !== p.ringColor) return true;

    // Visibility/hidden state changes
    if (t.isHidden !== p.isHidden) return true;

    // Defeated state changes
    if (t.isDefeated !== p.isDefeated) return true;

    // Name/nameplate changes
    if (t.name !== p.name || t.showNameplate !== p.showNameplate) return true;

    // HP changes (check object equality)
    const hpChanged = JSON.stringify(t.hp) !== JSON.stringify(p.hp);
    if (hpChanged) return true;

    // Statblock path changes
    if (t.statblockPath !== p.statblockPath) return true;

    // Texture source changes
    if (token.imagePath !== prevToken.imagePath) return true;

    return false;
  }

  private updateDefeatedState(tokenId: string, tokenGroup: Container, isDefeated: boolean): void {
    const defeatedIconContainer = tokenGroup.getChildByLabel('defeatedIcon') as Container;
    
    if (isDefeated && !defeatedIconContainer) {
      // Create defeated icon with glow effect
      const defeatedIconContainer = new Container();
      defeatedIconContainer.label = 'defeatedIcon';
      
      // Get token size from the sprite
      const sprite = tokenGroup.getChildByLabel('tokenSprite') as Sprite;
      if (!sprite) return;
      
      const tokenSize = sprite.width;
      const iconSize = tokenSize * 0.4; // 40% of token size
      
      // Create glow effect container
      const glowContainer = new Container();
      
      // Create multiple glow layers for softer effect
      const glowGraphics = new Graphics();
      glowGraphics.circle(0, 0, iconSize / 2 + 10);
      glowGraphics.fill({ color: 0xef4444, alpha: 0.3 });
      (glowContainer as any).glowGraphics = glowGraphics;
      glowContainer.addChild(glowGraphics);
      
      // Create main icon background
      const iconBg = new Graphics();
      iconBg.circle(0, 0, iconSize / 2);
      iconBg.fill(0xdc2626); // Red background
      iconBg.stroke({ width: 2, color: 0x991b1b }); // Darker red border
      
      // Create X shape
      const xGraphics = new Graphics();
      const xSize = iconSize * 0.5;
      const xThickness = iconSize * 0.12;
      
      // Draw thick X
      xGraphics.moveTo(-xSize/2, -xSize/2);
      xGraphics.lineTo(xSize/2, xSize/2);
      xGraphics.moveTo(xSize/2, -xSize/2);
      xGraphics.lineTo(-xSize/2, xSize/2);
      xGraphics.stroke({ width: xThickness, color: 0xffffff, cap: 'round' });
      
      // Add components to defeated icon container
      defeatedIconContainer.addChild(glowContainer);
      defeatedIconContainer.addChild(iconBg);
      defeatedIconContainer.addChild(xGraphics);
      
      // Position at center of token
      defeatedIconContainer.position.set(0, 0);
      defeatedIconContainer.zIndex = 10; // Above token but below UI
      
      tokenGroup.addChild(defeatedIconContainer);
      tokenGroup.sortChildren();
      
      // Start pulsing animation
      this.startPulsingGlow(glowContainer, iconSize);
    } else if (!isDefeated && defeatedIconContainer) {
      // Stop any running animations
      const glowContainer = defeatedIconContainer.children.find(child => (child as any).glowGraphics) as Container;
      if (glowContainer) {
        if (this.pixiApp) {
          this.pixiApp.ticker.remove((glowContainer as any).pulseAnimation);
        }
      }
      
      // Remove defeated icon
      tokenGroup.removeChild(defeatedIconContainer);
      defeatedIconContainer.destroy({ children: true });
    }
  }
  
  private startPulsingGlow(glowContainer: Container, iconSize: number): void {
    const glowGraphics = (glowContainer as any).glowGraphics as Graphics;
    let pulseTime = 0;
    
    const pulseAnimation = (ticker: any) => {
      const delta = ticker.deltaTime || ticker;
      pulseTime += delta * 0.05; // Adjust speed of pulsing
      
      // Calculate pulse intensity using sine wave
      const pulseIntensity = (Math.sin(pulseTime) + 1) / 2; // 0 to 1
      const glowRadius = iconSize / 2 + (10 * pulseIntensity); // Grow glow radius
      const glowAlpha = 0.3 + (0.3 * pulseIntensity); // Pulse alpha
      
      // Redraw glow
      glowGraphics.clear();
      
      // Draw multiple glow layers for softer effect
      for (let i = 3; i > 0; i--) {
        const layerRadius = glowRadius * (1 + i * 0.3);
        const layerAlpha = glowAlpha * (0.3 / i);
        glowGraphics.fill({ color: 0xef4444, alpha: layerAlpha });
        glowGraphics.circle(0, 0, layerRadius);
        glowGraphics.fill();
      }
    };
    
    // Store animation reference for cleanup
    (glowContainer as any).pulseAnimation = pulseAnimation;
    
    // Add to ticker
    if (this.pixiApp) {
      this.pixiApp.ticker.add(pulseAnimation);
    }
  }
  
  private async updateHiddenIcon(tokenId: string, tokenGroup: Container, isHidden: boolean): Promise<void> {
    let hiddenIconContainer = tokenGroup.getChildByLabel('hiddenIcon') as Container;
    
    if (isHidden && !hiddenIconContainer) {
      // Create container for the icon
      hiddenIconContainer = new Container();
      hiddenIconContainer.label = 'hiddenIcon';
      
      // Get token size from the sprite
      const sprite = tokenGroup.getChildByLabel('tokenSprite') as Sprite;
      if (!sprite) return;
      
      const tokenSize = sprite.width;
      const iconSize = Math.min(40, tokenSize * 0.5);
      
      // Create background circle using Graphics
      const bgCircle = new Graphics();
      bgCircle.circle(0, 0, iconSize / 2);
      bgCircle.fill({ color: 0x000000, alpha: 0.8 });
      bgCircle.stroke({ width: 2, color: 0xffffff, alpha: 0.9 });
      bgCircle.eventMode = 'none'; // Ensure background doesn't block events
      hiddenIconContainer.addChild(bgCircle);
      
      // Create high-resolution SVG
      const svgSize = 96; // 4x the original 24px for better quality
      const strokeWidth = 8; // Scale stroke width proportionally
      
      // Lucide eye-off icon SVG at higher resolution
      const eyeOffSvg = `<svg xmlns="http://www.w3.org/2000/svg" width="${svgSize}" height="${svgSize}" viewBox="0 0 24 24" fill="none" stroke="white" stroke-width="${strokeWidth/svgSize * 24}" stroke-linecap="round" stroke-linejoin="round">
        <path d="M10.733 5.076a10.744 10.744 0 0 1 11.205 6.575 1 1 0 0 1 0 .696 10.747 10.747 0 0 1-1.444 2.49"/>
        <path d="M14.084 14.158a3 3 0 0 1-4.242-4.242"/>
        <path d="M17.479 17.499a10.75 10.75 0 0 1-15.417-5.151 1 1 0 0 1 0-.696 10.75 10.75 0 0 1 4.446-5.143"/>
        <path d="m2 2 20 20"/>
      </svg>`;
      
      // Convert SVG to texture with higher resolution
      // Create canvas to avoid PIXI warning about Image elements
      const canvas = createEl('canvas');
      canvas.width = svgSize * 2; // 2x resolution
      canvas.height = svgSize * 2;
      const ctx = canvas.getContext('2d');
      
      if (ctx) {
        const img = new Image();
        img.width = svgSize;
        img.height = svgSize;
        img.src = `data:image/svg+xml,${encodeURIComponent(eyeOffSvg)}`;
        
        try {
          await img.decode();
          // Scale up for higher resolution
          ctx.scale(2, 2);
          ctx.drawImage(img, 0, 0, svgSize, svgSize);
          
          const iconTexture = Texture.from(canvas);
          iconTexture.source.resolution = 2; // Double resolution for sharper rendering
          const iconSprite = new Sprite(iconTexture);
          
          // Scale and position the icon
          iconSprite.anchor.set(0.5);
          const scale = (iconSize * 0.7) / svgSize; // Scale based on actual SVG size
          iconSprite.scale.set(scale);
          iconSprite.eventMode = 'none'; // Ensure icon doesn't block events
          
          hiddenIconContainer.addChild(iconSprite);
        } catch (error) {
          console.error('[TokenRenderer] Failed to load eye-off icon:', error);
          // Fallback to simple X if icon fails to load
          const fallback = new Graphics();
          fallback.moveTo(-iconSize * 0.3, -iconSize * 0.3);
          fallback.lineTo(iconSize * 0.3, iconSize * 0.3);
          fallback.moveTo(-iconSize * 0.3, iconSize * 0.3);
          fallback.lineTo(iconSize * 0.3, -iconSize * 0.3);
          fallback.stroke({ width: 3, color: 0xffffff, alpha: 1 });
          fallback.eventMode = 'none'; // Ensure fallback doesn't block events
          hiddenIconContainer.addChild(fallback);
        }
      } else {
        // Canvas context failed, use fallback
        const fallback = new Graphics();
        fallback.moveTo(-iconSize * 0.3, -iconSize * 0.3);
        fallback.lineTo(iconSize * 0.3, iconSize * 0.3);
        fallback.moveTo(-iconSize * 0.3, iconSize * 0.3);
        fallback.lineTo(iconSize * 0.3, -iconSize * 0.3);
        fallback.stroke({ width: 3, color: 0xffffff, alpha: 1 });
        fallback.eventMode = 'none'; // Ensure fallback doesn't block events
        hiddenIconContainer.addChild(fallback);
      }
      
      // Position at center of token
      hiddenIconContainer.position.set(0, 0);
      hiddenIconContainer.zIndex = 10; // Above token but below UI
      hiddenIconContainer.eventMode = 'none'; // Icon should not block interactions
      hiddenIconContainer.interactiveChildren = false;
      
      tokenGroup.addChild(hiddenIconContainer);
      tokenGroup.sortChildren();
    } else if (!isHidden && hiddenIconContainer) {
      // Remove hidden icon
      tokenGroup.removeChild(hiddenIconContainer);
      hiddenIconContainer.destroy({ children: true });
    }
  }

  /**
   * Enhance character object with statblock name for nameplate display
   */
  private async enhanceCharacterWithStatblockName(character: any): Promise<any> {
    // If character already has a custom name, no need to load statblock name
    if (character.name) {
      return character;
    }
    
    // If no statblock path, return as is
    if (!character.statblockPath) {
      return character;
    }
    
    try {
      const file = this.obsApp.vault.getAbstractFileByPath(character.statblockPath);
      if (!(file instanceof TFile)) {
        console.warn(`[TokenRenderer] Statblock file not found: ${character.statblockPath}`);
        return character;
      }
      
      const content = await this.obsApp.vault.read(file);
      const match = content.match(/^---\n([\s\S]*?)\n---\n([\s\S]*)$/);
      
      if (!match) {
        console.warn(`[TokenRenderer] Invalid statblock format in file: ${character.statblockPath}`);
        return character;
      }
      
      const statblockData = parseYaml(match[1]!);
      if (!statblockData || typeof statblockData !== 'object') {
        console.warn(`[TokenRenderer] Failed to parse YAML in statblock: ${character.statblockPath}`);
        return character;
      }
      
      // Create enhanced character with statblock name
      const enhancedCharacter = {
        ...character,
        statblockName: statblockData.name || null
      };

      return enhancedCharacter;
    } catch (error) {
      console.error(`[TokenRenderer] Error loading statblock at ${character.statblockPath}:`, error);
      return character;
    }
  }

  public destroy(): void {
    // Unsubscribe from store
    this._unsubscribeFromStore?.();
    this._unsubscribeFromViewport?.();
    
    // Clean up sync service
    this.syncService.destroyAll();
    
    // Clear any pending sort
    if (this.sortTimeout !== null) {
      window.clearTimeout(this.sortTimeout);
      this.sortTimeout = null;
    }
    
    // Clean up all sprites first
    for (const [id, tokenGroup] of Object.entries(this.tokenSprites)) {
      if (tokenGroup && tokenGroup !== null) {
        // Remove interaction handlers through InteractionController
        this.interactionController.removeInteractionHandlers(id, tokenGroup);
        
        // Remove all event listeners from the tokenGroup
        tokenGroup.removeAllListeners();
      }
    }
    
    // Remove viewport handlers owned by TokenRenderer.
    this.viewport.off('pointerdown', this.onViewportPointerDown);
    this.viewport.off('pointermove', this.onViewportPointerMove);
    this.viewport.off('pointerup', this.onViewportPointerUp, this);
    this.viewport.off('pointerupoutside', this.onViewportPointerUp, this);
    this.pixiApp?.canvas.removeEventListener('dblclick', this.onCanvasDoubleClick);
    
    // Destroy all UI elements through UIManager
    this.uiManager.destroyAll();
    
    // Destroy interaction controller
    this.interactionController.destroyAll();
    
    // Clean up theme observer
    if (this.themeObserver) {
      this.themeObserver.disconnect();
      this.themeObserver = null;
    }
    
    // Clean up event listeners
    // Remove window event listeners using properly typed handlers
    if (this._handleGridTypeChange) {
      window.removeEventListener('atlas-grid-type-changed', this._handleGridTypeChange);
      delete this._handleGridTypeChange;
    }

    if (this._handleRotationUpdate) {
      window.removeEventListener('atlas-tokens-rotation-update', this._handleRotationUpdate);
      delete this._handleRotationUpdate;
    }

    if (this._handleResizeUpdate) {
      window.removeEventListener('atlas-tokens-resize-update', this._handleResizeUpdate);
      delete this._handleResizeUpdate;
    }

    if (this._handleRotationEnded) {
      window.removeEventListener('atlas-token-rotation-ended', this._handleRotationEnded);
      delete this._handleRotationEnded;
    }

    if (this._handleResizeEnded) {
      window.removeEventListener('atlas-token-resize-ended', this._handleResizeEnded);
      delete this._handleResizeEnded;
    }
    
    // Now destroy the container and its children. 
    // Textures associated with sprites in tokenContainer should be handled by PixiAppManager.destroy
    // if they were not individually destroyed from the cache.
    if (this.tokenContainer) { // Add null check
        this.tokenContainer.destroy({ children: true, texture: false });
    }
    
    // Destroy all cached textures using centralized method
    this.textureCache.destroyAll();
    
    // Clear all references
    this.tokenSprites = {};
    this.tokenRings = {};

    // Nullify other references if necessary
    (this as any).obsApp = null;
    (this as any).viewport = null;
    (this as any).gridSystem = null;
    (this as any).tokenContainer = null;
    (this as any).store = null;
    (this as any).eventBus = null;
    this.pixiApp = null;
  }

  // Helper function to get MIME type (simplified)
  private getMimeType(extension: string): string | undefined {
    switch (extension.toLowerCase()) {
      case 'png': return 'image/png';
      case 'jpg':
      case 'jpeg': return 'image/jpeg';
      case 'gif': return 'image/gif';
      case 'webp': return 'image/webp';
      case 'svg': return 'image/svg+xml';
      default: return undefined;
    }
  }

  /**
   * Updates multiple tokens with data from a statblock
   */
  private async updateTokensWithStatblockData(tokenIds: string[], statblockPath: string): Promise<void> {
    try {
      const statblockFile = this.obsApp.vault.getAbstractFileByPath(statblockPath);
      if (!(statblockFile instanceof TFile)) return;
      
      const metadata = this.obsApp.metadataCache.getFileCache(statblockFile);
      const frontmatter = metadata?.frontmatter;
      if (!frontmatter) return;
      
      for (const tokenId of tokenIds) {
        const token = this.store.getState().objects.tokens[tokenId];
        if (!token) continue;
        
        let updates: any = { statblockPath };
        
        // Extract HP - handle both formats
        if (typeof frontmatter.hp === 'number') {
          updates.hp = { current: frontmatter.hp, max: frontmatter.hp };
        } else if (typeof frontmatter.hp === 'object' && frontmatter.hp !== null) {
          updates.hp = {
            current: frontmatter.hp.current || frontmatter.hp.max || 0,
            max: frontmatter.hp.max || frontmatter.hp.current || 0
          };
        }
        
        // Extract other attributes
        updates.name = frontmatter.name || (token as any).name;
        updates.showNameplate = true;
        
        if (frontmatter.stress !== undefined) {
          updates.stress = 0; // Current stress starts at 0
          updates.maxStress = frontmatter.stress;
        }
        
        if (frontmatter.difficulty !== undefined) {
          updates.difficulty = frontmatter.difficulty;
        }
        
        this.store.getState().updateToken(tokenId, updates);
      }
    } catch (error) {
      console.error('[TokenRenderer] Failed to update tokens with statblock data:', error);
    }
  }

  /**
   * Setup theme observer to update UI when theme changes
   */
  private setupThemeObserver(): void {
    this.themeObserver = new MutationObserver((mutations) => {
      for (const mutation of mutations) {
        if (mutation.type === 'attributes' && mutation.attributeName === 'class') {
          // Theme changed, update rotation and resize handles
          this.uiManager.getRotationUI()?.updateTheme();
          this.uiManager.getResizeUI()?.updateTheme();
        }
      }
    });
    
    // Start observing
    this.themeObserver.observe(document.body, {
      attributes: true,
      attributeFilter: ['class']
    });
  }

  /**
   * Re-snaps all tokens to the current grid type
   * Called when grid type changes (e.g., from square to hex)
   */
  private resnapAllTokens(): void {
    const currentState = this.store.getState();
    const grid = currentState.grid;
    const snapToGrid = grid && typeof grid.snapToGrid === 'boolean' ? grid.snapToGrid : true;
    
    if (!snapToGrid) {
      return;
    }
    
    const tokens = currentState.objects.tokens;
    const tokenUpdates: Array<{id: string, x: number, y: number}> = [];
    
    // Re-snap each token to the new grid type
    for (const [tokenId, token] of Object.entries(tokens)) {
      const tokenSprite = this.tokenSprites[tokenId];
      if (!tokenSprite) continue;
      
      // Get current position and snap to new grid
      const currentPos = { x: token.x, y: token.y };
      const snappedPos = this.gridSystem.snapToCellCenter(currentPos.x, currentPos.y);
      
      // Only update if position actually changed
      if (Math.abs(snappedPos.x - currentPos.x) > 0.1 || Math.abs(snappedPos.y - currentPos.y) > 0.1) {
        // Update sprite position immediately for visual feedback
        tokenSprite.position.set(snappedPos.x, snappedPos.y);
        this.uiManager.syncUIPosition(tokenId, snappedPos.x, snappedPos.y);
        tokenUpdates.push({id: tokenId, x: snappedPos.x, y: snappedPos.y});
      }
    }
    
    // Bulk update positions in store if any tokens moved
    if (tokenUpdates.length > 0) {
      this.store.getState().setTokenPositions(tokenUpdates);
    }
  }

  /**
   * Provides PIXI app reference to sync service when available
   */
  public setPixiApp(app: Application | null): void {
    this.pixiApp = app;
    this.syncService.setPixiApp(app);
    if (app) {
      this.textureCache.setPixiApp(app);
    }
  }

  /** Player overlays prepared for the next mirrored frame. */
  public getPlayerViewLayers(settings: AtlasSettings['localPlayerView']): LayerVisibility[] {
    return this.uiManager.getPlayerViewLayers(settings);
  }

  /** Get all token sprites for external systems like SelectionManager. */
  public getTokenSprites(): Record<string, Container> {
    return this.tokenSprites as Record<string, Container>;
  }

  // ─── Fog provider setters ───────────────────────────────────────────

  public setFogHitTestProvider(fn: (worldX: number, worldY: number) => string | null): void {
    this.fogHitTestProvider = fn;
  }

  public setFogClickHandler(fn: (fogId: string, e: FederatedPointerEvent) => void): void {
    this.fogClickHandler = fn;
  }

  public setDrawingHitTestProvider(fn: (worldX: number, worldY: number) => string | null): void {
    this.drawingHitTestProvider = fn;
  }

  public setDrawingClickHandler(fn: (drawingId: string, e: FederatedPointerEvent) => void): void {
    this.drawingClickHandler = fn;
  }

  /** Called when a group drag starts, so selected drawings follow the tokens. */
  public setDrawingDragStartHandler(fn: (e: FederatedPointerEvent) => void): void {
    this.drawingDragStartHandler = fn;
  }

  public setPinHitTestProvider(fn: (worldX: number, worldY: number) => string | null): void {
    this.pinHitTestProvider = fn;
  }

  public setPinClickHandler(fn: (pinId: string, e: FederatedPointerEvent) => void): void {
    this.pinClickHandler = fn;
  }

  public setPinHoverHandler(fn: (type: 'over' | 'out', pinId: string, e: FederatedPointerEvent) => void): void {
    this.pinHoverHandler = fn;
  }

  public setWallPointerDownHandler(fn: (worldX: number, worldY: number, e: FederatedPointerEvent) => boolean): void {
    this.wallPointerDownHandler = fn;
  }

  public setWallPointerMoveHandler(fn: (worldX: number, worldY: number, e: FederatedPointerEvent) => void): void {
    this.wallPointerMoveHandler = fn;
  }

  public setWallPointerUpHandler(fn: () => void): void {
    this.wallPointerUpHandler = fn;
  }

  public setWallDoubleClickHandler(fn: (worldX: number, worldY: number) => void): void {
    this.wallDoubleClickHandler = fn;
  }

  public setWallContextMenuHandler(fn: (worldX: number, worldY: number, screenX: number, screenY: number) => void): void {
    this.wallContextMenuHandler = fn;
  }

  public setWallCursorProvider(fn: (worldX: number, worldY: number) => string): void {
    this.wallCursorProvider = fn;
  }

  public setAudioPointerDownHandler(fn: (worldX: number, worldY: number, e: FederatedPointerEvent) => boolean): void {
    this.audioPointerDownHandler = fn;
  }

  public setAudioPointerMoveHandler(fn: (worldX: number, worldY: number, e: FederatedPointerEvent) => void): void {
    this.audioPointerMoveHandler = fn;
  }

  // ─── Viewport-level event dispatch ──────────────────────────────────

  /** Circle-collision hit test against all visible token sprites. */
  public hitTestTokens(worldX: number, worldY: number): string | null {
    const tokens = this.store.getState().objects.tokens;
    const gridSize = this.gridSystem.getOptions().size;

    for (const [id, tokenGroup] of Object.entries(this.tokenSprites)) {
      if (!tokenGroup || !tokenGroup.visible) continue;

      const token = tokens[id];
      if (!token) continue;

      const sizeMultiplier = token.size || 1;
      const tokenSize = computeTokenPixelSize(gridSize, sizeMultiplier);
      const radius = tokenSize / 2;

      const dx = worldX - tokenGroup.position.x;
      const dy = worldY - tokenGroup.position.y;
      if (dx * dx + dy * dy <= radius * radius) {
        return id;
      }
    }
    return null;
  }

  /** Returns true if (worldX, worldY) is within the bounding box of the given selected tokens. */
  /** Drag the selected tokens; a no-op when the selection holds none. */
  private startTokenGroupDrag(e: FederatedPointerEvent): void {
    const { selectedIds, objects } = this.store.getState();
    const tokenIds = selectedIds.filter((id) => objects.tokens[id]);
    if (tokenIds.length > 0) this.interactionController.handleViewportGroupDragStart(tokenIds, e);
  }

  /** Drag the whole selection, tokens and drawings alike. */
  private startGroupDrag(e: FederatedPointerEvent): void {
    e.stopPropagation();
    this.startTokenGroupDrag(e);
    this.drawingDragStartHandler?.(e);
  }

  private isPointInSelectionBounds(worldX: number, worldY: number, selectedIds: string[]): boolean {
    let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
    let found = false;
    const drawings = this.store.getState().objects.drawings;

    for (const id of selectedIds) {
      const drawing = drawings[id];
      const drawingBounds = drawing && getDrawingBounds(drawing);
      if (drawingBounds) {
        minX = Math.min(minX, drawingBounds.x);
        minY = Math.min(minY, drawingBounds.y);
        maxX = Math.max(maxX, drawingBounds.x + drawingBounds.width);
        maxY = Math.max(maxY, drawingBounds.y + drawingBounds.height);
        found = true;
        continue;
      }

      const tokenGroup = this.tokenSprites[id];
      if (!tokenGroup || !tokenGroup.visible) continue;

      // Match SelectionManager.updateSelectionOverlay bounds calculation:
      // use actual sprite dimensions, not grid size
      const sprite = tokenGroup.children[0];
      if (!sprite || !('width' in sprite)) continue;

      const halfW = sprite.width / 2;
      const halfH = sprite.height / 2;
      const x = tokenGroup.position.x;
      const y = tokenGroup.position.y;

      if (x - halfW < minX) minX = x - halfW;
      if (y - halfH < minY) minY = y - halfH;
      if (x + halfW > maxX) maxX = x + halfW;
      if (y + halfH > maxY) maxY = y + halfH;
      found = true;
    }

    if (!found) return false;

    // Same 12px padding as the selection overlay
    const pad = 12;
    return worldX >= minX - pad && worldX <= maxX + pad &&
           worldY >= minY - pad && worldY <= maxY + pad;
  }

  /** Set up viewport-level pointer handlers. Called once during init. */
  public setupViewportEventHandlers(): void {
    this.viewport.on('pointerdown', this.onViewportPointerDown);
    this.viewport.on('pointermove', this.onViewportPointerMove);
    this.viewport.on('pointerup', this.onViewportPointerUp, this);
    this.viewport.on('pointerupoutside', this.onViewportPointerUp, this);
    this.pixiApp?.canvas.addEventListener('dblclick', this.onCanvasDoubleClick);
  }

  private onViewportPointerDown = (e: FederatedPointerEvent): void => {
    // PIXI v8 reuses FederatedPointerEvent objects — clear custom flags from previous events
    resetHandled(e);

    const activeTool = this.store.getState().activeTool;
    const worldPos = this.viewport.toWorld(e.global);

    // ── Right-click: check walls, fog, and pins ─────────────────────────
    if (e.button === 2) {
      // Wall context menu (when wall tool is active)
      if (activeTool === 'wall' && this.wallContextMenuHandler) {
        this.wallContextMenuHandler(worldPos.x, worldPos.y, e.clientX, e.clientY);
        markHandled(e);
        return;
      }

      // Check pins first (smaller hit targets, higher priority for right-click)
      if (this.pinHitTestProvider && this.pinClickHandler) {
        const pinId = this.pinHitTestProvider(worldPos.x, worldPos.y);
        if (pinId) {
          markHandled(e);
          this.pinClickHandler(pinId, e);
          return;
        }
      }
      if (this.fogHitTestProvider && this.fogClickHandler) {
        const fogId = this.fogHitTestProvider(worldPos.x, worldPos.y);
        if (fogId) {
          markHandled(e);
          this.fogClickHandler(fogId, e);
          return;
        }
      }
    }

    // ── Pin left-click: works from any tool (drag + open) ──────────────
    if (e.button === 0 && this.pinHitTestProvider && this.pinClickHandler) {
      const pinId = this.pinHitTestProvider(worldPos.x, worldPos.y);
      if (pinId) {
        markHandled(e);
        this.pinClickHandler(pinId, e);
        return;
      }
    }

    // ── Wall tool: drawing, vertex drag, selection ─────────────────────
    if (activeTool === 'wall' && e.button === 0 && this.wallPointerDownHandler) {
      const handled = this.wallPointerDownHandler(worldPos.x, worldPos.y, e);
      if (handled) {
        markHandled(e);
        return;
      }
    }

    // Audio tool: click to place or select audio sources
    if (activeTool === 'audio' && e.button === 0 && this.audioPointerDownHandler) {
      const handled = this.audioPointerDownHandler(worldPos.x, worldPos.y, e);
      if (handled) {
        markHandled(e);
        return;
      }
    }

    // ── Token + fog interactions: only for select/move tools ────────────
    if (activeTool !== 'select' && activeTool !== 'move') return;

    // 1. Hit-test individual tokens
    const tokenId = this.hitTestTokens(worldPos.x, worldPos.y);
    if (tokenId) {
      markHandled(e);
      this.interactionController.handleViewportTokenPointerDown(tokenId, e);
      // Drawings selected alongside the token follow its drag
      if (e.button === 0) this.drawingDragStartHandler?.(e);
      return;
    }

    // 2. Hit-test selection bounding box (drag from within the selected group)
    if (e.button === 0) {
      const selectedIds = this.store.getState().selectedIds;
      if (selectedIds.length > 1 && this.isPointInSelectionBounds(worldPos.x, worldPos.y, selectedIds)) {
        markHandled(e);
        this.startGroupDrag(e);
        return;
      }
    }

    // 3. Hit-test drawings (select + drag, or context menu; tokens selected alongside follow a drag)
    if (this.drawingHitTestProvider && this.drawingClickHandler) {
      const drawingId = this.drawingHitTestProvider(worldPos.x, worldPos.y);
      if (drawingId) {
        markHandled(e);
        this.drawingClickHandler(drawingId, e);
        if (e.button === 0) this.startTokenGroupDrag(e);
        return;
      }
    }

    // 4. Hit-test fog (left-click selection)
    if (this.fogHitTestProvider && this.fogClickHandler) {
      const fogId = this.fogHitTestProvider(worldPos.x, worldPos.y);
      if (fogId) {
        markHandled(e);
        this.fogClickHandler(fogId, e);
        return;
      }
    }

    // 5. Nothing hit — clear selection for move tool on empty-space left-click
    if (e.button === 0 && activeTool === 'move') {
      const selectedIds = this.store.getState().selectedIds;
      if (selectedIds.length > 0) {
        this.store.getState().clearSelection();
      }
    }

    // Let the event propagate for viewport panning and marquee selection
  };

  /**
   * PIXI listens for pointermove on the whole document, so moves over DOM
   * overlays (note previews, panels) still reach the viewport. Only the
   * canvas itself may drive hover state; anything else keeps the last state.
   */
  private isPointerOverCanvas(e: FederatedPointerEvent): boolean {
    const canvas = this.pixiApp?.canvas;
    const target = e.nativeEvent?.target;
    return !canvas || !(target instanceof Node) || target === canvas;
  }

  private onViewportPointerMove = (e: FederatedPointerEvent): void => {
    // If dragging, InteractionController already has viewport listeners — skip hover
    if (this.interactionController.isDraggingTokens()) return;
    if (!this.isPointerOverCanvas(e)) return;

    const worldPos = this.viewport.toWorld(e.global);
    const activeTool = this.store.getState().activeTool;

    // Pin hover: show pointer cursor and emit preview events from any tool
    if (this.pinHitTestProvider) {
      const pinId = this.pinHitTestProvider(worldPos.x, worldPos.y);
      if (pinId !== this.lastHoveredPinId) {
        if (this.lastHoveredPinId) {
          this.pinHoverHandler?.('out', this.lastHoveredPinId, e);
        }
        if (pinId) {
          this.pinHoverHandler?.('over', pinId, e);
        }
        this.lastHoveredPinId = pinId;
      }
      if (pinId) {
        this.interactionController.handleViewportTokenHover(null);
        this.uiManager.setHoverState(null);
        this.applyCursor('pointer');
        return;
      }
    }

    // Clear pin hover if we moved off a pin
    if (this.lastHoveredPinId) {
      this.pinHoverHandler?.('out', this.lastHoveredPinId, e);
      this.lastHoveredPinId = null;
    }

    // Wall tool: pointer move for vertex dragging, freeform drawing, and hover cursors
    if (activeTool === 'wall' && this.wallPointerMoveHandler) {
      this.wallPointerMoveHandler(worldPos.x, worldPos.y, e);

      const wallCursor = this.wallCursorProvider?.(worldPos.x, worldPos.y) ?? 'crosshair';
      this.applyCursor(wallCursor);
      return;
    }

    // Audio tool: pointer move for cursor updates
    if (activeTool === 'audio' && this.audioPointerMoveHandler) {
      this.audioPointerMoveHandler(worldPos.x, worldPos.y, e);
      this.applyCursor('crosshair');
      return;
    }

    // Token hover: only for select/move tools
    if (activeTool !== 'select' && activeTool !== 'move') {
      this.interactionController.handleViewportTokenHover(null);
      this.uiManager.setHoverState(null);
      this.viewport.cursor = 'default';
      return;
    }

    const tokenId = this.hitTestTokens(worldPos.x, worldPos.y);

    this.interactionController.handleViewportTokenHover(tokenId, e);
    const modifierDown = e.metaKey || e.ctrlKey;
    this.uiManager.setHoverState(tokenId, modifierDown);

    this.applyCursor(tokenId ? 'pointer' : 'default');
  };

  /** Sets the viewport cursor and re-applies it after PIXI's own cursor write for this event. */
  private applyCursor(cursor: string): void {
    this.viewport.cursor = cursor;
    const canvas = this.pixiApp?.canvas;
    if (canvas) {
      queueMicrotask(() => setCanvasCursor(canvas, cursor));
    }
  }

  private onViewportPointerUp = (): void => {
    if (this.store.getState().activeTool === 'wall') {
      this.wallPointerUpHandler?.();
    }
  };

  private onCanvasDoubleClick = (ev: MouseEvent): void => {
    if (this.store.getState().activeTool === 'wall') {
      const worldPos = this.viewport.toWorld(ev.offsetX, ev.offsetY);
      this.wallDoubleClickHandler?.(worldPos.x, worldPos.y);
    }
  };

  /**
   * Gets the container holding all tokens
   */
  public getTokenContainer(): Container {
    return this.tokenContainer;
  }

  /**
   * Updates all token sizes (typically after grid change)
   */
  public updateAllTokenSizes(): void {
    const tokens = this.store.getState().objects.tokens;
    for (const [tokenId, token] of Object.entries(tokens)) {
      const tokenGroup = this.tokenSprites[tokenId];
      if (tokenGroup instanceof Container) {
        const size = token.size || 1;
        this.spriteFactory.updateTokenSize(tokenId, tokenGroup, size);
        
        // Calculate token size based on grid
        const tokenSize = computeTokenPixelSize(this.gridSystem.getOptions().size, size);
        
        // Update UI scale
        this.uiManager.syncUIScale(tokenId, tokenSize);
        
        // Always refresh ring, even when token has no explicit ringColor.
        const ringColor = token.ringColor;
        this.updateTokenRing(tokenId, tokenGroup, tokenSize, ringColor);
      }
    }

    // Refresh instance badges for all tokens (covers tokens without rings)
    this.refreshInstanceBadges();
  }

}
