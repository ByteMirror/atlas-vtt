import { App } from 'obsidian';
import { PixiRendererOrchestrator } from '../PixiRendererOrchestrator'; // New import
import { PixiAppManager } from '../pixi/PixiAppManager'; // Import PixiAppManager
import { Container } from 'pixi.js';
import { EventEmitter } from 'events';
import type { ViewAtlasState } from '../storeFactory';
import type { StoreApi } from 'zustand';
import type { SettingsService } from './SettingsService';
import { bindViewportNavigation } from '../pixi/viewportNavigation';

export class RendererService {
  // private renderer: PixiRenderer | null = null; // Old type
  private renderer: PixiRendererOrchestrator | null = null; // New type
  private eventBus: EventEmitter;
  private pixiAppManager: PixiAppManager | null = null; // Add PixiAppManager instance variable
  private store: StoreApi<ViewAtlasState>; // Add store
  private viewId: string;
  private settingsService: SettingsService;
  private unbindNavigation: (() => void) | null = null;

  constructor(
    private app: App,
    eventBus: EventEmitter,
    store: StoreApi<ViewAtlasState>,
    viewId: string,
    settingsService: SettingsService
  ) {
    this.eventBus = eventBus;
    this.store = store;
    this.viewId = viewId;
    this.settingsService = settingsService;
  }
  
  /**
   * Initialize the Pixi renderer
   * @param containerEl The HTML element to attach the renderer to
   * @returns The PixiJS application instance
   */
  public async init(containerEl: HTMLElement): Promise<any> {
    if (!this.renderer) {
      // Create PixiAppManager instance with container dimensions for split-view support
      if (!this.pixiAppManager) {
        // Use container dimensions so the canvas fits its pane in split-view
        const width = containerEl.clientWidth || window.innerWidth;
        const height = containerEl.clientHeight || window.innerHeight;
        this.pixiAppManager = new PixiAppManager(width, height);
      }
      
      // Pass the PixiAppManager instance to the orchestrator
      this.renderer = new PixiRendererOrchestrator(this.app, this.pixiAppManager, this.eventBus, this.store, this.viewId);
      
      try {
        // The orchestrator's init will call pixiAppManager.init
        await this.renderer.init(containerEl);
        const viewport = this.renderer.getViewportInstance();
        if (viewport) {
          this.unbindNavigation = bindViewportNavigation(viewport, this.settingsService);
        }
        this.eventBus.emit('renderer-ready', this.renderer);
        
        return this.getApp(); // This should call getAppInstance on orchestrator
      } catch (error) {
        console.error("[RendererService] Error initializing PixiRendererOrchestrator:", error);
        throw error;
      }
    } else {
      // Don't resize - canvas should maintain fixed size
      return this.getApp(); // This should call getAppInstance on orchestrator
    }
  }
  
  /**
   * Resize the renderer
   * @param width The new width
   * @param height The new height
   */
  public resize(width: number, height: number): void {
    if (this.pixiAppManager) {
      this.pixiAppManager.resize(width, height);
    }
  }


  
  /**
   * Get the Pixi application
   * @returns The Pixi application or null if not initialized
   */
  public getApp(): any { // PixiRendererOrchestrator has getAppInstance()
    return this.renderer ? this.renderer.getAppInstance() : null;
  }
  
  /**
   * Get the actual PixiRenderer instance
   * @returns The PixiRenderer instance or null if not initialized
   */
  public getRenderer(): PixiRendererOrchestrator | null { // Update return type
    return this.renderer;
  }
  
  /**
   * Get the Pixi viewport
   * @returns The Pixi viewport or null if not initialized
   */
  public getViewport(): Container | null { // PixiRendererOrchestrator has getViewportInstance()
    return this.renderer ? this.renderer.getViewportInstance() : null;
  }
  
  /**
   * Get the grid system
   * @returns The grid system or null if not initialized
   */
  public getGridSystem(): any {
    return this.renderer ? this.renderer.getGridSystem() : null;
  }
  
  /**
   * Destroy the renderer
   * Cleans up all resources to prevent WebGL context leaks
   */
  public destroy(): void {
    this.unbindNavigation?.();
    this.unbindNavigation = null;
    if (this.renderer) {
      this.renderer.destroy();
      this.renderer = null;
    }
    if (this.pixiAppManager) {
      this.pixiAppManager = null;
    }
  }
  
  /**
   * Completely recreate the renderer (for map switching)
   * @param containerEl The HTML element to attach the renderer to
   * @returns The new PixiJS application instance
   */
  public async recreate(containerEl: HTMLElement): Promise<any> {
    // Destroy the old renderer completely
    this.destroy();
    
    // Wait a bit to ensure cleanup is complete
    await new Promise(resolve => window.setTimeout(resolve, 100));
    
    // Create everything fresh
    return this.init(containerEl);
  }
  
  /**
   * Check if the renderer is initialized
   * @returns True if the renderer is initialized
   */
  public isInitialized(): boolean {
    return this.renderer !== null;
  }
} 