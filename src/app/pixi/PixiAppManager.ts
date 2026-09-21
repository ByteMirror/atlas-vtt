import { Application, Ticker } from "pixi.js";
import { Viewport } from "pixi-viewport";

export class PixiAppManager {
  private _isDestroyed: boolean = false;
  public app: Application;
  public viewport: Viewport | null = null;
  private width: number;
  private height: number;
  private canvasEl: HTMLCanvasElement;
  private _canvasContextMenuPreventer: ((e: Event) => void) | null = null;
  public onRecoverCallback?: () => void;

  constructor(initialWidth: number, initialHeight: number) {
    this.width = initialWidth;
    this.height = initialHeight;
    this.canvasEl = createEl('canvas');
    this.app = new Application();
  }

  async init(containerEl: HTMLElement): Promise<void> {
    if (this._isDestroyed) {
      console.warn("[PixiAppManager] init called on destroyed instance.");
      return;
    }
    try {
      await this.app.init({
        canvas: this.canvasEl,
        width: this.width,
        height: this.height,
        backgroundColor: 0xf4e8d0, // Default parchment color
        backgroundAlpha: 1,
        antialias: true,
        autoDensity: true,
        resolution: window.devicePixelRatio || 1,
      });

      this.app.stage.eventMode = 'static'; // Or 'passive'. 'static' means it can be an event target.
      this.app.stage.interactiveChildren = true;
      this.app.stage.hitArea = this.app.screen; // Ensure the stage hit area covers the screen

      this.app.ticker.start();
      // Add a ticker log and ensure stage is rendered each tick
      let errorCount = 0;
      const MAX_ERRORS = 5;
      
      this.app.ticker.add(() => { 
        // Let PixiJS handle rendering optimally instead of forcing manual renders
        if (this._isDestroyed) {
          this.app.ticker.stop();
          return;
        }
        
        // Only perform error recovery if needed, don't force render
        if (errorCount >= MAX_ERRORS) {
          console.error('[PixiAppManager] Too many errors detected, attempting recovery');
          this.app.ticker.stop();
          
          // Attempt to recover by recreating the renderer
          window.setTimeout(() => {
            if (this.onRecoverCallback) {
              this.onRecoverCallback();
            }
          }, 1000);
        }
      });
      
      containerEl.appendChild(this.canvasEl);
      Object.assign(this.canvasEl.style, {
        position: 'absolute',
        top: '0',
        left: '0',
        width: `${this.width}px`,
        height: `${this.height}px`,
        touchAction: 'none', // Prevent touch scrolling
        userSelect: 'none'  // Prevent text selection
      });
      this.canvasEl.id = 'atlas-pixi-canvas-debug'; // For debugging

      this.initViewport(); // Initialize viewport and add to stage
      
      // Force a single render AFTER viewport is part of the stage
      if(this.app.renderer && this.app.stage) {
          this.app.renderer.render(this.app.stage);
      }

    } catch (error) {
      console.error("[PixiAppManager] Initialization error:", error);
      throw error;
    }
  }

  public initViewport(): void {
    if (!this.app.renderer) {
        console.error("[PixiAppManager] Cannot init viewport: Pixi Application renderer not ready.");
        return;
    }
    
    // Check if viewport already exists
    if (this.viewport) {
        return;
    }
    
    this.viewport = new Viewport({
      screenWidth: this.width,
      screenHeight: this.height,
      worldWidth: 10000,
      worldHeight: 10000,
      events: this.app.renderer.events,
    });

    this.app.stage.addChild(this.viewport);
    window.requestAnimationFrame(() => {
    });

    this.viewport.eventMode = 'static'; 
    this.viewport.interactiveChildren = true;
    this.viewport.sortableChildren = true; // Enable z-index sorting

    this.viewport
      .drag({ mouseButtons: 'right', pressDrag: true })
      .wheel()
      .decelerate()
      .clampZoom({
        minScale: 0.1,
        maxScale: 5,
      });
    
    this._canvasContextMenuPreventer = (e) => e.preventDefault();
    this.canvasEl.addEventListener('contextmenu', this._canvasContextMenuPreventer);

  }

  /**
   * @deprecated Viewport recreation is no longer used - full renderer recreation is preferred
   */
  public recreateViewport(): Viewport | null {
    return this.viewport;
  }
  
  /**
   * @deprecated Viewport plugin reinitialization is no longer used - full renderer recreation is preferred
   */
  public reinitializeViewportPlugins(): void {
  }
  

  resize(newWidth: number, newHeight: number): void {
    if (this._isDestroyed) return;
    this.width = newWidth;
    this.height = newHeight;

    if (this.app.renderer) {
      this.app.renderer.resize(newWidth, newHeight);
    }

    if (this.viewport) {
      this.viewport.resize(newWidth, newHeight);
    }
    
    // Update canvas element dimensions
    if (this.canvasEl) {
      this.canvasEl.style.width = `${newWidth}px`;
      this.canvasEl.style.height = `${newHeight}px`;
    }
  }

  destroy(): void {
    if (this._isDestroyed) {
      return;
    }
    this._isDestroyed = true;
    if (this._canvasContextMenuPreventer && this.canvasEl) {
      this.canvasEl.removeEventListener('contextmenu', this._canvasContextMenuPreventer);
      this._canvasContextMenuPreventer = null;
    }
    
    if (this.viewport) {
      try {
        this.viewport.plugins.pause('drag');
        this.viewport.plugins.pause('pinch');
        this.viewport.plugins.pause('wheel');
        this.viewport.plugins.pause('decelerate');
        this.viewport.destroy();
      } catch (e: unknown) {
        if (e instanceof TypeError && e.message.includes('_cancelResize')) {
            console.warn('[PixiAppManager] Viewport destroy failed with _cancelResize (known issue, suppressed): ', e.message);
        } else {
            console.warn('[PixiAppManager] Error destroying viewport:', e);
        }
      }
      this.viewport = null;
    }
    
    const ticker = this.app?.ticker as Ticker | null;
    if (ticker && ticker.started) {
      try {
        ticker.stop();
      } catch(e) { console.warn('[PixiAppManager] Error stopping ticker:', e); }
    }

    if (this.app) {
      try {
        this.app.destroy(true, { children: true, texture: true }); 
      } catch (e) {
        console.warn('[PixiAppManager] Error destroying Pixi app:', e);
      }
    }
    
  }

  getApp(): Application {
    return this.app;
  }

  getViewport(): Viewport | null {
    return this.viewport;
  }
  
  getCanvasElement(): HTMLCanvasElement {
    return this.canvasEl;
  }
} 