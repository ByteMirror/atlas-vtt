import { WorkspaceLeaf, TFile } from "obsidian";
import { AtlasView } from "./atlas-view";

export const PLAYER_VIEW_TYPE = "atlas-vtt-player";

/**
 * PlayerView - A minimal view for players showing only the map and tokens
 * Hides all DM-specific UI elements and features
 */
export class PlayerView extends AtlasView {
  private isPlayerView: boolean = true;
  private playerResizeObserver: ResizeObserver | null = null;
  private playerLastContainerWidth: number = 0;
  private playerLastContainerHeight: number = 0;
  private widgetSettingsUnsubscribe: (() => void) | null = null;
  
  constructor(leaf: WorkspaceLeaf, plugin?: any) {
    // Pass isPlayerView=true to parent constructor
    super(leaf, plugin, true);
    
    // Override to ensure this is always in player mode
    this.setPlayerMode(true);
    
    // Mark this as a player view in the store and set tool
    const currentWidgetSettings = this.atlasStore.getState().widgetSettings;
    this.atlasStore.setState({ 
      activeTool: 'move',
      persistenceEnabled: false, // Disable persistence for player view
      // Ensure widgets are always visible in player view
      widgetSettings: {
        ...currentWidgetSettings,
        globalVisible: true
      }
    });
    
    // Subscribe to widget settings changes and ensure globalVisible stays true
    this.widgetSettingsUnsubscribe = this.atlasStore.subscribe(
      (state) => state.widgetSettings,
      (widgetSettings) => {
        if (!widgetSettings.globalVisible && this.atlasStore.getState().isPlayerView) {
          this.atlasStore.setState({
            widgetSettings: {
              ...widgetSettings,
              globalVisible: true
            }
          });
        }
      }
    );

    this.register(() => {
      if (this.widgetSettingsUnsubscribe) {
        this.widgetSettingsUnsubscribe();
        this.widgetSettingsUnsubscribe = null;
      }
    });
  }

  /** Override to use player view type */
  getViewType(): string {
    return PLAYER_VIEW_TYPE;
  }


  /** Override icon */
  getIcon(): string {
    return "users";
  }

  /** Override onOpen to create minimal UI */
  async onOpen(): Promise<void> {
    const { containerEl } = this;
    containerEl.empty();
    // Add classes to identify player view and plugin root for styling
    containerEl.addClass('atlas-vtt-plugin');
    containerEl.addClass('atlas-vtt-view');
    containerEl.addClass('atlas-player-view');

    try {
      // Wait a bit for the window to be ready
      await new Promise(resolve => window.setTimeout(resolve, 100));
      
      // Ensure container has size
      if (containerEl.clientWidth === 0 || containerEl.clientHeight === 0) {
        console.warn("[PlayerView] Container has no size, setting default dimensions");
        containerEl.addClass('atlas-player-view--fill');
        // Force layout
        void containerEl.offsetHeight;
      }
      
      // Initialize renderer
      const rendererService = this.serviceManager.getRendererService();
      const pixiApp = await rendererService.init(containerEl);
      
      // Mount minimal UI overlay - no toolbar, no context menus
      const uiOverlay = this.serviceManager.getUIOverlay();
      uiOverlay.mount(containerEl, this, pixiApp);
      
      // Ensure move tool is active after renderer initialization
      this.atlasStore.setState({ activeTool: 'move' });
      
      // Force the viewport to enable drag after a short delay
      window.setTimeout(() => {
        const viewport = rendererService.getViewport();
        if (viewport && (viewport as any).plugins) {
          (viewport as any).plugins.resume('drag');
        }
      }, 100);
      
      // Observe container for split-view resize support
      this.setupContainerResizeDetection();
      this.register(() => {
        this.playerResizeObserver?.disconnect();
        this.playerResizeObserver = null;
      });
      
      // If state already has a map, trigger load now
      if (this.file instanceof TFile) {
        await this.onLoadFile(this.file);
      }
    } catch (error) {
      console.error("[PlayerView] Error during onOpen:", error);
    }
  }

  private setupContainerResizeDetection(): void {
    this.playerResizeObserver = new ResizeObserver(() => {
      const currentWidth = this.containerEl.clientWidth;
      const currentHeight = this.containerEl.clientHeight;
      
      if (currentWidth !== this.playerLastContainerWidth || 
          currentHeight !== this.playerLastContainerHeight) {
        this.playerLastContainerWidth = currentWidth;
        this.playerLastContainerHeight = currentHeight;
        
        const rendererService = this.serviceManager.getRendererService();
        rendererService.resize(currentWidth, currentHeight);
      }
    });
    
    this.playerResizeObserver.observe(this.containerEl);
  }

  /** Override tool methods to prevent DM tools from being used */
  public setToolMode(mode: import('./types').ToolMode): void {
    // Only allow select and move modes in player view
    if (mode === 'select' || mode === 'move') {
      super.setToolMode(mode);
    }
  }

  /** Player view is always in player mode */
  public setPlayerMode(isPlayerMode: boolean): void {
    // Always force to true for player view
    super.setPlayerMode(true);
  }

  /** Disable fog tools in player view */
  public setFogBrushSize(size: number): void {
    // No-op in player view
  }

  public clearAllFog(): void {
    // No-op in player view
  }

  /** Disable measurement tools in player view */
  public setMeasureShape(shape: 'line' | 'cone' | 'circle'): void {
    // No-op in player view
  }

  public setMeasurePersistence(persist: boolean): void {
    // No-op in player view
  }

  getDisplayText(): string {
    const mapFilePath = this.serviceManager.getMapService().getCurrentMapFilePath();
    return mapFilePath ? `Player View: ${mapFilePath.split('/').pop()}` : "Player View";
  }
  
  /** Loads the map read-only: no persistence and no camera restore. */
  public async onLoadFile(file: TFile): Promise<void> {
    const rendererService = this.serviceManager.getRendererService();
    if (!rendererService.isInitialized()) {
      console.error('[PlayerView] onLoadFile called before renderer initialised');
      return;
    }
    
    // Ensure persistence is disabled before loading
    this.atlasStore.setState({ persistenceEnabled: false });
    
    // Delegate map loading to MapService - don't restore camera for player view
    await this.serviceManager.getMapService().loadMapFromFile(rendererService, file, false);
    
    // Re-ensure move tool is active after map load
    this.atlasStore.setState({ activeTool: 'move' });
    
    // Force viewport drag to be enabled after map loads
    window.setTimeout(() => {
      const viewport = rendererService.getViewport();
      if (viewport && (viewport as any).plugins) {
        (viewport as any).plugins.resume('drag');
      }
    }, 200);
  }
}
