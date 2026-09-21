import { App, TFile } from 'obsidian';
import { MapController } from '../MapController';
import { EventEmitter } from 'events';
import { RendererService } from './RendererService';
import type { ViewAtlasState, ViewAtlasStore } from '../storeFactory';
import type { MapFile } from './MapPersistence';
import { getHistoryStore } from '../stores/history';

export class MapService {
  private currentMapFilePath: string | null = null;
  private currentMapData: MapFile | null = null;
  private eventBus: EventEmitter;

  /** Map files carry no name of their own; the file name is the map name. */
  private resolveMapName(mapPath: string | null): string {
    if (typeof mapPath === 'string' && mapPath.trim().length > 0) {
      const normalized = mapPath.replace(/\\/g, '/');
      const filename = normalized.split('/').pop() || normalized;
      const withoutExtension = filename.replace(/\.[^.]+$/, '').trim();
      if (withoutExtension.length > 0) {
        return withoutExtension;
      }
    }
    return 'Untitled Map';
  }
  
  constructor(private app: App, eventBus: EventEmitter, private store: ViewAtlasStore) {
    this.eventBus = eventBus;
  }

  /**
   * Load a map from a file
   * @param rendererService The RendererService instance
   * @param filePath The path to the map file
   * @returns A promise that resolves with the loaded map data
   */
  public async loadMap(rendererService: RendererService, filePath: string, restoreCamera: boolean = false): Promise<MapFile | null> {
    // True once the store holds the cleared state of `filePath` instead of the previous map.
    let storeClearedForNewMap = false;
    try {
      // Check if this is a map switch (not initial load)
      const isMapSwitch = this.currentMapFilePath !== null && this.currentMapFilePath !== filePath;
      
      // Show loading overlay FIRST before any state changes
      this.store.getState().setMapLoading(true, 0, 'Loading map...');
      
      // Small delay to ensure loading state is applied before clearing
      await new Promise(resolve => window.setTimeout(resolve, 10));
      
      this.currentMapFilePath = filePath;
      
      // Get the actual renderer object from the service
      const renderer = rendererService.getRenderer();
      if (!renderer) {
        throw new Error('[MapService] Renderer not initialized');
      }
      
      const storeState = this.store.getState();
      
      // Temporarily disable persistence for THIS store only to prevent saving empty state to the map file
      storeState.setPersistenceEnabled(false);
      
      // Flush any pending saves for the CURRENT/OLD map before switching
      // This prevents the debounced save from writing cleared state to the old file
      try {
        // Force immediate save of current state to the old map file
        await this.store.flushStorage();
      } catch (flushError) {
        console.warn('[MapService] Could not flush pending saves:', flushError);
      }
      
      // Small delay to ensure any in-flight saves complete
      await new Promise(resolve => window.setTimeout(resolve, 50));
      
      // Set the new map path BEFORE clearing state
      // This ensures that when clearMapState triggers a save, it saves to the NEW file, not the old one
      storeState.setMapPath(filePath);
      
      // Clear the store state after setting new path
      // This prevents state from bleeding between maps
      
      storeState.clearMapState();
      storeClearedForNewMap = true;
      
      // Get fresh state after clearing
      
      // Clear the undo/redo history when loading a new map and pause tracking
      // so the setup writes below never become undo steps
      const history = getHistoryStore(this.store)?.getState();
      history?.clear();
      history?.pause();
      
      // Update loading progress
      storeState.setMapLoading(true, 20, 'Clearing previous data...');
      
      // Update loading progress
      storeState.setMapLoading(true, 40, 'Loading map image...');
      
      // Load and display the map in the renderer
      // Note: this loads the actual map image and sets up the grid
      this.currentMapData = await MapController.loadAndDisplay(
        this.app,
        renderer,
        filePath,
        restoreCamera
      );
      
      if (this.currentMapData) {
        // Only reinitialize viewport plugins on map switch, not initial load
        if (isMapSwitch) {
          // Emit event that we're about to recreate the renderer
          this.eventBus.emit('renderer-recreating');
          
          // We'll need to recreate the entire renderer after loading is complete
          // This will be handled in AtlasView after map load completes
        }
        
        // Update loading progress
        storeState.setMapLoading(true, 60, 'Restoring map data...');
        
        // Set the background from loaded map data BEFORE rehydration
        // This ensures we have a valid background even if rehydration fails
        if (this.currentMapData.background) {
          storeState.setBackground(this.currentMapData.background);
        }
        
        // Re-hydrate persisted state for this map now that the path is known.
        
        try {
          await this.store.persist.rehydrate();
          const afterRehydration = this.store.getState();
          
          // If this is a new map (no file exists yet), ensure state is truly empty
          // Rehydration with null data might leave old state intact
          if (Object.keys(afterRehydration.objects?.tokens || {}).length > 0) {
            // Check if the map file actually exists
            const mapFile = this.app.vault.getAbstractFileByPath(filePath);
            if (!mapFile) {
              storeState.clearMapState();
            }
          }
        } catch (err) {
          console.error('[MapService] Rehydrate failed:', err);
          // If rehydration fails, ensure state is clear for new maps
          const mapFile = this.app.vault.getAbstractFileByPath(filePath);
          if (!mapFile) {
            storeState.clearMapState();
          }
        }

        // NOW re-enable persistence after successful rehydration
        storeState.setPersistenceEnabled(true);
        
        // Update loading progress
        storeState.setMapLoading(true, 80, 'Loading tokens and pins...');

        // After rehydration, check if we got valid data
        // If not, populate from the map file data we just loaded
        const stateAfterHydration = this.store.getState();
        
        // Only use fallback if rehydration didn't load valid data
        if (!stateAfterHydration.background && this.currentMapData.background) {
          storeState.setBackground(this.currentMapData.background);
        }
        
        if (!stateAfterHydration.grid && this.currentMapData.grid) {
          storeState.setGrid(this.currentMapData.grid);
        }
        
        // For objects, check if the persisted state had the correct schema
        // If the file exists but has old/different data, use what was persisted
        const hasValidPersistedState = stateAfterHydration.schema === 'atlas-vtt';
        
        if (!hasValidPersistedState) {
          // No valid persisted state, use data from map file
          const objects = this.currentMapData.objects;
          if (objects) {
            if (objects.tokens) {
              storeState.setTokens(objects.tokens);
            }
            if (objects.pins) {
              // Update pins using store setState with proper partial state
              this.store.setState((state: ViewAtlasState) => ({
                ...state,
                objects: {
                  ...state.objects,
                  pins: objects.pins
                }
              }));
            }
            if (objects.texts) {
              storeState.setTexts(objects.texts);
            }
            if (objects.drawings) {
              storeState.setDrawings(objects.drawings);
            }
          }
        }
      } else {
        // Failed to load map data, re-enable persistence anyway
        storeState.setPersistenceEnabled(true);
        throw new Error('[MapService] Failed to load map data from MapController');
      }
      
      // Legacy mapData is now mostly for the renderer
      // The state is managed by the persist middleware      
      // Update loading progress
      const finalState = this.store.getState();
      const tokenCount = Object.keys(finalState.objects?.tokens || {}).length;
      const loadingMessage = tokenCount > 0 ? `Loading ${tokenCount} tokens...` : 'Finalizing...';
      storeState.setMapLoading(true, 90, loadingMessage);
      
      // Get current grid settings from store (live settings) instead of static map file data
      const currentGridSettings = this.store.getState().grid;
      
      const mapInitData = {
        mapPath: this.currentMapFilePath || '',
        mapName: this.resolveMapName(this.currentMapFilePath),
        background: this.currentMapData?.background,
        grid: currentGridSettings || this.currentMapData?.grid, // Use live grid settings if available
        tokens: finalState.objects?.tokens ?? {},
        fog: finalState.objects?.fog ?? {},
        tokenSettings: finalState.tokenSettings,
      };
      this.eventBus.emit('map-loaded', mapInitData);

      // Wait for tokens to load before hiding the loading screen
      const hideLoadingScreen = () => {
        this.store.getState().setMapLoading(false);

        // Resume history tracking now that map load is complete
        getHistoryStore(this.store)?.getState().resume();
      };
      
      // Small delay to ensure renderer is ready
      window.setTimeout(() => {
        // Emit event to wait for tokens
        this.eventBus.emit('wait-for-tokens-loaded', hideLoadingScreen);
      }, 100);
      
      return this.currentMapData;
    } catch (error) {
      console.error('[MapService] Error loading map:', error);
      this.currentMapFilePath = null;
      this.currentMapData = null;
      const storeState = this.store.getState();
      // Unbind the cleared store from the file first, or the next save would replace
      // the map that failed to load with an empty one.
      if (storeClearedForNewMap) storeState.setMapPath(null);
      // Ensure persistence is re-enabled even on error
      storeState.setPersistenceEnabled(true);
      
      // Hide loading overlay on error
      storeState.setMapLoading(false);
      
      // Resume history tracking even on error
      getHistoryStore(this.store)?.getState().resume();

      return null;
    }
  }
  
  /**
   * Load a map from a TFile
   * @param rendererService The RendererService instance
   * @param file The TFile object
   * @param restoreCamera Whether to restore camera position from saved state
   * @returns A promise that resolves with the loaded map data
   */
  public async loadMapFromFile(rendererService: RendererService, file: TFile, restoreCamera: boolean = false): Promise<MapFile | null> {
    return this.loadMap(rendererService, file.path, restoreCamera);
  }

  /**
   * Get the current map data
   * @returns The current map data or null if no map is loaded
   */
  public getCurrentMapData(): MapFile | null {
    return this.currentMapData;
  }
  
  /**
   * Get the current map file path
   * @returns The current map file path or null if no map is loaded
   */
  public getCurrentMapFilePath(): string | null {
    return this.currentMapFilePath;
  }
  
  /**
   * Check if a map is loaded
   * @returns True if a map is loaded
   */
  public isMapLoaded(): boolean {
    return this.currentMapData !== null;
  }
}
