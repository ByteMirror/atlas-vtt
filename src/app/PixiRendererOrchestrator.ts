import { canRunMapHotkeys, matchesMapHotkey } from './keyboard/mapHotkeys';
import { SettingsService, type AtlasSettings } from './services/SettingsService';
import { Application, Sprite, Container, Assets } from "pixi.js";
import { runInBackground } from './utils/backgroundTask';
import { Viewport } from "pixi-viewport"; // Keep for type, but instance comes from PixiAppManager
import { WorkspaceLeaf } from 'obsidian';
import { GridOptions, GridSystem, GridType } from "./grid/GridSystem";
import type { App } from 'obsidian';
import type { ViewAtlasState } from './storeFactory';
import { openContextMenuGlobal, type ContextMenuEntry } from './react/root/ContextMenuContext';
import { EventEmitter } from 'events';
import { PixiAppManager } from "./pixi/PixiAppManager"; // Import the new manager
import { TokenRenderer } from "./pixi/token-renderer"; // Import TokenRenderer
// Import color utils
import { PinRenderer } from "./pixi/PinRenderer"; // Import PinRenderer
import { captureWithLayerVisibility, type LayerVisibility } from "./pixi/playerSafeFrame";
import { SelectionManager } from "./pixi/SelectionManager"; // Import SelectionManager
import { FogOfWarRenderer } from "./pixi/fog/FogOfWarRenderer";
import { MeasureRenderer } from "./pixi/MeasureRenderer"; // Import MeasureRenderer
import { LaserPointerRenderer } from "./pixi/LaserPointerRenderer"; // Import LaserPointerRenderer
import { DrawingRenderer } from "./pixi/DrawingRenderer"; // Import DrawingRenderer
import { DrawingInteraction } from "./pixi/DrawingInteraction";
import { isViewportPanEnabled } from "./pixi/utils/viewportPan";
import { BackgroundRenderer } from "./pixi/BackgroundRenderer"; // Import BackgroundRenderer
import { TextRenderer } from "./pixi/TextRenderer"; // Import TextRenderer
import { TextTool } from "./tools/TextTool"; // Import TextTool
import { VisionRenderer } from './pixi/vision/VisionRenderer';
import { WallRenderer } from './pixi/vision/WallRenderer';
import { WallInteraction } from './pixi/vision/WallInteraction';
import { WallTool } from './tools/WallTool';
import { AudioTool } from './tools/AudioTool';
import { openLightConfigPanel } from './pixi/vision/LightConfigPanel';
import { WALLS_AND_LIGHTING_ENABLED } from './featureFlags';
import { openAudioConfigPanel } from './pixi/audio/AudioConfigPanel';
import { AudioRenderer } from './pixi/audio/AudioRenderer';
import { SoundRegistry } from './audio/SoundRegistry';
import { AudioBufferCache } from './audio/AudioBufferCache';
import { SpatialAudioEngine } from './audio/SpatialAudioEngine';
import type { StoreApi } from 'zustand';
import { AssetService } from './services/AssetService';
import { findAtlasLeafByViewId } from './utils/atlasLeafLookup';

export class PixiRendererOrchestrator { // Renamed class
  private _isDestroyed: boolean = false;
  private pixiAppManager: PixiAppManager;
  private tokenRenderer?: TokenRenderer; // Add TokenRenderer instance
  private pinRenderer?: PinRenderer; // Add PinRenderer instance
  private selectionManager?: SelectionManager; // Add SelectionManager instance
  private fogRenderer?: FogOfWarRenderer; // Add FogRenderer instance
  private measureRenderer?: MeasureRenderer; // Add MeasureRenderer instance
  private laserPointerRenderer?: LaserPointerRenderer; // Add LaserPointerRenderer instance
  private drawingRenderer?: DrawingRenderer; // Add DrawingRenderer instance
  private drawingInteraction?: DrawingInteraction;
  private textRenderer?: TextRenderer; // Add TextRenderer instance
  private backgroundRenderer?: BackgroundRenderer; // Add BackgroundRenderer instance
  private textTool?: TextTool; // Add TextTool instance
  /** IDs of wall segments created during the current drawing chain (for Escape undo). */
  private currentChainWallIds: string[] = [];
  private visionRenderer?: VisionRenderer;
  private wallRenderer?: WallRenderer;
  private wallInteraction?: WallInteraction;
  private wallTool?: WallTool;
  private audioRenderer?: AudioRenderer;
  private audioTool?: AudioTool;
  private soundRegistry?: SoundRegistry;
  private bufferCache?: AudioBufferCache;
  private spatialAudioEngine?: SpatialAudioEngine;
  private peekKeydownHandler: ((e: KeyboardEvent) => void) | null = null;
  private peekKeyupHandler: ((e: KeyboardEvent) => void) | null = null;

  private layerMap: Container | null = null;
  private layerGrid: Container | null = null;
  private layerTemplate: Container | null = null;
  private layerLighting: Container | null = null;
  private layerFog: Container | null = null; // Add fog layer
  private gridSystem?: GridSystem; // Instance of GridSystem
  private backgroundSprite: Sprite | null = null;
  private backgroundTextureUrl: string | null = null; // Track loaded texture URL
  private obsApp: App;
  private eventBus: EventEmitter;
  private activeHoverLinkAnchorEl: HTMLElement | null = null;
  private notePreviewEl: HTMLDivElement | null = null;
  private notePreviewLeaf: WorkspaceLeaf | null = null;
  private isPreviewPinned: boolean = false;
  private _isShowingPreview: boolean = false;
  private store: StoreApi<ViewAtlasState>; // Add store
  private _unsubscribeFromToolChanges?: () => void; // Add tool subscription cleanup
  private _unsubscribeFromGridVisibility?: () => void; // Add grid visibility subscription cleanup
  private viewId: string;
  private keyboardHandler: ((e: KeyboardEvent) => void) | null = null;
  private getViewportPositionHandler: ((e: Event) => void) | null = null;
  private waitForTokensLoadedHandler: ((callback: () => void) => void) | null = null;
  private gridInitRetryTimeout: number | null = null;

  private getSourceLeaf(): WorkspaceLeaf | null {
    return findAtlasLeafByViewId(this.obsApp.workspace, this.viewId);
  }

  // Getter for the viewport, now from PixiAppManager
  private get viewport(): Viewport | null {
    return this.pixiAppManager.getViewport();
  }

  // Getter for the application, now from PixiAppManager
  private get app(): Application {
    return this.pixiAppManager.getApp();
  }


  constructor(
    obsApp: App, 
    pixiAppManager: PixiAppManager, 
    eventBus: EventEmitter,
    store: StoreApi<ViewAtlasState>,
    viewId: string
  ) {
    this.obsApp = obsApp;
    this.pixiAppManager = pixiAppManager;
    this.eventBus = eventBus; 
    this.store = store;
    this.viewId = viewId;
    this.setupEventBusListeners(); // Call this to set up other listeners if any
  }

  async init(containerEl: HTMLElement): Promise<void> {
    if (this._isDestroyed) return;
    try {
      await this.pixiAppManager.init(containerEl);
      
      // Wait for viewport to be available with multiple retry attempts
      let retryCount = 0;
      const maxRetries = 10;
      const retryDelay = 100; // 100ms between retries
      
      while (!this.viewport && retryCount < maxRetries) {
        await new Promise(resolve => window.setTimeout(resolve, retryDelay));
        retryCount++;
      }
      
      const currentViewport = this.viewport; // this.viewport is a getter
      if (!currentViewport) {
        console.error("[PixiRendererOrchestrator] Viewport not available after", maxRetries, "retries.");
        // Try to force viewport creation
        this.pixiAppManager.initViewport();
        await new Promise(resolve => window.setTimeout(resolve, 100));
        
        if (!this.viewport) {
          console.error("[PixiRendererOrchestrator] Failed to create viewport even after forced initialization.");
          return;
        }
      }
      
      // Subscribe to tool changes from the isolated view store
      this._unsubscribeFromToolChanges = (this.store as any).subscribe(
        (state: ViewAtlasState) => state.activeTool,
        (tool: any, previousTool: any) => {
          // Use getter to always get current viewport, not the one from closure
          const vp = this.viewport;
          if (!vp) return;
          if (isViewportPanEnabled(tool)) {
            vp.plugins.resume('drag');
          } else {
            vp.plugins.pause('drag');
          }
          
          // Handle text tool activation/deactivation
          if (tool === 'text' && this.textTool) {
            this.textTool.activate();
          } else if (this.textTool) {
            this.textTool.deactivate();
          }

          // Wall tool activation
          if (tool === 'wall') {
            this.wallRenderer?.setVisible(true);
          } else {
            this.wallRenderer?.setVisible(false);
            this.wallRenderer?.clearPreview();
            this.wallRenderer?.clearFreeformPreview();
            this.wallTool?.cancelDrawing();
          }

          // Laser pointer activation/cursor is self-managed by LaserPointerRenderer
        },
        { fireImmediately: true }
      );
      
      // Subscribe to grid changes (including visibility and offset)
      this._unsubscribeFromGridVisibility = (this.store as any).subscribe(
        (state: ViewAtlasState) => state.grid,
        (grid: any) => {
          if (this.gridSystem && grid) {
            
            // Get current options BEFORE any updates to compare what actually changed
            const currentOptions = this.gridSystem.getOptions();
            // Log what we're comparing
            // Convert color for comparison if it's a string
            const gridColorNum = grid.color !== undefined && typeof grid.color === 'string' 
              ? parseInt(grid.color.replace('#', '0x')) 
              : grid.color;
            
            // Debug each comparison individually
            const visibleChanged = grid.visible !== undefined && grid.visible !== currentOptions.enabled;
            const typeChanged = grid.type !== undefined && grid.type !== currentOptions.type;
            const offsetXChanged = grid.offsetX !== undefined && grid.offsetX !== currentOptions.offsetX;
            const offsetYChanged = grid.offsetY !== undefined && grid.offsetY !== currentOptions.offsetY;
            const sizeChanged = grid.size !== undefined && grid.size !== currentOptions.size;
            const opacityChanged = grid.opacity !== undefined && grid.opacity !== currentOptions.alpha;
            const lineWidthChanged = grid.lineWidth !== undefined && grid.lineWidth !== currentOptions.lineWidth;
            const lineTypeChanged = grid.lineType !== undefined && grid.lineType !== currentOptions.lineType;
            const colorChanged = gridColorNum !== undefined && gridColorNum !== currentOptions.color;
            
            const hasChanges = visibleChanged || typeChanged || offsetXChanged || offsetYChanged || 
                             sizeChanged || opacityChanged || lineWidthChanged || lineTypeChanged || colorChanged;
            
            if (!hasChanges) {
              return;
            }
            
            // Batch all updates into a single options update to avoid multiple recreations
            const updates: Partial<GridOptions> = {};
            let needsOptionsUpdate = false;
            
            // Handle visibility separately as it uses setEnabled
            const visible = typeof grid.visible === 'boolean' ? grid.visible : true;
            if (visible !== currentOptions.enabled) {
              this.gridSystem.setEnabled(visible);
            }
            
            // Collect all other updates
            if (grid.type !== undefined && grid.type !== currentOptions.type) {
              updates.type = grid.type;
              needsOptionsUpdate = true;
            }
            if (typeof grid.offsetX === 'number' && grid.offsetX !== currentOptions.offsetX) {
              updates.offsetX = grid.offsetX;
              needsOptionsUpdate = true;
            }
            if (typeof grid.offsetY === 'number' && grid.offsetY !== currentOptions.offsetY) {
              updates.offsetY = grid.offsetY;
              needsOptionsUpdate = true;
            }
            if (typeof grid.size === 'number' && grid.size !== currentOptions.size) {
              updates.size = grid.size;
              needsOptionsUpdate = true;
            }
            if (typeof grid.opacity === 'number' && grid.opacity !== currentOptions.alpha) {
              updates.alpha = grid.opacity;
              needsOptionsUpdate = true;
            }
            if (grid.color !== undefined && grid.color !== currentOptions.color) {
              // Convert color string to hex number
              const colorNum = typeof grid.color === 'string' 
                ? parseInt(grid.color.replace('#', '0x')) 
                : grid.color;
              updates.color = colorNum;
              needsOptionsUpdate = true;
            }
            if (grid.lineType !== undefined && grid.lineType !== currentOptions.lineType) {
              updates.lineType = grid.lineType;
              needsOptionsUpdate = true;
            }
            if (typeof grid.lineWidth === 'number' && grid.lineWidth !== currentOptions.lineWidth) {
              updates.lineWidth = grid.lineWidth;
              needsOptionsUpdate = true;
            }
            
            // Apply all updates at once
            if (needsOptionsUpdate) {
              this.gridSystem.updateOptions(updates);
              
              // Re-snap all tokens to the new grid if grid type, size, or offset changed
              if (updates.type || updates.size || updates.offsetX !== undefined || updates.offsetY !== undefined) {
                // If grid size or type changed, update all token sizes
                // Note: We check for type changes too since hex grids require different sizing
                if ((updates.size || updates.type) && this.tokenRenderer) {
                  this.tokenRenderer.updateAllTokenSizes();
                }
                
                this.resnapTokensToGrid();
              }
            }
          }
        },
        { fireImmediately: false } // Don't fire immediately, let initGrid handle initial state
      );
      
      if (currentViewport) {
        this.setupRenderersAndManagers(currentViewport);
      }
      // initPinContainer is now effectively handled by PinRenderer's constructor

      // Listen for requests to get viewport position for UI elements
      // Store the handler for cleanup
      this.getViewportPositionHandler = ((e: Event) => {
        const vp = this.viewport; // Use getter
        if (!vp) return;
        const detail = (e as CustomEvent).detail;
        if (detail && typeof detail.callback === 'function') {
          let clientX, clientY;
          if (typeof detail.worldX === 'number' && typeof detail.worldY === 'number') {
            const screenPos = vp.toScreen(detail.worldX, detail.worldY);
            clientX = screenPos.x;
            clientY = screenPos.y;
          } else {
            console.warn('[PixiRendererOrchestrator] get-viewport-position event had no worldX/Y.');
            clientX = vp.screenWidth / 2;
            clientY = vp.screenHeight / 2;
          }
          detail.callback(clientX, clientY);
        }
      });
      window.addEventListener('get-viewport-position', this.getViewportPositionHandler);

      // Add keyboard handler for escape key to clear selection
      this.setupKeyboardHandlers();
      
      // Add click handler for clearing selection when clicking empty space
      this.setupViewportClickHandler();
      
      // Drawing tool event handlers will be attached dynamically when needed
      
    } catch (error) {
      console.error("[PixiRendererOrchestrator] Initialization error:", error);
      throw error;
    }
  }
  
  private setupRenderersAndManagers(viewport: Viewport): void {
    // Initialize BackgroundRenderer first as it should be the bottom layer
    this.backgroundRenderer = new BackgroundRenderer(viewport, this.eventBus, this.store, this.pixiAppManager.app);
    
    // Initialize TokenRenderer first if GridSystem is ready
    // This also means tokenContainer will be added to viewport earlier
    if (this.gridSystem) {
        this.tokenRenderer = new TokenRenderer(
            this.obsApp,
            viewport,
            this.gridSystem,
            () => this.selectionManager?.updateSelectionOverlay(),
            this.store,
            this.eventBus,
            this.viewId
        );
        // Set PIXI app reference for renderer access
        this.tokenRenderer.setPixiApp(this.pixiAppManager.app);
    } else {
        // GridSystem not ready yet - TokenRenderer will be initialized later in initGrid()
    }

    // Initialize PinRenderer first
    // Check if this is a player view through the store
    const isPlayerView = this.store.getState().isPlayerView || false;
    this.pinRenderer = new PinRenderer(this.obsApp, viewport, this.eventBus, this.store, isPlayerView);

    this.selectionManager = new SelectionManager(
        viewport,
        () => this.tokenRenderer?.getTokenSprites() || {},
        () => this.fogRenderer?.getFogSprites() || {},
        this.store,
        this.eventBus
    );

    // Initialize FogOfWarRenderer after pins so it can be on top when active
    this.fogRenderer = new FogOfWarRenderer(viewport, this.app, this.eventBus as any, this.store);
    
    // Add fog layer to viewport - it should be on top for interaction when the fog tool is active
    const fogContainer = this.fogRenderer.getContainer();
    viewport.addChild(fogContainer);
    
    // Set the fog container to a high z-index to ensure it's on top when visible
    fogContainer.zIndex = 1000;

    // Initialize VisionRenderer (z-index 900 — between tokens and fog)
    this.visionRenderer = new VisionRenderer(viewport, this.pixiAppManager.app, this.store, this.obsApp);

    // Initialize WallRenderer (z-index 1100 — GM-only editor overlay)
    this.wallRenderer = new WallRenderer(viewport, this.store);

    // Initialize WallInteraction
    this.wallInteraction = new WallInteraction(this.store, this.wallRenderer);

    // Initialize WallTool
    this.wallTool = new WallTool(this.eventBus);

    // Initialize Audio system
    this.audioRenderer = new AudioRenderer(viewport, this.store);
    this.audioTool = new AudioTool(this.eventBus);

    // Initialize SoundRegistry and SpatialAudioEngine
    const pluginDir = (this.store.getState().plugin as any)?.manifest?.dir ?? `${this.obsApp.vault.configDir}/plugins/atlas-vtt`;
    this.soundRegistry = new SoundRegistry(this.obsApp, pluginDir);
    void this.soundRegistry.scanCustomSounds();
    this.bufferCache = new AudioBufferCache(new AudioContext(), this.obsApp, this.soundRegistry);
    this.spatialAudioEngine = new SpatialAudioEngine(this.store, this.bufferCache);

    // GM peek: hold Alt to hide vision mask and show wall overlay
    this.peekKeydownHandler = (e: KeyboardEvent) => {
      if (e.key === 'Alt' && WALLS_AND_LIGHTING_ENABLED) {
        this.visionRenderer?.setPeeking(true);
        this.wallRenderer?.setVisible(true);
        this.wallRenderer?.forceRedraw();
      }
    };
    this.peekKeyupHandler = (e: KeyboardEvent) => {
      if (e.key === 'Alt') {
        this.visionRenderer?.setPeeking(false);
        if (this.store.getState().activeTool !== 'wall') {
          this.wallRenderer?.setVisible(false);
        }
      }
    };
    document.addEventListener('keydown', this.peekKeydownHandler);
    document.addEventListener('keyup', this.peekKeyupHandler);

    // Wire viewport-level event dispatch providers (only if TokenRenderer is available now;
    // otherwise initGrid() will wire them when TokenRenderer is created later)
    this.wireViewportDispatchProviders();

    // Initialize MeasureRenderer if GridSystem is ready
    if (this.gridSystem) {
      this.measureRenderer = new MeasureRenderer(viewport, this.eventBus, this.store, this.gridSystem);
      this.wireMeasureRendererProvider();
    }
    
    // Initialize LaserPointerRenderer (self-manages activation via store subscription)
    this.laserPointerRenderer = new LaserPointerRenderer(
      viewport, this.app, this.eventBus, this.store,
      this.pixiAppManager.getCanvasElement(),
    );
    const laserPointerContainer = this.laserPointerRenderer.getContainer();
    viewport.addChild(laserPointerContainer);
    laserPointerContainer.zIndex = 2000;

    // Initialize DrawingRenderer (ink strokes; self-manages activation via store subscription)
    this.drawingRenderer = new DrawingRenderer(viewport, this.eventBus as any, this.store);
    this.drawingInteraction = new DrawingInteraction(viewport, this.store);
    const drawingContainer = this.drawingRenderer.getContainer();
    viewport.addChild(drawingContainer);
    // Above tokens/text, below fog so hidden areas stay hidden
    drawingContainer.zIndex = 900;
    
    // Initialize TextRenderer if GridSystem is ready
    if (this.gridSystem) {
      this.textRenderer = new TextRenderer(
        viewport,
        this.gridSystem,
        () => this.selectionManager?.updateSelectionOverlay(),
        this.store,
        this.eventBus,
        isPlayerView
      );
      // Add text container to viewport
      const textContainer = this.textRenderer.getContainer?.() || viewport.children.find(child => child.label === 'textContainer');
      if (textContainer) {
        // Set z-index between tokens and fog
        textContainer.zIndex = 500;
      }
    }
    
    
    // Initialize TextTool
    if (this.gridSystem && !isPlayerView) {
      this.textTool = new TextTool(viewport, this.store, this.gridSystem, this.eventBus);
    }
    
  }

  public initGrid(options: GridOptions, bgSprite: Sprite): void {
    const currentViewport = this.viewport;
    if (!currentViewport) return;
    if (!bgSprite) return;
    this.backgroundSprite = bgSprite;

    // Check if sprite is ready before initializing grid
    if (!bgSprite.width || !bgSprite.height || bgSprite.width <= 0 || bgSprite.height <= 0) {
      if (this.gridInitRetryTimeout) {
        window.clearTimeout(this.gridInitRetryTimeout);
        this.gridInitRetryTimeout = null;
      }

      // Wait for sprite to be ready
      const checkAndInitGrid = () => {
        if (this._isDestroyed) {
          this.gridInitRetryTimeout = null;
          return;
        }

        if (bgSprite.width > 0 && bgSprite.height > 0) {
          this.gridInitRetryTimeout = null;
          this._initGridInternal(options, bgSprite);
        } else {
          // Check again after a short delay
          this.gridInitRetryTimeout = window.setTimeout(checkAndInitGrid, 50);
        }
      };
      
      this.gridInitRetryTimeout = window.setTimeout(checkAndInitGrid, 50);
      return;
    }

    if (this.gridInitRetryTimeout) {
      window.clearTimeout(this.gridInitRetryTimeout);
      this.gridInitRetryTimeout = null;
    }
    
    this._initGridInternal(options, bgSprite);
  }
  
  private _initGridInternal(options: GridOptions, bgSprite: Sprite): void {
    const currentViewport = this.viewport;
    const currentApp = this.app;
    if (!currentViewport || !bgSprite) return;
    
    if (!this.gridSystem) {
      this.gridSystem = new GridSystem(currentApp, currentViewport, bgSprite, options);
      // Apply current grid visibility state from store
      const currentState = this.store.getState();
      const grid = currentState.grid;
      const gridVisible = grid && typeof grid.visible === 'boolean' ? grid.visible : true;
      this.gridSystem.setEnabled(gridVisible);
    } else {
      this.gridSystem.updateBackgroundSprite(bgSprite);
      // Only update options that have changed, preserving offset if not provided
      const currentOptions = this.gridSystem.getOptions();
      const mergedOptions: GridOptions = {
        ...currentOptions,
        ...options,
        // Preserve current offset unless explicitly provided in options
        offsetX: options.offsetX !== undefined ? options.offsetX : currentOptions.offsetX || 0,
        offsetY: options.offsetY !== undefined ? options.offsetY : currentOptions.offsetY || 0
      };
      this.gridSystem.updateOptions(mergedOptions);
      
      // If we have a tokenRenderer and grid size or type changed, update token sizes
      if (this.tokenRenderer && (options.size !== undefined || options.type !== undefined)) {
        this.tokenRenderer.updateAllTokenSizes();
      }
    }
    
    // Ensure TokenRenderer is initialized or updated if gridSystem was just created/updated
    if (!this.tokenRenderer && this.gridSystem && currentViewport) {
        this.tokenRenderer = new TokenRenderer(
            this.obsApp,
            currentViewport,
            this.gridSystem,
            () => this.selectionManager?.updateSelectionOverlay(), // Pass callback to SelectionManager
            this.store,
            this.eventBus,
            this.viewId
        );
        // Set PIXI app reference for renderer access
        this.tokenRenderer.setPixiApp(this.pixiAppManager.app);
        // Wire viewport-level dispatch providers (fog, pins, selection hit-testing)
        this.wireViewportDispatchProviders();
        // Re-order SelectionManager listeners so they fire after TokenRenderer's viewport handlers
        this.selectionManager?.reorderViewportListeners();
        // If tokens were just initialized, re-ensure pins are on top
        if (this.pinRenderer && this.pinRenderer.getPinContainer().parent) {
            currentViewport.removeChild(this.pinRenderer.getPinContainer());
        }
        if (this.pinRenderer) {
            currentViewport.addChild(this.pinRenderer.getPinContainer());
        }
    } else if (this.tokenRenderer && this.gridSystem) {
        // If TokenRenderer exists, ensure it has the latest gridSystem if it was re-created (though not typical)
        // And ensure the callback is correctly wired if SelectionManager was created after TokenRenderer
        // For simplicity, we assume gridSystem isn't re-created, just updated.
        // And TokenRenderer is given the callback at its creation.
    }
    
    // Initialize or update MeasureRenderer if it doesn't exist yet
    if (!this.measureRenderer && this.gridSystem && currentViewport) {
      this.measureRenderer = new MeasureRenderer(currentViewport, this.eventBus, this.store, this.gridSystem);
      this.wireMeasureRendererProvider();
    }
    
    // Initialize TextRenderer if it doesn't exist yet
    const isPlayerView = this.store.getState().isPlayerView || false;
    if (!this.textRenderer && this.gridSystem && currentViewport) {
      this.textRenderer = new TextRenderer(
        currentViewport,
        this.gridSystem,
        () => this.selectionManager?.updateSelectionOverlay(),
        this.store,
        this.eventBus,
        isPlayerView
      );
      // Add text container to viewport
      const textContainer = this.textRenderer.getContainer?.() || currentViewport.children.find(child => child.label === 'textContainer');
      if (textContainer) {
        // Set z-index between tokens and fog
        textContainer.zIndex = 500;
      }
    }
    
    // Initialize TextTool if it doesn't exist yet
    if (!this.textTool && this.gridSystem && !isPlayerView && currentViewport) {
      this.textTool = new TextTool(currentViewport, this.store, this.gridSystem, this.eventBus);
    }
    
  }

  public setBackgroundSprite(sprite: Sprite): void {
    const currentViewport = this.viewport;
    if (!currentViewport) return;

    // Remove old background from viewport if it's different from the new one
    if (this.backgroundSprite && this.backgroundSprite !== sprite) {
      if (this.backgroundSprite.parent) {
        currentViewport.removeChild(this.backgroundSprite);
      }
      // Unload the old texture if we have its URL
      if (this.backgroundTextureUrl) {
        Assets.unload(this.backgroundTextureUrl).catch(err => {
          console.warn('[PixiRendererOrchestrator] Failed to unload texture:', err);
        });
        this.backgroundTextureUrl = null;
      }
      // Destroy the old sprite
      this.backgroundSprite.destroy({ children: true, texture: false });
    }
    this.backgroundSprite = sprite;
    
    // Try to get the texture URL from the sprite
    if (sprite.texture && sprite.texture.source && (sprite.texture.source as any).src) {
      this.backgroundTextureUrl = (sprite.texture.source as any).src;
    }
    // Ensure new background is at the bottom
    if (!sprite.parent) {
        currentViewport.addChildAt(sprite, 0);
    } else if (currentViewport.getChildAt(0) !== sprite) {
        currentViewport.setChildIndex(sprite, 0);
    }

    this.eventBus.emit('background-sprite-updated', {
      x: sprite.x,
      y: sprite.y,
      width: sprite.width,
      height: sprite.height,
    });

    if (this.gridSystem) {
      this.gridSystem.updateBackgroundSprite(sprite);
      // Don't pass empty options - this would reset the grid settings!
      // The updateBackgroundSprite call should trigger recreation with current options
    }
  }

  public toggleGrid(visible?: boolean): boolean {
    if (!this.gridSystem) return false;
    
    // If visible is undefined, toggle the current state
    const newState = visible !== undefined ? visible : !this.gridSystem.getOptions().enabled;
    this.gridSystem.setEnabled(newState);
    return newState;
  }

  public updateGrid(options: Partial<GridOptions>): void {
    if (!this.gridSystem) return;
    this.gridSystem.updateOptions(options);
  }

  /** Apply final grid alignment: update grid, resize + resnap all tokens. */
  public applyGridAlignment(size: number, offsetX: number, offsetY: number, type?: GridType): void {
    if (!this.gridSystem) return;

    this.gridSystem.updateOptions({ size, offsetX, offsetY, enabled: true, isAligning: false, ...(type ? { type } : {}) });

    if (this.tokenRenderer) {
      this.tokenRenderer.updateAllTokenSizes();
    }
    this.resnapTokensToGrid();
  }

  /** Cancel grid alignment: restore original grid values from the store. */
  public cancelGridAlignment(): void {
    if (!this.gridSystem) return;

    const grid = this.store.getState().grid;
    this.gridSystem.updateOptions({
      type: grid?.type ?? 'square',
      size: grid?.size || 50,
      offsetX: grid?.offsetX || 0,
      offsetY: grid?.offsetY || 0,
      enabled: grid?.visible !== false,
      isAligning: false,
    });
  }

  public getGridOptions(): GridOptions | null {
    return this.gridSystem?.getOptions() || null;
  }

  getAppInstance(): Application { return this.pixiAppManager.getApp(); }

  /** Capture player settings without changing the DM's scene or preferences. */
  public withPlayerSafeFrame(capture: () => void, settings: AtlasSettings['localPlayerView']): void {
    const app = this.pixiAppManager.getApp();
    if (!app?.renderer) return;
    const layers: LayerVisibility[] = [];
    if (this.pinRenderer) layers.push({ layer: this.pinRenderer.getPinContainer(), visible: false });
    const grid = this.gridSystem?.getGridSprite();
    if (grid) layers.push({ layer: grid, visible: settings.showGrid });
    layers.push(...(this.tokenRenderer?.getPlayerViewLayers(settings) ?? []));
    layers.push(...(this.fogRenderer?.getPlayerViewLayers() ?? []));
    captureWithLayerVisibility(layers, () => app.renderer.render(app.stage), capture);
  }

  getViewportInstance(): Viewport | null { return this.pixiAppManager.getViewport(); }
  getGridSystem(): GridSystem | null { return this.gridSystem || null; }
  getBackgroundSprite(): Sprite | null { return this.backgroundSprite; }
  getTokenRenderer(): TokenRenderer | null { return this.tokenRenderer || null; }

  /**
   * Reinitialize viewport plugins after map switch to restore interactions
   * @deprecated Use full renderer recreation instead
   */
  public reinitializeViewportPlugins(): void {
  }

  resize(width: number, height: number): void {
    if (this._isDestroyed) return;
    this.pixiAppManager.resize(width, height);
  }
  
  private setupKeyboardHandlers(): void {
    if (this.keyboardHandler) {
      document.removeEventListener('keydown', this.keyboardHandler);
      this.keyboardHandler = null;
    }

    const handleKeyDown = (e: KeyboardEvent) => {
      if (!canRunMapHotkeys(e, this.viewId)) return;
      const settings = SettingsService.forApp(this.obsApp);
      // Escape key
      if (matchesMapHotkey(e, 'cancel', settings)) {
        // Wall tool: cancel door placement
        if (this.store.getState().activeTool === 'wall' && this.wallInteraction?.isPlacingDoor()) {
          this.wallInteraction.cancelDoorPlacement();
          e.preventDefault();
          return;
        }
        // Wall tool: cancel current drawing (removes uncommitted segments)
        if (this.store.getState().activeTool === 'wall' && this.wallTool?.isCurrentlyDrawing()) {
          this.wallTool.cancelDrawing();
          e.preventDefault();
          return;
        }
        // Wall tool: clear wall selection
        if (this.store.getState().activeTool === 'wall' && this.wallInteraction?.hasSelection()) {
          this.wallInteraction.clearSelection();
          e.preventDefault();
          return;
        }
        // Clear token selection
        const selectedIds = this.store.getState().selectedIds;
        if (selectedIds.length > 0) {
          this.store.getState().clearSelection();
        }
      }
      
      // Delete selected tokens on Delete or Backspace key
      if (!this.store.getState().isPlayerView && (matchesMapHotkey(e, 'delete', settings) || matchesMapHotkey(e, 'deleteAlt', settings))) {
        // Wall tool: delete selected wall/light
        if (this.store.getState().activeTool === 'wall') {
          this.wallInteraction?.deleteSelected();
          e.preventDefault();
          return;
        }

        const selectedIds = this.store.getState().selectedIds;
        if (selectedIds.length > 0) {
          // Prevent the default behavior (like browser back navigation for Backspace)
          e.preventDefault();
          this.store.getState().deleteSelected();
        }
      }
    };
    
    this.keyboardHandler = handleKeyDown;
    document.addEventListener('keydown', handleKeyDown);
  }
  

  /** Wires viewport-level event dispatch providers between TokenRenderer and other renderers.
   *  Must be called after TokenRenderer is available (either from setupRenderersAndManagers or initGrid). */
  private wireViewportDispatchProviders(): void {
    if (!this.tokenRenderer) return;

    if (this.fogRenderer) {
      this.tokenRenderer.setFogHitTestProvider(
        (x, y) => this.fogRenderer!.hitTestFog(x, y)
      );
      this.tokenRenderer.setFogClickHandler(
        (fogId, e) => this.fogRenderer!.handleViewportFogPointerDown(fogId, e)
      );
    }
    // DrawingInteraction is created after the first wiring pass, so resolve it lazily
    this.tokenRenderer.setDrawingHitTestProvider(
      (x, y) => this.drawingInteraction?.hitTest(x, y) ?? null
    );
    this.tokenRenderer.setDrawingClickHandler(
      (drawingId, e) => this.drawingInteraction?.handleViewportPointerDown(drawingId, e)
    );
    this.tokenRenderer.setDrawingDragStartHandler(
      (e) => this.drawingInteraction?.startDrag(e)
    );
    if (this.pinRenderer) {
      this.tokenRenderer.setPinHitTestProvider(
        (x, y) => this.pinRenderer!.hitTestPins(x, y)
      );
      this.tokenRenderer.setPinClickHandler(
        (pinId, e) => this.pinRenderer!.handleViewportPinPointerDown(pinId, e)
      );
      this.tokenRenderer.setPinHoverHandler((type, pinId, e) => {
        const pins = this.store.getState().objects.pins;
        const pin = pins[pinId];
        if (!pin) return;
        if (type === 'over') {
          const screenX = e.clientX ?? e.global.x;
          const screenY = e.clientY ?? e.global.y;
          const sourceLeaf = this.getSourceLeaf();
          this.eventBus.emit('pin-hover-preview', {
            pin,
            screenX,
            screenY,
            pixiEvent: e,
            sourceLeaf,
          });
        } else {
          this.eventBus.emit('pin-hide-preview', { pin });
        }
      });
    }
    if (this.selectionManager) {
      this.selectionManager.setHitTestTokensProvider(
        (x, y) => this.tokenRenderer!.hitTestTokens(x, y)
      );
    }

    // Wire wall tool viewport handlers
    if (this.wallTool && this.wallInteraction) {
      this.tokenRenderer.setWallPointerDownHandler((worldX, worldY, e) => {
        return this.handleWallPointerDown(worldX, worldY, e.shiftKey, e.ctrlKey || e.metaKey);
      });
      this.tokenRenderer.setWallPointerMoveHandler((worldX, worldY, _e) => {
        this.handleWallPointerMove(worldX, worldY);
      });
      this.tokenRenderer.setWallPointerUpHandler(() => {
        this.handleWallPointerUp();
      });
      this.tokenRenderer.setWallDoubleClickHandler((worldX, worldY) => {
        // Double-click on a light: open config panel near it
        if (this.wallRenderer && this.viewport) {
          const lightId = this.wallRenderer.hitTestLights(worldX, worldY);
          if (lightId) {
            const screenPos = this.viewport.toScreen(worldX, worldY);
            const canvasRect = this.pixiAppManager.getCanvasElement()?.getBoundingClientRect();
            const sx = (canvasRect?.left ?? 0) + screenPos.x;
            const sy = (canvasRect?.top ?? 0) + screenPos.y;
            openLightConfigPanel(lightId, this.store, sx, sy);
            return;
          }
        }
        // Otherwise finish wall chain
        this.wallTool?.finishChain();
      });
      this.tokenRenderer.setWallContextMenuHandler((worldX, worldY, screenX, screenY) => {
        this.showWallContextMenu(worldX, worldY, screenX, screenY);
      });
      this.tokenRenderer.setWallCursorProvider((worldX, worldY) => {
        if (!this.wallRenderer) return 'crosshair';
        if (this.wallRenderer.hitTestVertices(worldX, worldY)) return 'grab';
        if (this.wallRenderer.hitTestWalls(worldX, worldY)) return 'pointer';
        if (this.wallRenderer.hitTestLights(worldX, worldY)) return 'pointer';
        return 'crosshair';
      });
    }

    // Wire audio tool viewport handlers
    if (this.audioRenderer && this.audioTool) {
      this.tokenRenderer.setAudioPointerDownHandler((worldX, worldY, _e) => {
        return this.handleAudioPointerDown(worldX, worldY);
      });
      this.tokenRenderer.setAudioPointerMoveHandler((_worldX, _worldY, _e) => {
        // Future: hover feedback for audio sources
      });
    }
  }

  /** Wires the rangeBandsProvider closure on MeasureRenderer so it reads
   *  abstract range bands from the current map's collection settings. */
  private wireMeasureRendererProvider(): void {
    if (!this.measureRenderer) return;
    const assetService = AssetService.getInstance(this.obsApp);
    this.measureRenderer.rangeBandsProvider = () => {
      const mapPath = this.store.getState().mapPath;
      if (!mapPath) return [];
      const collectionId = assetService.getCollectionForMap(mapPath);
      if (!collectionId) return [];
      return assetService.getCollectionSettings(collectionId).gridDefaults?.abstractRangeBands ?? [];
    };
    this.measureRenderer.gridDefaultsProvider = () => {
      const mapPath = this.store.getState().mapPath;
      if (!mapPath) return undefined;
      const collectionId = assetService.getCollectionForMap(mapPath);
      if (!collectionId) return undefined;
      return assetService.getCollectionSettings(collectionId).gridDefaults;
    };
  }

  private setupViewportClickHandler(): void {
    // Empty — clear-selection-on-empty-space logic is now handled by
    // TokenRenderer.onViewportPointerDown (step 4) where all hit-testing
    // is centralized, avoiding listener ordering issues.
  }

  // ─── Wall tool viewport handlers ─────────────────────────────────────

  // Wall coordinates are never snapped to the grid — walls need freeform
  // placement to align with map artwork regardless of grid settings.

  private handleWallPointerDown(worldX: number, worldY: number, shiftHeld: boolean, ctrlHeld: boolean): boolean {
    if (!this.wallInteraction || !this.wallTool) return false;

    // Door placement mode: click confirms placement
    if (this.wallInteraction.isPlacingDoor()) {
      this.wallInteraction.confirmDoorPlacement();
      return true;
    }

    const settings = this.wallTool.getSettings();

    // Shift + click on existing vertex: continue drawing a new chain from that endpoint
    if (shiftHeld && !ctrlHeld && settings.mode === 'point-to-point' && settings.subMode === 'draw' && this.wallRenderer) {
      const vertexHit = this.wallRenderer.hitTestVertices(worldX, worldY);
      if (vertexHit) {
        const wall = this.store.getState().objects.walls[vertexHit.wallId];
        if (wall) {
          const endpoint = wall[vertexHit.vertex];
          this.wallTool.continueFromEndpoint(endpoint.x, endpoint.y);
          this.wallRenderer.setPreviewAnchor(endpoint);
          return true;
        }
      }

      // Shift + click on a wall LINE (not vertex): split the segment at click point
      const wallId = this.wallRenderer.hitTestWalls(worldX, worldY);
      if (wallId) {
        this.splitWallAtPoint(wallId, worldX, worldY);
        return true;
      }
    }

    // Without Shift (or with Ctrl for multi-select): let WallInteraction handle
    // selection, vertex dragging, door toggling, and light selection
    if (!shiftHeld || ctrlHeld) {
      const handled = this.wallInteraction.handlePointerDown(worldX, worldY, ctrlHeld);
      if (handled) {
        this.wallRenderer?.clearPreview();
        return true;
      }
    }

    // Place-light sub-mode — default radii in game units (30ft bright, 60ft dim),
    // converted to world pixels using the grid settings
    if (settings.subMode === 'place-light') {
      const grid = this.store.getState().grid;
      const gridSize = grid?.size ?? 70;
      const unitDist = grid?.unitDistance ?? 5;
      const defaultBrightUnits = 30;
      const defaultDimUnits = 60;
      const brightPx = (defaultBrightUnits / unitDist) * gridSize;
      const dimPx = (defaultDimUnits / unitDist) * gridSize;

      this.store.getState().addLight({
        x: worldX,
        y: worldY,
        innerRadius: brightPx,
        outerRadius: dimPx,
        color: '#ff9933',
        lightStyle: 'torch',
      });
      return true;
    }

    // Point-to-point mode: pass shiftHeld so the tool knows whether to chain
    if (settings.mode === 'point-to-point') {
      this.wallTool.addVertex(worldX, worldY, shiftHeld);
      return true;
    }

    // Freeform mode — also check if clicking on an existing vertex to continue from there
    if (settings.mode === 'freeform') {
      let startX = worldX;
      let startY = worldY;

      if (this.wallRenderer) {
        const vertexHit = this.wallRenderer.hitTestVertices(worldX, worldY);
        if (vertexHit) {
          const wall = this.store.getState().objects.walls[vertexHit.wallId];
          if (wall) {
            const ep = wall[vertexHit.vertex];
            startX = ep.x;
            startY = ep.y;
          }
        }
      }

      this.wallTool.startFreeform(startX, startY);
      this.wallRenderer?.startFreeformPreview(startX, startY);
      return true;
    }

    return false;
  }

  private handleWallPointerMove(worldX: number, worldY: number): void {
    if (!this.wallInteraction || !this.wallTool) return;

    // Door placement preview: slide door along the wall
    if (this.wallInteraction.isPlacingDoor()) {
      this.wallInteraction.updateDoorPlacement(worldX, worldY);
      return;
    }

    // Vertex / light dragging
    if (this.wallInteraction.isDragging()) {
      this.wallInteraction.handlePointerMove(worldX, worldY);
      return;
    }

    // Live preview: update cursor position for the preview line
    if (this.wallTool.isCurrentlyDrawing() && this.wallTool.getSettings().mode === 'point-to-point') {
      this.wallRenderer?.updatePreviewCursor(worldX, worldY);
    }

    // Freeform drawing — add point to tool AND preview
    if (this.wallTool.isCurrentlyDrawing() && this.wallTool.getSettings().mode === 'freeform') {
      this.wallTool.addFreeformPoint(worldX, worldY);
      this.wallRenderer?.addFreeformPreviewPoint(worldX, worldY);
    }
  }

  private handleWallPointerUp(): void {
    if (!this.wallInteraction || !this.wallTool) return;

    this.wallInteraction.handlePointerUp();

    // Finish freeform drawing on pointer up — clear preview
    if (this.wallTool.isCurrentlyDrawing() && this.wallTool.getSettings().mode === 'freeform') {
      this.wallTool.finishFreeform();
      this.wallRenderer?.clearFreeformPreview();
    }
  }

  /** Handle audio tool pointer down: click to select existing source or place new one */
  private handleAudioPointerDown(worldX: number, worldY: number): boolean {
    if (!this.audioRenderer || !this.audioTool || !this.soundRegistry) return false;

    // Check if clicking on an existing audio source
    const hitId = this.audioRenderer.hitTestAudioSources(worldX, worldY);
    if (hitId) {
      this.audioRenderer.setSelectedAudio(hitId);
      // Open config panel
      if (this.viewport) {
        const screenPos = this.viewport.toScreen(worldX, worldY);
        const canvasRect = this.pixiAppManager.getCanvasElement()?.getBoundingClientRect();
        const sx = (canvasRect?.left ?? 0) + screenPos.x;
        const sy = (canvasRect?.top ?? 0) + screenPos.y;
        openAudioConfigPanel(
          hitId,
          this.store,
          this.soundRegistry,
          (soundId) => this.previewSound(soundId),
          sx,
          sy,
        );
      }
      return true;
    }

    // Place a new audio source
    const settings = this.audioTool.getSettings();
    const grid = this.store.getState().grid;
    const gridSize = grid?.size ?? 70;
    const unitDist = grid?.unitDistance ?? 5;
    const innerPx = (10 / unitDist) * gridSize;  // Default 10 game units
    const outerPx = (30 / unitDist) * gridSize;  // Default 30 game units

    const newId = this.store.getState().addAudio({
      x: worldX,
      y: worldY,
      innerRadius: innerPx,
      outerRadius: outerPx,
      volume: settings.defaultVolume,
      soundId: settings.defaultSoundId,
      loop: true,
    });

    this.audioRenderer.setSelectedAudio(newId);

    // Open config panel for the new source
    if (this.viewport) {
      const screenPos = this.viewport.toScreen(worldX, worldY);
      const canvasRect = this.pixiAppManager.getCanvasElement()?.getBoundingClientRect();
      const sx = (canvasRect?.left ?? 0) + screenPos.x;
      const sy = (canvasRect?.top ?? 0) + screenPos.y;
      openAudioConfigPanel(
        newId,
        this.store,
        this.soundRegistry,
        (soundId) => this.previewSound(soundId),
        sx,
        sy,
      );
    }

    return true;
  }

  private previewSound(soundId: string): void {
    if (!this.spatialAudioEngine) return;
    runInBackground(
      this.spatialAudioEngine.previewSound(soundId),
      `Previewing sound ${soundId}`,
      'Could not play the sound preview',
    );
  }

  /**
   * Split a wall segment into two at the nearest point on the line to the click.
   * Both new segments inherit the original's type, chainId, and properties.
   */
  private splitWallAtPoint(wallId: string, worldX: number, worldY: number): void {
    const state = this.store.getState();
    const wall = state.objects.walls[wallId];
    if (!wall) return;

    // Project the click onto the segment to get the exact split point
    const dx = wall.p2.x - wall.p1.x;
    const dy = wall.p2.y - wall.p1.y;
    const lenSq = dx * dx + dy * dy;
    if (lenSq === 0) return;

    const t = Math.max(0.05, Math.min(0.95,
      ((worldX - wall.p1.x) * dx + (worldY - wall.p1.y) * dy) / lenSq
    ));
    const splitPoint = {
      x: wall.p1.x + t * dx,
      y: wall.p1.y + t * dy,
    };

    // Delete the original segment
    state.deleteWall(wallId);

    // Create two new segments sharing the same chainId and properties
    const shared = {
      type: wall.type,
      ...(wall.chainId !== undefined && { chainId: wall.chainId }),
      ...(wall.closed !== undefined && { closed: wall.closed }),
      ...(wall.direction !== undefined && { direction: wall.direction }),
    };

    state.addWall({ ...shared, p1: wall.p1, p2: splitPoint });
    state.addWall({ ...shared, p1: splitPoint, p2: wall.p2 });
  }

  private showLightContextMenu(lightId: string, screenX: number, screenY: number): void {
    const light = this.store.getState().objects.lights[lightId];
    if (!light) return;

    const currentStyle = light.lightStyle ?? 'torch';
    const currentColor = light.color ?? '#ff9933';

    const entries: ContextMenuEntry[] = [];

    // Configure — opens the full config panel near the light
    entries.push({
      type: 'item',
      label: 'Configure Light',
      icon: 'settings',
      onClick: () => openLightConfigPanel(lightId, this.store, screenX, screenY),
    });

    entries.push({ type: 'separator' });

    // Light style submenu
    const styleOptions: Array<{ label: string; value: 'torch' | 'magic' | 'steady' }> = [
      { label: 'Torch (Flickering)', value: 'torch' },
      { label: 'Magic (Pulsing)', value: 'magic' },
      { label: 'Steady (Static)', value: 'steady' },
    ];

    entries.push({
      type: 'submenu',
      label: 'Light Style',
      icon: 'flame',
      children: styleOptions.map(opt => ({
        type: 'item' as const,
        label: opt.label,
        checked: currentStyle === opt.value,
        onClick: () => {
          this.store.getState().updateLight(lightId, { lightStyle: opt.value });
        },
      })),
    });

    // Light color submenu
    const colorOptions = [
      { label: 'Warm Orange (Torch)', value: '#ff9933' },
      { label: 'Golden Yellow (Candle)', value: '#ffcc44' },
      { label: 'Cool White (Moonlight)', value: '#ccddff' },
      { label: 'Blue (Magic)', value: '#4488ff' },
      { label: 'Purple (Arcane)', value: '#aa44ff' },
      { label: 'Green (Fey)', value: '#44ff88' },
      { label: 'Red (Infernal)', value: '#ff4433' },
      { label: 'White (Daylight)', value: '#ffffff' },
    ];

    entries.push({
      type: 'submenu',
      label: 'Light Color',
      icon: 'palette',
      children: colorOptions.map(opt => ({
        type: 'item' as const,
        label: opt.label,
        checked: currentColor === opt.value,
        onClick: () => {
          this.store.getState().updateLight(lightId, { color: opt.value });
        },
      })),
    });

    entries.push({ type: 'separator' });

    // Delete
    entries.push({
      type: 'item',
      label: 'Delete Light',
      icon: 'trash-2',
      onClick: () => {
        this.store.getState().deleteLight(lightId);
      },
    });

    openContextMenuGlobal(entries, { x: screenX, y: screenY });
  }

  private showWallContextMenu(worldX: number, worldY: number, screenX: number, screenY: number): void {
    if (!this.wallInteraction || !this.wallRenderer) return;

    // Check if right-clicking a light source — show light menu instead
    const hitLightId = this.wallRenderer.hitTestLights(worldX, worldY);
    if (hitLightId) {
      this.showLightContextMenu(hitLightId, screenX, screenY);
      return;
    }

    // If right-clicking on a wall that isn't selected, select it first
    const hitWallId = this.wallRenderer.hitTestWalls(worldX, worldY)
      ?? this.wallRenderer.hitTestVertices(worldX, worldY)?.wallId;
    if (hitWallId && !this.wallInteraction.getSelectedWallIds().includes(hitWallId)) {
      this.wallInteraction.handlePointerDown(worldX, worldY, false);
    }

    if (!this.wallInteraction.hasSelection()) return;

    const selectedWallIds = this.wallInteraction.getSelectedWallIds();
    const walls = this.store.getState().objects.walls;

    // Determine current state for showing checkmarks
    const currentDirections = new Set(selectedWallIds.map(id => walls[id]?.direction ?? 'both'));

    const entries: ContextMenuEntry[] = [];

    // Door placement (only for single solid/non-door walls)
    const isSingleWall = selectedWallIds.length === 1;
    const singleWall = isSingleWall ? walls[selectedWallIds[0]!] : null;
    const canPlaceDoor = singleWall && singleWall.type === 'solid';

    if (canPlaceDoor) {
      entries.push({
        type: 'item',
        label: 'Place Door',
        icon: 'door-open',
        onClick: () => this.wallInteraction!.startDoorPlacement(singleWall.id, 'door'),
      });
      entries.push({
        type: 'item',
        label: 'Place Secret Door',
        icon: 'lock',
        onClick: () => this.wallInteraction!.startDoorPlacement(singleWall.id, 'secret-door'),
      });
      entries.push({ type: 'separator' });
    }

    // Light pass-through direction submenu
    entries.push({
      type: 'submenu',
      label: 'Light Direction',
      icon: 'arrow-left-right',
      children: [
        {
          type: 'item' as const,
          label: 'Block Both Sides',
          checked: currentDirections.size === 1 && currentDirections.has('both'),
          onClick: () => this.wallInteraction!.setSelectedDirection(undefined),
        },
        {
          type: 'item' as const,
          label: 'Allow From Left',
          checked: currentDirections.size === 1 && currentDirections.has('left'),
          onClick: () => this.wallInteraction!.setSelectedDirection('left'),
        },
        {
          type: 'item' as const,
          label: 'Allow From Right',
          checked: currentDirections.size === 1 && currentDirections.has('right'),
          onClick: () => this.wallInteraction!.setSelectedDirection('right'),
        },
      ],
    });

    entries.push({ type: 'separator' });

    // Delete
    entries.push({
      type: 'item',
      label: `Delete${selectedWallIds.length > 1 ? ` (${selectedWallIds.length} walls)` : ''}`,
      icon: 'trash-2',
      onClick: () => this.wallInteraction!.deleteSelected(),
    });

    openContextMenuGlobal(entries, { x: screenX, y: screenY });
  }

  destroy(): void {
    if (this._isDestroyed) return;
    this._isDestroyed = true;
    this._unsubscribeFromToolChanges?.();
    delete this._unsubscribeFromToolChanges;
    
    this._unsubscribeFromGridVisibility?.();
    delete this._unsubscribeFromGridVisibility;
    

    if (this.gridInitRetryTimeout) {
      window.clearTimeout(this.gridInitRetryTimeout);
      this.gridInitRetryTimeout = null;
    }
    
    // Remove keyboard handler
    if (this.keyboardHandler) {
      document.removeEventListener('keydown', this.keyboardHandler);
      this.keyboardHandler = null;
    }

    // Remove peek hotkey handlers
    if (this.peekKeydownHandler) {
      document.removeEventListener('keydown', this.peekKeydownHandler);
      this.peekKeydownHandler = null;
    }
    if (this.peekKeyupHandler) {
      document.removeEventListener('keyup', this.peekKeyupHandler);
      this.peekKeyupHandler = null;
    }
    
    // Remove viewport click handler
    if ((this as any)._viewportClickHandler && this.viewport) {
      this.viewport.off('pointerdown', (this as any)._viewportClickHandler);
      (this as any)._viewportClickHandler = null;
    }
    
    // Remove drawing tool handlers

    this.tokenRenderer?.destroy(); // Destroy TokenRenderer
    this.pinRenderer?.destroy(); // Destroy PinRenderer
    this.fogRenderer?.destroy(); // Destroy FogRenderer
    this.measureRenderer?.destroy(); // Destroy MeasureRenderer
    this.laserPointerRenderer?.destroy(); // Destroy LaserPointerRenderer
    this.drawingRenderer?.destroy(); // Destroy DrawingRenderer
    this.drawingInteraction?.destroy();
    this.textRenderer?.destroy(); // Destroy TextRenderer
    this.backgroundRenderer?.destroy(); // Destroy BackgroundRenderer
    this.textTool?.destroy(); // Destroy TextTool
    this.visionRenderer?.destroy();
    this.wallRenderer?.destroy();
    this.wallInteraction?.destroy();
    this.audioRenderer?.destroy();
    this.spatialAudioEngine?.dispose();
    this.bufferCache?.dispose();
    this.gridSystem?.destroy(); // Destroy GridSystem
    this.selectionManager?.destroy(); // Destroy SelectionManager
    
    // Clean up background sprite and texture
    if (this.backgroundSprite) {
      // Remove from parent if needed
      if (this.backgroundSprite.parent) {
        this.backgroundSprite.parent.removeChild(this.backgroundSprite);
      }
      
      // Unload the texture if we have its URL
      if (this.backgroundTextureUrl) {
        Assets.unload(this.backgroundTextureUrl).catch(err => {
          console.warn('[PixiRendererOrchestrator] Failed to unload texture:', err);
        });
        this.backgroundTextureUrl = null;
      }
      
      // Destroy the sprite
      this.backgroundSprite.destroy({ children: true, texture: false });
      this.backgroundSprite = null;
      this.eventBus.emit('background-sprite-updated', undefined);
    }

    // Remove event bus listeners
    if (this.waitForTokensLoadedHandler) {
      this.eventBus.off('wait-for-tokens-loaded', this.waitForTokensLoadedHandler);
      this.waitForTokensLoadedHandler = null;
    }
    
    this.pixiAppManager.destroy();

    // Remove viewport position handler
    if (this.getViewportPositionHandler) {
      window.removeEventListener('get-viewport-position', this.getViewportPositionHandler);
      this.getViewportPositionHandler = null;
    }

  }

  private setupEventBusListeners(): void {
    
    
    // Store the listener function so we can remove it later
    this.waitForTokensLoadedHandler = (callback: () => void) => {
      if (this.tokenRenderer) {
        // Force sync tokens before checking if they're loaded
        if ((this.tokenRenderer as any).forceSyncTokens) {
          (this.tokenRenderer as any).forceSyncTokens();
        }
        
        this.tokenRenderer.onWhenAllTokensLoaded(() => {
          callback();
        });
      } else {
        // No token renderer, just call the callback
        callback();
      }
    };
    
    // Listen for token loading completion request
    this.eventBus.on('wait-for-tokens-loaded', this.waitForTokensLoadedHandler);

    // Listen for wall tool settings changes from toolbar UI
    this.eventBus.on('wall-submode-changed', (subMode: string) => {
      this.wallTool?.setSubMode(subMode as 'draw' | 'place-light');
    });
    this.eventBus.on('wall-type-changed', (type: string) => {
      this.wallTool?.setWallType(type as any);
    });
    this.eventBus.on('wall-mode-changed', (mode: string) => {
      this.wallTool?.setMode(mode as 'point-to-point' | 'freeform');
    });

    // Listen for wall segment creation from WallTool
    this.eventBus.on('wall-segment-created', (data: { p1: { x: number; y: number }; p2: { x: number; y: number }; type: string; chainId: string }) => {
      const id = this.store.getState().addWall({
        type: data.type as any,
        p1: data.p1,
        p2: data.p2,
        chainId: data.chainId,
        closed: true,
      });
      // Track for Escape undo
      this.currentChainWallIds.push(id);
      // After placing a segment, update preview anchor to the new endpoint
      if (this.wallTool?.isCurrentlyDrawing()) {
        this.wallRenderer?.setPreviewAnchor(data.p2);
      }
    });

    // Wall chain start: show preview anchor at the first placed point
    this.eventBus.on('wall-chain-start', (data: { x: number; y: number }) => {
      this.currentChainWallIds = [];
      this.wallRenderer?.setPreviewAnchor(data);
    });

    // Wall chain finish: clear preview, keep the walls (they're committed)
    this.eventBus.on('wall-chain-finish', () => {
      this.currentChainWallIds = [];
      this.wallRenderer?.clearPreview();
    });

    // Wall drawing cancelled (Escape): delete all segments from this chain
    this.eventBus.on('wall-drawing-cancelled', () => {
      if (this.currentChainWallIds.length > 0) {
        this.store.getState().deleteWalls(this.currentChainWallIds);
        this.currentChainWallIds = [];
      }
      this.wallRenderer?.clearPreview();
      this.wallRenderer?.clearFreeformPreview();
    });
  }
  
  /**
   * Re-snap all tokens to the grid after grid changes
   */
  private resnapTokensToGrid(): void {
    if (!this.store || !this.gridSystem || !this.tokenRenderer) return;
    
    const state = this.store.getState();
    const snapToGrid = state.grid?.snapToGrid ?? true;
    
    if (!snapToGrid) return;
    
    // Handle position snapping
    const tokens = state.objects?.tokens || {};
    const tokenUpdates: Array<{id: string, x: number, y: number}> = [];
    
    for (const [id, token] of Object.entries(tokens)) {
      // Calculate new snapped position
      const snappedPos = this.gridSystem.snapToCellCenter(token.x, token.y);
      
      // Only update if position actually changed
      if (snappedPos.x !== token.x || snappedPos.y !== token.y) {
        tokenUpdates.push({ id, x: snappedPos.x, y: snappedPos.y });
      }
    }
    
    // Apply all position updates at once
    if (tokenUpdates.length > 0) {
      this.store.getState().setTokenPositions(tokenUpdates);
    }
  }
  
  
} 
