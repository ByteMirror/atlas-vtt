import { FileView, WorkspaceLeaf, TFile, normalizePath, ViewStateResult, Notice } from "obsidian";
import { ServiceManager } from './services/ServiceManager';
import { createViewAtlasStore, ViewAtlasStore } from './storeFactory';
import { getHistoryStore, type HistoryState } from './stores/history';
import { createTabMetaStore, type TabMetaStore } from './stores/tabMetaStore';
import type { SceneTab } from './types/sceneTabTypes';
import type AtlasVTTPlugin from '../../main';
import { claimWorkspaceLeafFocus } from './utils/activeLeafGuard';

export const ATLAS_VIEW_TYPE = "atlas-vtt";

interface TabViewportState {
  centerX: number;
  centerY: number;
  scale: number;
}

interface AtlasViewState {
  mapFilePath: string | null;
  tabs?: SceneTab[];
  activeTabId?: string | null;
  [key: string]: unknown;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function isSceneTab(value: unknown): value is SceneTab {
  return isRecord(value)
    && typeof value.id === 'string'
    && typeof value.filePath === 'string'
    && typeof value.displayName === 'string';
}

function isTabViewportState(value: unknown): value is TabViewportState {
  return isRecord(value)
    && typeof value.centerX === 'number'
    && typeof value.centerY === 'number'
    && typeof value.scale === 'number';
}

/**
 * AtlasView implementation after modularization
 *
 * Responsibilities:
 * 1. Act as a thin orchestrator that delegates to specialized services
 * 2. Handle Obsidian view lifecycle and state management
 * 3. Manage scene tabs for multi-scene navigation within a single view
 * 4. Ensure proper initialization and cleanup of services
 */
export class AtlasView extends FileView {
  private _serviceManager: ServiceManager;
  private currentMapFilePath: string | null = null;
  private store: ViewAtlasStore;
  public tabMetaStore: TabMetaStore;
  private temporalCache: Map<string, Pick<HistoryState, 'pastStates' | 'futureStates'>> = new Map();
  private viewportCache: Map<string, TabViewportState> = new Map();
  public readonly viewId: string;
  private isSwitching: boolean = false;
  private plugin: AtlasVTTPlugin | undefined;
  private resizeObserver: ResizeObserver | null = null;
  private lastContainerWidth: number = 0;
  private lastContainerHeight: number = 0;
  private mapLoadingUnsubscribe: (() => void) | null = null;
  private pendingViewportRestoreRaf: number | null = null;
  private isViewClosing = false;
  private boundClaimLeafFocus: (() => void) | null = null;
  private boundHeaderLeafActivation: ((event: MouseEvent) => void) | null = null;

  constructor(leaf: WorkspaceLeaf, plugin?: AtlasVTTPlugin, isPlayerView: boolean = false) {
    super(leaf);
    // Scene tabs handle deleted maps. Prevent FileView from concurrently replacing
    // or detaching this leaf while Atlas closes the deleted scene's tab.
    this.allowNoFile = true;

    // Store plugin reference
    this.plugin = plugin;

    // Create unique view ID
    this.viewId = `view-${Date.now()}-${Math.random().toString(36).slice(2, 11)}`;

    // Create isolated store for this view with plugin reference for collection service
    // Pass isPlayerView flag during store creation to ensure it's set from the start
    this.store = createViewAtlasStore(this.app, this.viewId, this.plugin, isPlayerView);

    // Create the per-view tab metadata store
    this.tabMetaStore = createTabMetaStore();

    // Initialize the service manager with the view store and plugin
    this._serviceManager = new ServiceManager(this.app, this.store, this.plugin, this.viewId);
  }

  // --- State Management ---

  async setState(state: unknown, result: ViewStateResult): Promise<void> {
    const rendererService = this._serviceManager.getRendererService();

    // Workspace state comes from workspace.json, so every field is validated before use
    const persisted = isRecord(state) ? state : {};
    const stateFilePath = typeof persisted.file === 'string' ? persisted.file : null;

    // Restore tabs from persisted state if present
    const persistedTabs = Array.isArray(persisted.tabs) ? persisted.tabs.filter(isSceneTab) : [];
    const firstTab = persistedTabs[0];
    if (firstTab) {
      const restoredTabs: SceneTab[] = persistedTabs.map((t) => ({
        ...t,
        isLoaded: false,
        isDirty: false,
      }));
      const activeTabId = typeof persisted.activeTabId === 'string' ? persisted.activeTabId : firstTab.id;
      this.tabMetaStore.getState().setTabs(restoredTabs, activeTabId);
    }

    // Restore per-tab viewport positions from persisted state
    if (isRecord(persisted.viewportPerTab)) {
      for (const [tabId, camera] of Object.entries(persisted.viewportPerTab)) {
        if (isTabViewportState(camera)) {
          this.viewportCache.set(tabId, camera);
        }
      }
    }

    // If renderer already exists, we don't want to trigger the full Obsidian
    // view-swap cycle again (which would call `onClose`/`onOpen`). Instead we
    // update our own file reference and load the map.
    if (rendererService.isInitialized()) {
      if (stateFilePath !== null) {
        this.file = this.app.vault.getFileByPath(normalizePath(stateFilePath));
      }

      if (this.file instanceof TFile) {
        await this.onLoadFile(this.file);
      }
    } else {
      // Determine which file to load: the active tab's file (for tab restore),
      // falling back to state.file.  We intentionally skip super.setState()
      // because it may internally call onLoadFile() with the wrong file
      // (the leaf-level file rather than the active tab's file), which would
      // reset the active tab before we can correct it.
      const tabState = this.tabMetaStore.getState();
      const activeTab = tabState.tabs.find((t: SceneTab) => t.id === tabState.activeTabId);
      if (activeTab) {
        const activeFile = this.app.vault.getFileByPath(normalizePath(activeTab.filePath));
        if (activeFile) {
          this.file = activeFile;
        }
      } else if (stateFilePath !== null) {
        this.file = this.app.vault.getFileByPath(normalizePath(stateFilePath));
      }

      await this.onOpen();
    }
  }

  getState(): AtlasViewState {
    const { tabs, activeTabId } = this.tabMetaStore.getState();

    // Snapshot the current viewport position for the active tab — but only
    // when no map is loading.  During load, centerAndFitMap() positions the
    // viewport temporarily and we don't want that to overwrite the user's
    // saved position in the cache.
    if (activeTabId && !this.store.getState().isMapLoading) {
      this.saveViewportState(activeTabId);
    }

    // Build a plain object of viewport positions per tab for persistence
    const viewportPerTab: Record<string, TabViewportState> = {};
    for (const [tabId, camera] of this.viewportCache) {
      viewportPerTab[tabId] = camera;
    }

    return {
      file: this.currentMapFilePath,
      mapFilePath: this.currentMapFilePath,
      tabs,
      activeTabId,
      viewportPerTab,
    };
  }

  getStore(): ViewAtlasStore {
    return this.store;
  }

  getTabMetaStore(): TabMetaStore {
    return this.tabMetaStore;
  }

  async saveMap(): Promise<void> {
    if (this.file instanceof TFile) {
      await this.flushPendingSaves();
    }
  }

  // --- Lifecycle Methods ---

  /** Obsidian will call this when the view is first shown or state is updated. */
  async onOpen(): Promise<void> {
    this.isViewClosing = false;
    const { containerEl } = this;
    containerEl.empty();
    containerEl.addClass('atlas-vtt-plugin');
    containerEl.addClass('atlas-vtt-view');
    containerEl.tabIndex = -1;

    this.detachLeafFocusHandlers();
    this.boundClaimLeafFocus = () => this.claimLeafFocus();
    containerEl.addEventListener('pointerdown', this.boundClaimLeafFocus, true);
    containerEl.addEventListener('pointerenter', this.boundClaimLeafFocus, true);
    this.attachTabHeaderActivationHandler();

    try {
      // Show loading overlay immediately if we have a file to load
      if (this.file instanceof TFile) {
        this.store.getState().setMapLoading(true, 0, 'Initializing...');
      }


      // Initialize renderer
      const rendererService = this._serviceManager.getRendererService();
      const pixiApp = await rendererService.init(containerEl);
      if (this.isViewClosing) {
        return;
      }

      // Mount UI overlay once the renderer is initialized
      const uiOverlay = this._serviceManager.getUIOverlay();
      uiOverlay.mount(containerEl, this, pixiApp);

      // If state already has a map, trigger load now (file property provided by FileView)
      if (this.file instanceof TFile) {
        await this.onLoadFile(this.file);
        if (this.isViewClosing) {
          return;
        }

        // Restore viewport position for the active tab.  We must wait until
        // loading finishes because (a) getState() → saveViewportState would
        // overwrite the cache with centerAndFitMap values while loading, and
        // (b) BackgroundSprite's useEffect calls moveCenter() asynchronously
        // after texture load, which would override an immediate restore.
        const activeTabId = this.tabMetaStore.getState().activeTabId;
        if (activeTabId && this.viewportCache.has(activeTabId)) {
          const doRestore = (): void => {
            if (this.isViewClosing) return;
            if (this.pendingViewportRestoreRaf !== null) {
              window.cancelAnimationFrame(this.pendingViewportRestoreRaf);
            }
            // One extra frame so any remaining React effects (BackgroundSprite
            // moveCenter) have already flushed.
            this.pendingViewportRestoreRaf = window.requestAnimationFrame(() => {
              this.pendingViewportRestoreRaf = null;
              if (this.isViewClosing) return;
              this.restoreViewportState(activeTabId);
            });
          };

          if (!this.store.getState().isMapLoading) {
            doRestore();
          } else {
            this.mapLoadingUnsubscribe?.();
            this.mapLoadingUnsubscribe = this.store.subscribe((state) => {
              if (!state.isMapLoading) {
                this.mapLoadingUnsubscribe?.();
                this.mapLoadingUnsubscribe = null;
                doRestore();
              }
            });
          }
        }
      }

      // Set up window resize detection
      if (!this.isViewClosing) {
        this.setupWindowResizeDetection();
      }
    } catch (error) {
      if (!this.isViewClosing) {
        console.error("[AtlasView] Error during onOpen:", error);
      }
    }
  }

  /** Obsidian will call this when the view is being destroyed. */
  async onClose(): Promise<void> {
    if (this.isViewClosing) {
      return;
    }
    this.isViewClosing = true;

    if (this.mapLoadingUnsubscribe) {
      this.mapLoadingUnsubscribe();
      this.mapLoadingUnsubscribe = null;
    }

    if (this.pendingViewportRestoreRaf !== null) {
      window.cancelAnimationFrame(this.pendingViewportRestoreRaf);
      this.pendingViewportRestoreRaf = null;
    }

    // Pinned note previews keep their scroll and cursor with the map
    this._serviceManager.getNotePreviewUIManager().savePinnedPreviewStates();

    // Flush all pending saves before destroying
    await this.flushPendingSaves();

    // Release cached state
    this.temporalCache.clear();
    this.viewportCache.clear();

    // Clean up resize observer
    if (this.resizeObserver) {
      this.resizeObserver.disconnect();
      this.resizeObserver = null;
    }

    // Clean up event listeners
    this.detachLeafFocusHandlers();
    this.detachTabHeaderActivationHandler();

    // Clean up all services
    this._serviceManager.destroy();
  }



  // --- Tab Management ---

  /**
   * Switch to a specific tab by ID.
   * Flushes pending saves, resolves the file, and loads the scene.
   */
  public async switchToTab(tabId: string): Promise<void> {
    if (this.isSwitching) return;
    this.isSwitching = true;
    try {
      const tabState = this.tabMetaStore.getState();
      const tab = tabState.tabs.find((t: SceneTab) => t.id === tabId);
      if (!tab) {
        console.warn(`[AtlasView] switchToTab: tab not found: ${tabId}`);
        return;
      }

      // Already active — nothing to do
      if (tabState.activeTabId === tabId) return;

      // Flush pending saves before capturing any state snapshots
      await this.flushPendingSaves();

      // Save current tab's undo/redo history and viewport after flush is settled
      if (tabState.activeTabId) {
        this.saveTemporalState(tabState.activeTabId);
        this.saveViewportState(tabState.activeTabId);
      }

      // Resolve the TFile from the tab's filePath
      const abstractFile = this.app.vault.getAbstractFileByPath(normalizePath(tab.filePath));
      if (!(abstractFile instanceof TFile)) {
        new Notice(`Scene file not found: ${tab.filePath}`);
        this.tabMetaStore.getState().removeTab(tabId);
        return;
      }

      // Update FileView's internal file reference
      this.file = abstractFile;

      // Pre-set currentMapFilePath so performSceneLoad does NOT recreate the renderer.
      // The single store stays subscribed — PIXI renderers react to state changes naturally.
      this.currentMapFilePath = abstractFile.path;

      // Set active tab in meta store
      this.tabMetaStore.getState().setActiveTab(tabId);

      // Load the map from disk (clears state, rehydrates, emits map-loaded)
      await this.performSceneLoad(abstractFile);

      // Explicitly ensure history is paused before restoring it
      // (loadMap pauses it, but an explicit pause() is idempotent and safe)
      getHistoryStore(this.store)?.getState().pause();

      // Restore the target tab's undo/redo history and viewport position
      this.restoreTemporalState(tabId);
      this.restoreViewportState(tabId);

      // Tell Obsidian the view state changed so workspace.json is updated
      this.app.workspace.requestSaveLayout();
    } finally {
      this.isSwitching = false;
    }
  }

  /**
   * Close a tab by ID.
   * If closing the active tab, switches to an adjacent tab or closes the view entirely.
   */

  /** Save the current tab's undo/redo history into the temporal cache. */
  private saveTemporalState(tabId: string): void {
    const history = getHistoryStore(this.store);
    if (!history) return;
    const { pastStates, futureStates } = history.getState();
    this.temporalCache.set(tabId, {
      pastStates: [...pastStates],
      futureStates: [...futureStates],
    });
  }

  /** Restore a tab's undo/redo history from the temporal cache (if any). */
  private restoreTemporalState(tabId: string): void {
    const cached = this.temporalCache.get(tabId);
    if (!cached) return;
    getHistoryStore(this.store)?.setState({
      pastStates: cached.pastStates,
      futureStates: cached.futureStates,
    });
  }

  /** Save the current viewport position/zoom for a tab. */
  private saveViewportState(tabId: string): void {
    const viewport = this._serviceManager.getRendererService().getViewport();
    if (!viewport) return;
    this.viewportCache.set(tabId, {
      centerX: viewport.center.x,
      centerY: viewport.center.y,
      scale: viewport.scale.x,
    });
  }

  /** Restore a tab's viewport position/zoom from the cache (if any). */
  private restoreViewportState(tabId: string): void {
    const cached = this.viewportCache.get(tabId);
    if (!cached) return;
    const viewport = this._serviceManager.getRendererService().getViewport();
    if (!viewport) return;
    // setZoom MUST come before moveCenter — moveCenter calculates viewport.x/y
    // using the current scale, so the scale must already be correct.
    viewport.setZoom(cached.scale);
    viewport.moveCenter(cached.centerX, cached.centerY);
  }

  public async closeTab(tabId: string): Promise<void> {
    if (this.isSwitching) return;

    const tabState = this.tabMetaStore.getState();
    const tab = tabState.tabs.find((t: SceneTab) => t.id === tabId);
    if (!tab) return;

    const wasActive = tabState.activeTabId === tabId;

    // Flush pending saves before closing
    await this.flushPendingSaves();

    // Remove the tab from store (this also picks an adjacent tab as active)
    this.tabMetaStore.getState().removeTab(tabId);

    // Clean up cached state for this tab
    this.temporalCache.delete(tabId);
    this.viewportCache.delete(tabId);

    const updatedTabState = this.tabMetaStore.getState();

    // If no tabs remain, close the entire leaf
    if (updatedTabState.tabs.length === 0) {
      this.leaf.detach();
      return;
    }

    // If the closed tab was active, switch to the newly active scene
    if (wasActive && updatedTabState.activeTabId) {
      const nextTabId = updatedTabState.activeTabId;
      // removeTab selected the neighbour in metadata, but its map is not loaded yet.
      // Clear that selection so switching loads it without caching the closed map
      // over the neighbour's saved viewport and history.
      this.tabMetaStore.setState({ activeTabId: null });
      await this.switchToTab(nextTabId);
    }

    // Tell Obsidian the view state changed so workspace.json is updated
    this.app.workspace.requestSaveLayout();
  }

  /**
   * Update a tab's file path after a vault rename/move.
   * Also updates the internal file reference if the renamed file is the active scene.
   */
  public updateTabFilePath(oldPath: string, newPath: string, newName: string): void {
    const tabState = this.tabMetaStore.getState();
    const tab = tabState.getTabByFilePath(oldPath);
    if (!tab) return;

    tabState.updateTabFilePath(oldPath, newPath, newName);

    if (this.currentMapFilePath === oldPath) {
      this.currentMapFilePath = newPath;
      this.file = this.app.vault.getFileByPath(newPath);
    }
  }

  /**
   * Lets `rewrite` replace the active scene's file, then loads the scene again
   * from it, keeping the camera where it is. Pending changes are saved first
   * and nothing the store holds can be saved over the rewritten file. The
   * reload clears the scene's undo history, like opening a map does.
   */
  public async reloadActiveScene(rewrite: (file: TFile) => Promise<void>): Promise<void> {
    const file = this.file;
    const tabId = this.tabMetaStore.getState().activeTabId;
    if (!(file instanceof TFile) || this.isSwitching) return;

    this.isSwitching = true;
    try {
      await this.flushPendingSaves();
      if (tabId) this.saveViewportState(tabId);

      this.store.getState().setPersistenceEnabled(false);
      try {
        await rewrite(file);
      } catch (error) {
        this.store.getState().setPersistenceEnabled(true);
        throw error;
      }

      await this.performSceneLoad(file);
      if (tabId) this.restoreViewportState(tabId);
    } finally {
      this.isSwitching = false;
    }
  }

  /**
   * Open the scene browser via the plugin's global asset manager.
   */
  public openSceneBrowser(): void {
    this.plugin?.globalAssetManager?.open('scenes');
  }

  // --- Scene Loading ---

  /** Obsidian will call this each time a file is loaded into this view (including first open). */
  public async onLoadFile(file: TFile): Promise<void> {
    const tabState = this.tabMetaStore.getState();
    const existingTab = tabState.getTabByFilePath(file.path);

    if (existingTab) {
      // File is already a tab
      if (tabState.activeTabId === existingTab.id) {
        await this.performSceneLoad(file);
        this.tabMetaStore.getState().markTabLoaded(existingTab.id);
      } else {
        await this.switchToTab(existingTab.id);
      }
    } else {
      await this.flushPendingSaves();

      // Save current tab's temporal + viewport state before loading a new scene
      if (tabState.activeTabId) {
        this.saveTemporalState(tabState.activeTabId);
        this.saveViewportState(tabState.activeTabId);
      }

      const displayName = file.basename;
      const tabId = tabState.addTab(file.path, displayName);

      // Update FileView's file reference so Obsidian's leaf tracks the current file
      this.file = file;

      // Perform the scene load (single store — loadMap handles clear + rehydrate)
      await this.performSceneLoad(file);
      this.tabMetaStore.getState().markTabLoaded(tabId);
    }

    // Tell Obsidian the view state changed so workspace.json is updated
    this.app.workspace.requestSaveLayout();
  }

  /**
   * Core scene-loading logic extracted from the original onLoadFile.
   * Handles loading state, renderer recreation on map switch, and map data loading.
   */
  private async performSceneLoad(file: TFile): Promise<void> {
    // Immediately set loading state when file changes
    this.store.getState().setMapLoading(true, 0, 'Preparing...');

    const previousMapPath = this.currentMapFilePath;
    this.currentMapFilePath = file.path;

    const rendererService = this._serviceManager.getRendererService();
    if (!rendererService.isInitialized()) {
      console.error('[AtlasView] performSceneLoad called before renderer initialised');
      this.store.getState().setMapLoading(false);
      return;
    }

    // Check if this is a map switch (not the initial load).
    // For tab switches, currentMapFilePath is pre-set so this is false — no recreation needed.
    const isMapSwitch = previousMapPath !== null && previousMapPath !== file.path;

    if (isMapSwitch) {
      const uiOverlay = this._serviceManager.getUIOverlay();

      // Unmount UI
      uiOverlay.unmount();

      // Recreate the entire renderer
      await rendererService.recreate(this.containerEl);

      // Get the new PIXI app instance
      const pixiApp = rendererService.getApp();

      // Remount UI with the new renderer
      uiOverlay.mount(this.containerEl, this, pixiApp);

      // Small delay to ensure everything is ready
      await new Promise(resolve => window.setTimeout(resolve, 100));
    }

    const mapService = this._serviceManager.getMapService();
    await mapService.loadMapFromFile(rendererService, file);
  }

  // --- Persistence Helpers ---

  /**
   * Flush any pending debounced saves to disk immediately.
   * Used before tab switches and view close to ensure data is not lost.
   */
  private async flushPendingSaves(): Promise<void> {
    try {
      await this.store.flushStorage();
    } catch (error) {
      console.error('[AtlasView] Error flushing saves:', error);
    }
  }

  private claimLeafFocus(): void {
    if (this.isViewClosing) {
      return;
    }

    claimWorkspaceLeafFocus(this.app.workspace, this.leaf, this.containerEl);
  }

  private detachLeafFocusHandlers(): void {
    if (!this.boundClaimLeafFocus) {
      return;
    }

    this.containerEl.removeEventListener('pointerdown', this.boundClaimLeafFocus, true);
    this.containerEl.removeEventListener('pointerenter', this.boundClaimLeafFocus, true);
    this.boundClaimLeafFocus = null;
  }

  private attachTabHeaderActivationHandler(): void {
    this.detachTabHeaderActivationHandler();

    const tabHeaderEl = (this.leaf as WorkspaceLeaf & { tabHeaderEl?: HTMLElement | null }).tabHeaderEl;
    if (!tabHeaderEl) {
      return;
    }

    this.boundHeaderLeafActivation = () => {
      this.app.workspace.setActiveLeaf(this.leaf, { focus: false });
    };

    tabHeaderEl.addEventListener('mousedown', this.boundHeaderLeafActivation, true);
  }

  private detachTabHeaderActivationHandler(): void {
    if (!this.boundHeaderLeafActivation) {
      return;
    }

    const tabHeaderEl = (this.leaf as WorkspaceLeaf & { tabHeaderEl?: HTMLElement | null }).tabHeaderEl;
    tabHeaderEl?.removeEventListener('mousedown', this.boundHeaderLeafActivation, true);
    this.boundHeaderLeafActivation = null;
  }

  // --- Tool Mode Delegations ---

  /**
   * Set the active tool mode
   * Delegates to ToolController
   */
  public setToolMode(mode: import('./types').ToolMode): void {
    this._serviceManager.getToolController().setToolMode(mode);
  }

  /**
   * Toggle player/DM mode
   * Delegates to ToolController
   */
  public setPlayerMode(isPlayerMode: boolean): void {
    this._serviceManager.getToolController().setPlayerMode(isPlayerMode);
  }

  public isInPlayerMode(): boolean {
    return this._serviceManager.getToolController().isInPlayerMode();
  }

  /**
   * Toggle drawing/normal mode
   * Delegates to ToolController
   */
  public setDrawingMode(isDrawingMode: boolean): void {
    this._serviceManager.getToolController().setDrawingMode(isDrawingMode);
  }

  /**
   * Toggle grid visibility
   * Delegates to ToolController and GridManager
   */
  public toggleGrid(): void {
    const toolController = this._serviceManager.getToolController();
    const rendererService = this._serviceManager.getRendererService();
    const gridManager = this._serviceManager.getGridManager();
    const mapService = this._serviceManager.getMapService();

    if (!rendererService.isInitialized()) {
      console.warn('[AtlasView] Cannot toggle grid: renderer not initialized');
      return;
    }

    // Get the actual renderer
    const renderer = rendererService.getRenderer();
    if (!renderer) {
      console.warn('[AtlasView] Cannot toggle grid: renderer not available');
      return;
    }

    // Get the current map data
    const mapData = mapService.getCurrentMapData();

    // Toggle the grid visibility in both the tool controller and grid manager
    toolController.toggleGrid();
    gridManager?.toggle(renderer, mapData);
  }

  /**
   * Set fog brush size
   * Delegates to ToolController
   */
  public setFogBrushSize(size: number): void {
    this._serviceManager.getToolController().setFogBrushSize(size);
  }

  /**
   * Clear all fog
   * Delegates to ToolController
   */
  public clearAllFog(): void {
    this._serviceManager.getToolController().clearAllFog();
  }

  /**
   * Set measurement shape
   * Delegates to ToolController
   */
  public setMeasureShape(shape: 'line' | 'cone' | 'circle'): void {
    this._serviceManager.getToolController().setMeasureShape(shape);
  }

  /**
   * Set measurement persistence
   * Delegates to ToolController
   */
  public setMeasurePersistence(persist: boolean): void {
    this._serviceManager.getToolController().setMeasurePersistence(persist);
  }

  /**
   * Get the service manager
   * Exposes the service manager for UI components
   */
  public get serviceManager(): ServiceManager {
    return this._serviceManager;
  }

  /**
   * Get the store
   * Exposes the store for UI components
   */
  public get atlasStore(): typeof this.store {
    return this.store;
  }

  /* ------------------------------------------------------------------ */
  /* Obsidian view metadata                                             */
  /* ------------------------------------------------------------------ */
  getViewType(): string {
    return ATLAS_VIEW_TYPE;
  }

  getDisplayText(): string {
    // Display the map name if available
    const mapFilePath = this._serviceManager.getMapService().getCurrentMapFilePath();
    return mapFilePath ? `Atlas: ${mapFilePath.split('/').pop()}` : "Atlas Canvas";
  }

  getIcon(): string {
    return "map";
  }

  /**
   * Expose the PixiRenderer for React UI components
   */
  public get renderer() {
    return this._serviceManager.getRendererService().getRenderer();
  }

  /**
   * Sets up window resize detection to update the PIXI canvas
   * Only responds to actual window size changes, not container changes
   */
  private setupWindowResizeDetection(): void {
    if (this.resizeObserver) {
      this.resizeObserver.disconnect();
      this.resizeObserver = null;
    }

    // Observe the actual container element so PIXI sizes to the pane, not the window
    this.resizeObserver = new ResizeObserver(() => {
      const currentWidth = this.containerEl.clientWidth;
      const currentHeight = this.containerEl.clientHeight;

      // Only resize if the container dimensions actually changed
      if (currentWidth !== this.lastContainerWidth ||
          currentHeight !== this.lastContainerHeight) {

        this.lastContainerWidth = currentWidth;
        this.lastContainerHeight = currentHeight;

        // Resize the renderer to match the container
        const rendererService = this._serviceManager.getRendererService();
        rendererService.resize(currentWidth, currentHeight);
      }
    });

    // Observe the container element for size changes (fires immediately)
    this.resizeObserver.observe(this.containerEl);
  }
}
