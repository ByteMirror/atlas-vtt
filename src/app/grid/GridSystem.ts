import { Application, Graphics, Sprite } from 'pixi.js';
import { Viewport } from 'pixi-viewport';
import type { IRenderLayer } from 'pixi.js';
import { drawSquareGrid } from './squareGridDrawer';
import { drawHexGrid } from './hexGridDrawer';
import type { GridBounds, GridLineType } from './gridLineStyle';
import { createHexLayout, hexCellExtent, isHexGridType, nearestHexCenter } from './hexGeometry';
import type { HexLayout } from './hexGeometry';
import { contrastColorForSprite } from './gridContrastColor';

export type GridType = 'square' | 'hex-horizontal' | 'hex-vertical';

// Tracks grid graphics without modifying their types
const gridSpriteIds = new WeakMap<Graphics, number>();

export interface GridOptions {
  /** Type of grid. `hex-horizontal` is flat-top, `hex-vertical` is pointy-top. */
  type?: GridType;
  /**
   * Size of grid cells in pixels.
   * For square grids this is the side length. For hex grids it is the
   * flat-to-flat distance (width of a pointy-top hex, height of a flat-top hex),
   * matching the convention used by Foundry VTT and Owlbear Rodeo.
   */
  size: number;
  /** X offset for the grid origin */
  offsetX?: number;
  /** Y offset for the grid origin */
  offsetY?: number;
  /** Color of grid lines in hex format. Unset picks black or white from the map's brightness. */
  color?: number | undefined;
  /** Alpha transparency of grid lines (0–1) */
  alpha?: number;
  /** Line width for grid lines */
  lineWidth?: number;
  /** Line style (solid, dashed, dotted) */
  lineType?: GridLineType;
  /** Whether the grid is visible */
  enabled?: boolean;
  /** Scale factor for the grid (visual scale, distinct from mapScale) */
  scale?: number;
  /** Map scale for grid alignment mode - DEPRECATED or re-evaluate usage */
  mapScale?: number;
  /** Whether in alignment mode (for visual feedback) */
  isAligning?: boolean;
}

/**
 * Manages a static grid overlay that exactly matches a background sprite,
 * staying locked under pan/zoom by the Pixi‑Viewport container.
 */
export class GridSystem {
  private gridSprite: Graphics | null = null;
  private gridMask: Graphics | null = null;
  private bgSprite: Sprite;
  private viewport: Viewport;
  private app: Application;
  private options: GridOptions;
  private layer: IRenderLayer | null = null;
  private _updateDebounceTimer: number | null = null;
  private _gridSpriteInitialWorldX: number = 0;
  private _gridSpriteInitialWorldY: number = 0;
  private _gridOptionsOffsetXAtCreation: number = 0;
  private _gridOptionsOffsetYAtCreation: number = 0;
  private isDestroying: boolean = false;
  private _isCreating: boolean = false;
  private autoColor: number | null = null;

  /**
   * @param app      – the Pixi Application
   * @param viewport – the Pixi‑Viewport instance containing your map
   * @param bgSprite – the background Sprite you want the grid to overlay
   * @param options  – grid styling options
   */
  constructor(
    app: Application,
    viewport: Viewport,
    bgSprite: Sprite,
    options: GridOptions
  ) {
    this.app = app;
    this.viewport = viewport;
    this.bgSprite = bgSprite;
    this.options = {
      ...options,
      type: options.type ?? 'square',
      size: options.size ?? 70,
      offsetX: options.offsetX ?? 0,
      offsetY: options.offsetY ?? 0,
      alpha: options.alpha ?? 0.7,
      lineWidth: options.lineWidth ?? 1,
      lineType: options.lineType ?? 'solid',
      enabled: options.enabled ?? true,
      scale: options.scale ?? 1,
    };

    this.updateMapScale();
    this.createGrid();
  }

  private createGrid(): void {
    if (this.isDestroying) {
      return;
    }
    if (this._isCreating) {
      window.setTimeout(() => {
        this._isCreating = false;
        this.createGrid();
      }, 100);
      return;
    }

    this._isCreating = true;
    this.destroyGridResources();
    this.createExplicitGrid();
  }

  /** Hex layout for the current options, or null for square grids. */
  private getHexLayout(): HexLayout | null {
    const { type, size, offsetX = 0, offsetY = 0 } = this.options;
    return isHexGridType(type) ? createHexLayout(type, size, offsetX, offsetY) : null;
  }

  private createExplicitGrid(): void {
    const { size, offsetX = 0, offsetY = 0, color, alpha, lineWidth, lineType = 'solid', isAligning } = this.options;

    if (!this.bgSprite) {
      console.error('[GridSystem] Background sprite is null, cannot create grid');
      this._isCreating = false;
      return;
    }

    if (!this.bgSprite.width || !this.bgSprite.height || this.bgSprite.width <= 0 || this.bgSprite.height <= 0) {
      console.warn('[GridSystem] Background sprite not ready yet (invalid dimensions), scheduling retry', {
        width: this.bgSprite.width,
        height: this.bgSprite.height
      });
      this._isCreating = false;
      window.setTimeout(() => {
        if (!this.isDestroying) {
          this.createGrid();
        }
      }, 100);
      return;
    }

    const bgX = this.bgSprite.x || 0;
    const bgY = this.bgSprite.y || 0;
    const hexLayout = this.getHexLayout();

    // One cell of padding around the map; the mask clips the overflow.
    const padding = hexLayout ? Math.max(hexCellExtent(hexLayout).width, hexCellExtent(hexLayout).height) : size;
    const bounds: GridBounds = {
      minX: bgX - padding,
      minY: bgY - padding,
      maxX: bgX + this.bgSprite.width + padding,
      maxY: bgY + this.bgSprite.height + padding,
    };

    // `??`, not `||`: black is 0x000000 and must not fall through to the automatic colour
    const gridColor = isAligning ? 0x00ff00 : (color ?? this.getAutoColor());
    const gridAlpha = isAligning ? Math.min(alpha! * 1.5, 1) : alpha!;

    const graphics = new Graphics();
    graphics.setStrokeStyle({
      width: lineWidth!,
      color: gridColor,
      alpha: gridAlpha,
      alignment: 0,
      cap: 'round',
      join: 'miter'
    });

    if (hexLayout) {
      drawHexGrid(graphics, bounds, hexLayout, lineType, lineWidth);
    } else {
      drawSquareGrid(graphics, bounds, size, offsetX, offsetY, lineType, lineWidth);
    }
    if (lineType === 'dotted') {
      graphics.fill({ color: gridColor, alpha: gridAlpha });
    } else {
      graphics.stroke();
    }

    graphics.position.set(bounds.minX, bounds.minY);
    graphics.eventMode = 'none';
    graphics.interactive = false;

    // Clip the grid to the map bounds
    const maskGraphics = new Graphics();
    maskGraphics.rect(0, 0, this.bgSprite.width, this.bgSprite.height);
    maskGraphics.fill(0xffffff);
    maskGraphics.position.set(bgX, bgY);
    graphics.mask = maskGraphics;
    this.gridMask = maskGraphics;
    this.viewport.addChild(maskGraphics);

    // Keep geometry ready for player capture even when the DM hides the grid.
    graphics.visible = this.options.enabled !== false;
    this.gridSprite = graphics;
    this._gridSpriteInitialWorldX = bounds.minX;
    this._gridSpriteInitialWorldY = bounds.minY;
    this._gridOptionsOffsetXAtCreation = offsetX;
    this._gridOptionsOffsetYAtCreation = offsetY;

    // Insert just above the background
    const existingGrids = this.viewport.children.filter(child => gridSpriteIds.has(child as Graphics));
    existingGrids.forEach(g => this.viewport.removeChild(g));

    const bgIndex = this.viewport.children.indexOf(this.bgSprite);
    this.viewport.addChildAt(graphics, bgIndex >= 0 ? bgIndex + 1 : 0);
    gridSpriteIds.set(graphics, Date.now());

    if (this.layer) {
      this.layer.attach(graphics);
    }

    this.viewport.dirty = true;
    this._isCreating = false;
  }

  /** Black or white, whichever contrasts with the map image; cached because it reads the texture's pixels. */
  private getAutoColor(): number {
    this.autoColor ??= contrastColorForSprite(this.bgSprite);
    return this.autoColor ?? 0xffffff;
  }

  /** Clean up grid-only resources */
  private destroyGridResources(): void {
    if (this.gridMask) {
      if (this.gridMask.parent) {
        this.gridMask.parent.removeChild(this.gridMask);
      }
      this.gridMask.destroy();
      this.gridMask = null;
    }

    if (!this.gridSprite) return;

    this.gridSprite.visible = false;
    this.gridSprite.renderable = false;

    if (this.layer) {
      try {
        this.layer.detach(this.gridSprite);
      } catch {
        // Layer might already be destroyed
      }
    }

    if (this.gridSprite.parent) {
      try {
        this.gridSprite.parent.removeChild(this.gridSprite);
      } catch {
        // Parent might be in the middle of rendering
      }
    }

    const spriteToDestroy = this.gridSprite;
    this.gridSprite = null;

    // Destroy after the current render cycle completes
    window.requestAnimationFrame(() => {
      try {
        if (!spriteToDestroy.destroyed) {
          spriteToDestroy.destroy({ children: true, texture: false });
        }
      } catch {
        // Silently ignore destruction errors
      }
    });
  }

  /** Toggle visibility */
  public setEnabled(enabled: boolean): void {
    this.options.enabled = enabled;
    if (enabled) {
      this.createGrid();
    } else if (this.gridSprite) {
      this.gridSprite.visible = false;
    }
  }

  /** Update cell size, color, alpha, etc. */
  public updateOptions(opts: Partial<GridOptions>): void {
    if (Object.keys(opts).length === 0) {
      return;
    }

    Object.assign(this.options, opts);

    if (this._updateDebounceTimer) {
      window.clearTimeout(this._updateDebounceTimer);
    }

    this._updateDebounceTimer = window.setTimeout(() => {
      if (opts.size !== undefined) {
        this.updateMapScale();
      }
      this.createGrid();
      this._updateDebounceTimer = null;
    }, 100);
  }

  /** Return current options */
  public getOptions(): Readonly<GridOptions> {
    return this.options;
  }

  /** Get the calculated map scale factor */
  public getMapScale(): number {
    return this.options.mapScale || 1;
  }

  /** Returns the grid graphics instance */
  public getGridSprite(): Graphics | null {
    return this.gridSprite;
  }

  /** Map scale is 1:1 - the grid renders at its logical size */
  private updateMapScale(): void {
    this.options.mapScale = 1;
  }

  /** Completely destroy */
  public destroy(): void {
    this.isDestroying = true;
    this.destroyGridResources();
  }

  /** Updates the internal reference to the background sprite */
  public updateBackgroundSprite(newBgSprite: Sprite): void {
    if (!newBgSprite) {
      console.error('[GridSystem] Cannot update background sprite: new sprite is null');
      return;
    }

    this.bgSprite = newBgSprite;
    this.autoColor = null;

    if (newBgSprite.width > 0 && newBgSprite.height > 0) {
      this.createGrid();
      return;
    }

    // Wait for the sprite's texture to load before building the grid
    const checkSpriteReady = (): void => {
      if (newBgSprite.width > 0 && newBgSprite.height > 0) {
        if (!this.isDestroying) {
          this.createGrid();
        }
      } else {
        window.setTimeout(checkSpriteReady, 50);
      }
    };
    window.setTimeout(checkSpriteReady, 50);
  }

  /** Provide a render layer so the grid sprite can automatically be attached */
  public setRenderLayer(layer: IRenderLayer | null): void {
    this.layer = layer;
    if (this.gridSprite && layer) {
      layer.attach(this.gridSprite);
    }
  }

  /** Snap to the top-left corner of the containing square cell */
  public snapToGrid(x: number, y: number): { x: number; y: number } {
    const { size, offsetX = 0, offsetY = 0 } = this.options;
    return {
      x: Math.floor((x - offsetX) / size) * size + offsetX,
      y: Math.floor((y - offsetY) / size) * size + offsetY,
    };
  }

  /** Snap to the centre of the containing grid cell */
  public snapToCellCenter(x: number, y: number): { x: number; y: number } {
    const hexLayout = this.getHexLayout();
    if (hexLayout) {
      return nearestHexCenter(hexLayout, { x, y });
    }

    const { size, offsetX = 0, offsetY = 0 } = this.options;
    const col = Math.floor((x - offsetX) / size);
    const row = Math.floor((y - offsetY) / size);
    return {
      x: col * size + offsetX + size / 2,
      y: row * size + offsetY + size / 2,
    };
  }

  /** Get current grid size */
  public get gridSize(): number {
    return this.options.size;
  }

  /** Set grid type */
  public setGridType(type: GridType): void {
    const oldType = this.options.type;
    this.updateOptions({ type });

    if (oldType !== type) {
      window.dispatchEvent(new CustomEvent('atlas-grid-type-changed', {
        detail: { oldType, newType: type }
      }));
    }
  }

  /** Set grid size (see GridOptions.size for the meaning per grid type) */
  public setGridSize(size: number): void {
    this.updateOptions({ size });
  }

  /** Set grid offset - optimized for real-time updates during dragging */
  public setGridOffset(offsetX: number, offsetY: number): void {
    const roundedOffsetX = Math.round(offsetX);
    const roundedOffsetY = Math.round(offsetY);

    this.options.offsetX = roundedOffsetX;
    this.options.offsetY = roundedOffsetY;

    if (!this.gridSprite) return;

    // Move the existing graphics to reflect the new offset instead of redrawing
    const deltaOptionsX = roundedOffsetX - this._gridOptionsOffsetXAtCreation;
    const deltaOptionsY = roundedOffsetY - this._gridOptionsOffsetYAtCreation;
    this.gridSprite.position.set(
      this._gridSpriteInitialWorldX + deltaOptionsX,
      this._gridSpriteInitialWorldY + deltaOptionsY,
    );
    this.viewport.dirty = true;
  }

  /** Force recreation of grid with current offset - use this for final alignment */
  public recreateGridWithOffset(): void {
    if (this.options.enabled) {
      this.createGrid();
    }
  }

  /** Set grid scale */
  public setGridScale(scale: number): void {
    this.updateOptions({ scale });
  }

  /** Set map scale for grid alignment mode */
  public setMapScale(scale: number): void {
    this.options.mapScale = scale;
    if (this.bgSprite) {
      if (this.bgSprite.texture && this.bgSprite.texture.source) {
        this.bgSprite.texture.source.scaleMode = 'linear';
      }
      this.bgSprite.scale.set(scale);
      this.createGrid();
    }
  }

  /** Set alignment mode for visual feedback */
  public setAlignmentMode(isAligning: boolean): void {
    this.options.isAligning = isAligning;
    if (this.options.enabled) {
      this.createGrid();
    }
  }

  /** Set grid opacity */
  public setGridOpacity(opacity: number): void {
    this.updateOptions({ alpha: opacity });
  }

  /**
   * Validate and adjust grid size according to VTT best practices
   * Minimum 50px, recommended 100px+ for optimal snapping precision
   */
  public validateGridSize(size: number): number {
    const minSize = 50;

    if (size < minSize) {
      console.warn(`Grid size ${size}px is below minimum recommended size of ${minSize}px`);
      return minSize;
    }

    return Math.round(size);
  }
}
