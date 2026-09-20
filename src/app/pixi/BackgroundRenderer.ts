import * as PIXI from 'pixi.js';
import { EventBus } from '../EventBus';

export class BackgroundRenderer {
  private viewport: any; // PIXI-viewport instance
  private eventBus: EventBus;
  private store: any; // Store instance
  private app: PIXI.Application;
  private backgroundContainer: PIXI.Container | null = null;
  
  // Grid overlay for grid pattern
  private gridContainer: PIXI.Container | null = null;
  private gridSprite: PIXI.TilingSprite | null = null;
  
  constructor(viewport: any, eventBus: EventBus, store: any, app: PIXI.Application) {
    this.viewport = viewport;
    this.eventBus = eventBus;
    this.store = store;
    this.app = app;
    
    this.setupEventListeners();
    this.updateBackground();
  }
  
  private setupEventListeners(): void {
    // Listen for background changes
    this.eventBus.on('background:change', this.updateBackground.bind(this));
    
  }
  
  private updateBackground(): void {
    // Default to transparent; map background sprite handles visuals
    this.app.renderer.background.color = 0x000000;
  }
  
  private getMapBounds(): { minX: number; minY: number; width: number; height: number } {
    // First check if there's a map with a background image
    const state = this.store.getState();
    if (state.background) {
      // Get the background sprite bounds if available
      const bgSprite = this.viewport.children.find((child: any) => 
        child.texture && child.texture.baseTexture && child !== this.backgroundContainer
      );
      
      if (bgSprite && bgSprite.width && bgSprite.height) {
        return {
          minX: bgSprite.x || 0,
          minY: bgSprite.y || 0,
          width: bgSprite.width,
          height: bgSprite.height
        };
      }
    }
    
    // For empty scenes, use a reasonable default size
    const defaultSize = 2000;
    return {
      minX: -defaultSize / 2,
      minY: -defaultSize / 2,
      width: defaultSize,
      height: defaultSize
    };
  }
  
  private createGridPattern(): void {
    // Create a grid overlay on top of the viewport
    const gridSize = 20;
    const graphics = new PIXI.Graphics();
    
    // Draw grid pattern
    graphics.setStrokeStyle({ width: 1, color: 0xcccccc, alpha: 0.3 });
    
    // Draw a small tile
    for (let i = 0; i <= gridSize; i += gridSize) {
      graphics.moveTo(i, 0);
      graphics.lineTo(i, gridSize);
      graphics.stroke();
      
      graphics.moveTo(0, i);
      graphics.lineTo(gridSize, i);
      graphics.stroke();
    }
    
    // Create texture from graphics
    const texture = this.app.renderer.generateTexture({
      target: graphics,
      resolution: 1,
      frame: new PIXI.Rectangle(0, 0, gridSize, gridSize),
    });
    
    // Create container for grid
    this.gridContainer = new PIXI.Container();
    this.gridContainer.zIndex = -999; // Below everything except background
    this.gridContainer.eventMode = 'none';
    
    // Get viewport bounds
    const bounds = this.getMapBounds();
    
    // Create tiling sprite
    this.gridSprite = new PIXI.TilingSprite({
      texture,
      width: bounds.width * 2,
      height: bounds.height * 2,
    });
    this.gridSprite.position.set(bounds.minX - bounds.width/2, bounds.minY - bounds.height/2);
    this.gridSprite.eventMode = 'none';
    
    this.gridContainer.addChild(this.gridSprite);
    this.viewport.addChildAt(this.gridContainer, 0);
    
    // Clean up
    graphics.destroy();
  }
  
  private parseColor(colorStr: string): number {
    // Handle hex colors
    if (colorStr.startsWith('#')) {
      return parseInt(colorStr.substring(1), 16);
    }
    // Handle numeric colors
    return parseInt(colorStr, 10) || 0xffffff;
  }
  
  public destroy(): void {
    // Remove event listeners
    this.eventBus.off('background:change', this.updateBackground.bind(this));
    
    // Clean up grid objects
    if (this.gridContainer) {
      this.gridContainer.destroy();
    }
    if (this.gridSprite) {
      this.gridSprite.destroy();
    }
  }
}
