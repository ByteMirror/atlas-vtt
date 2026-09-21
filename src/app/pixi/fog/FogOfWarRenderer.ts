/**
 * Operation-based Fog of War renderer with per-operation interactive sprites.
 *
 * Paint operations each get their own PIXI Sprite that can be selected
 * and deleted via context menu.  Erase operations are rendered as holes in the
 * affected paint sprites.  A single FogCanvasCompositor is kept for live
 * drawing preview (during brush/lasso/rectangle drawing).
 */
import * as PIXI from 'pixi.js';
import type { Viewport } from 'pixi-viewport';
import type { StoreApi } from 'zustand';
import type { EventEmitter } from 'events';
import { Menu } from 'obsidian';
import type { ViewAtlasState } from '../../storeFactory';
import type { FogBounds, FogOperation } from '../../types/fogTypes';
import { FogCanvasCompositor } from './FogCanvasCompositor';
import { FogCursorPreview } from './FogCursorPreview';
import { FogOperationCanvas } from './FogOperationCanvas';
import { calculateOperationBounds } from './fogRenderUtils';
import { hitTestFogOp, findConnectedFogOps } from './fogHitTest';
import { extractConnectedComponentRects } from './fogComponentDelete';
import { canInteractWithFog, resolveFogPreviewAlpha } from './fogVisibilityPolicy';
import type { LayerVisibility } from '../playerSafeFrame';

const DEFAULT_BOUNDS: FogBounds = { x: -2000, y: -2000, width: 4000, height: 4000 };
const BOUNDS_PADDING = 200;
const COMPONENT_DELETE_CELL_SIZE = 2;
const COMPONENT_DELETE_ALPHA_THRESHOLD = 12;
const COMPONENT_DELETE_MAX_RECTS = 320;

type FogMode = 'brush' | 'lasso' | 'rectangle';

interface FogSpriteEntry {
  sprite: PIXI.Sprite;
  texture: PIXI.Texture;
  opCanvas: FogOperationCanvas;
}


export class FogOfWarRenderer {
  // PIXI display objects
  private container: PIXI.Container;
  private previewSprite: PIXI.Sprite;
  private previewTexture: PIXI.Texture;
  private lassoGraphics: PIXI.Graphics;
  private rectPreviewGraphics: PIXI.Graphics;

  // Per-operation sprites (paint ops only)
  private fogSprites: Map<string, FogSpriteEntry> = new Map();

  // Compositing (for drawing preview only)
  private compositor: FogCanvasCompositor;
  private cursorPreview: FogCursorPreview;

  // Drawing state
  private isDrawing = false;
  private isErasing = false;
  private fogMode: FogMode = 'brush';
  private brushSize = 50;

  // Brush state
  private currentBrushPoints: Array<{ x: number; y: number }> = [];

  // Lasso state
  private isLassoDrawing = false;
  private lassoPoints: Array<{ x: number; y: number }> = [];

  // Rectangle state
  private rectStart: { x: number; y: number } | null = null;
  private lastRectBounds: { x: number; y: number; width: number; height: number } | null = null;

  // Map tracking
  private currentMapPath: string | null = null;
  private explicitMapBounds: FogBounds | null = null;

  // Store subscriptions
  private unsubscribe?: () => void;

  // Bound event handlers for cleanup
  private pointerDownHandler: (e: PIXI.FederatedPointerEvent) => void;
  private pointerMoveHandler: (e: PIXI.FederatedPointerEvent) => void;
  private pointerUpHandler: () => void;
  private fogBrushSizeChangedHandler: (size: number) => void;
  private fogClearAllHandler: () => void;
  private fogModeChangedHandler: (mode: FogMode) => void;
  private backgroundBoundsUpdatedHandler: (data?: { x: number; y: number; width: number; height: number }) => void;

  constructor(
    private viewport: Viewport,
    private _pixiApp: PIXI.Application,
    private eventBus: EventEmitter,
    private store: StoreApi<ViewAtlasState>
  ) {
    // ── Container setup ─────────────────────────────────────────────
    this.container = new PIXI.Container();
    this.container.label = 'fogLayer';
    this.container.eventMode = 'none';
    this.container.sortableChildren = true;
    this.container.zIndex = 1000;
    this.container.interactiveChildren = false;

    // ── Preview compositor + texture (used during drawing only) ──────
    const bounds = this.calculateFogBounds();
    this.compositor = new FogCanvasCompositor(bounds);

    this.previewTexture = PIXI.Texture.from(this.compositor.getCanvas());
    this.previewSprite = new PIXI.Sprite(this.previewTexture);
    this.previewSprite.position.set(bounds.x, bounds.y);
    this.previewSprite.width = bounds.width;
    this.previewSprite.height = bounds.height;
    this.previewSprite.alpha = resolveFogPreviewAlpha({
      isPlayerView: this.store.getState().isPlayerView,
      isGMView: this.store.getState().isGMView,
    });
    this.previewSprite.visible = false;
    this.previewSprite.eventMode = 'none';
    this.previewSprite.zIndex = 999; // Below per-op sprites during normal mode
    this.container.addChild(this.previewSprite);

    // ── Lasso & rectangle preview graphics ──────────────────────────
    this.lassoGraphics = new PIXI.Graphics();
    this.lassoGraphics.eventMode = 'none';
    this.lassoGraphics.zIndex = 1001;
    this.container.addChild(this.lassoGraphics);

    this.rectPreviewGraphics = new PIXI.Graphics();
    this.rectPreviewGraphics.eventMode = 'none';
    this.rectPreviewGraphics.zIndex = 1001;
    this.container.addChild(this.rectPreviewGraphics);

    // ── Cursor preview ──────────────────────────────────────────────
    this.cursorPreview = new FogCursorPreview();
    const cursorObj = this.cursorPreview.getDisplayObject();
    cursorObj.zIndex = 1002;
    this.container.addChild(cursorObj);

    // ── Bound handlers ──────────────────────────────────────────────
    this.pointerDownHandler = this.onPointerDown.bind(this);
    this.pointerMoveHandler = this.onPointerMove.bind(this);
    this.pointerUpHandler = this.onPointerUp.bind(this);
    this.fogBrushSizeChangedHandler = (size: number) => this.setBrushSize(size);
    this.fogClearAllHandler = () => this.clearAllFog();
    this.fogModeChangedHandler = (mode: FogMode) => this.setFogMode(mode);
    this.backgroundBoundsUpdatedHandler = (data) => {
      if (
        data &&
        typeof data.x === 'number' &&
        typeof data.y === 'number' &&
        typeof data.width === 'number' &&
        typeof data.height === 'number' &&
        data.width > 0 &&
        data.height > 0
      ) {
        this.explicitMapBounds = {
          x: data.x,
          y: data.y,
          width: data.width,
          height: data.height,
        };
      } else {
        this.explicitMapBounds = null;
      }

      if (!this.store.getState().isMapLoading) {
        this.refreshBounds();
        this.rebuildFogSprites();
      }
    };

    // ── Event listeners ─────────────────────────────────────────────
    this.setupEventListeners();
    this.setupStoreSubscriptions();

    // Apply current store state immediately so preloaded fog is visible even
    // when no subsequent fog change event fires.
    this.applyInitialStoreState();
  }

  // ═══════════════════════════════════════════════════════════════════
  // Public API
  // ═══════════════════════════════════════════════════════════════════

  getContainer(): PIXI.Container {
    return this.container;
  }

  /** Local player captures share the DM renderer but must not share its fog preview opacity. */
  getPlayerViewLayers(): LayerVisibility[] {
    return [
      { layer: this.previewSprite, visible: this.previewSprite.visible, alpha: 1 },
      { layer: this.cursorPreview.getDisplayObject(), visible: false },
      { layer: this.lassoGraphics, visible: false },
      { layer: this.rectPreviewGraphics, visible: false },
    ];
  }

  /** Returns a map of fog sprite IDs → Containers for SelectionManager. */
  getFogSprites(): Record<string, PIXI.Container> {
    const result: Record<string, PIXI.Container> = {};
    for (const [id, entry] of this.fogSprites) {
      result[id] = entry.sprite;
    }
    return result;
  }


  /** Returns the fog operation id if (worldX, worldY) hits any visible fog pixel, null otherwise. */
  public hitTestFog(worldX: number, worldY: number): string | null {
    if (!canInteractWithFog({ isPlayerView: this.store.getState().isPlayerView })) {
      return null;
    }
    const fogOps = this.store.getState().objects?.fog;
    if (!fogOps) return null;

    const allOps = Object.values(fogOps);
    const paintOps = allOps.filter((op) => !op.isErasing);

    for (const paintOp of paintOps) {
      if (hitTestFogOp(worldX, worldY, paintOp, allOps)) {
        return paintOp.id;
      }
    }
    return null;
  }

  /** Returns all fog op IDs that are part of the same visual region as `fogId`. */
  public findMergedFogGroup(fogId: string): string[] {
    const fogOps = this.store.getState().objects?.fog;
    if (!fogOps) return [fogId];
    const allOps = Object.values(fogOps);
    const paintOps = allOps.filter((op) => !op.isErasing);
    return findConnectedFogOps(fogId, paintOps, allOps);
  }

  /** Handles a viewport-routed click on a fog sprite (selection, context menu). */
  public handleViewportFogPointerDown(fogId: string, e: PIXI.FederatedPointerEvent): void {
    if (!canInteractWithFog({ isPlayerView: this.store.getState().isPlayerView })) {
      return;
    }
    e.stopPropagation();
    const groupIds = this.findMergedFogGroup(fogId);

    if (e.button === 2) {
      this.showFogContextMenu(groupIds, e);
      return;
    }

    // Left-click → select the entire merged group
    this.store.getState().setSelection(groupIds);
  }
  enableFogMode(): void {
    if (this.store.getState().isMapLoading) return;
    this.container.eventMode = 'static';
    this.container.interactiveChildren = true;
    this.container.visible = true;
    this.viewport.pause = true;

    // Disable interaction on hit-test sprites during drawing
    this.setFogSpritesInteractive(false);

    // Refresh compositor display with all committed ops
    this.renderPreviewFromStore();
    this.previewSprite.visible = true;

    if (this.fogMode === 'brush') {
      this.cursorPreview.show(this.isErasing);
    }
  }

  disableFogMode(): void {
    this.container.interactiveChildren = false;
    this.viewport.pause = false;

    // Reset drawing state
    this.isDrawing = false;
    this.isLassoDrawing = false;
    this.currentBrushPoints = [];
    this.lassoPoints = [];
    this.rectStart = null;
    this.lastRectBounds = null;
    this.clearPreviewGraphics();
    this.cursorPreview.hide();

    // Rebuild per-op hit-test sprites and refresh compositor display
    if (!this.store.getState().isMapLoading) {
      this.rebuildFogSprites();
    }

    // Always disable sprite-level interactivity outside fog editing mode.
    // Viewport-level dispatch (via TokenRenderer) handles fog clicks instead.
    this.setFogSpritesInteractive(false);

    // Update container visibility
    const fogOps = this.store.getState().objects?.fog;
    if (!fogOps || Object.keys(fogOps).length === 0) {
      this.container.visible = false;
    } else {
      this.container.visible = true;
    }
  }

  destroy(): void {
    this.unsubscribe?.();

    this.viewport.off('pointerdown', this.pointerDownHandler);
    this.viewport.off('pointermove', this.pointerMoveHandler);
    this.viewport.off('pointerup', this.pointerUpHandler);
    this.viewport.off('pointerupoutside', this.pointerUpHandler);

    this.eventBus.off('fog-brush-size-changed', this.fogBrushSizeChangedHandler);
    this.eventBus.off('fog-clear-all', this.fogClearAllHandler);
    this.eventBus.off('fog-mode-changed', this.fogModeChangedHandler);
    this.eventBus.off('background-sprite-updated', this.backgroundBoundsUpdatedHandler);

    this.cursorPreview.destroy();
    this.compositor.destroy();

    // Destroy per-op sprites
    for (const entry of this.fogSprites.values()) {
      entry.opCanvas.destroy();
      if (!entry.texture.destroyed) entry.texture.destroy(true);
      if (!entry.sprite.destroyed) entry.sprite.destroy();
    }
    this.fogSprites.clear();

    if (this.lassoGraphics && !this.lassoGraphics.destroyed) {
      this.lassoGraphics.destroy();
    }
    if (this.rectPreviewGraphics && !this.rectPreviewGraphics.destroyed) {
      this.rectPreviewGraphics.destroy();
    }
    if (this.previewTexture && !this.previewTexture.destroyed) {
      this.previewTexture.destroy(true);
    }
    if (this.container && !this.container.destroyed) {
      this.container.destroy({ children: true });
    }
  }

  private clearAllFog(): void {
    this.store.getState().clearFog();
  }

  private setBrushSize(size: number): void {
    this.brushSize = size;
    this.cursorPreview.setBrushRadius(size);
  }

  setFogMode(mode: FogMode): void {
    this.fogMode = mode;
    this.clearPreviewGraphics();

    const tool = this.store.getState().activeTool;
    const isFogActive = tool === 'fog' || tool === 'eraser';
    if (isFogActive && mode === 'brush') {
      this.cursorPreview.show(this.isErasing);
    } else {
      this.cursorPreview.hide();
    }
  }

  // ═══════════════════════════════════════════════════════════════════
  // Event wiring
  // ═══════════════════════════════════════════════════════════════════

  private setupEventListeners(): void {
    this.viewport.on('pointerdown', this.pointerDownHandler);
    this.viewport.on('pointermove', this.pointerMoveHandler);
    this.viewport.on('pointerup', this.pointerUpHandler);
    this.viewport.on('pointerupoutside', this.pointerUpHandler);

    this.eventBus.on('fog-brush-size-changed', this.fogBrushSizeChangedHandler);
    this.eventBus.on('fog-clear-all', this.fogClearAllHandler);
    this.eventBus.on('fog-mode-changed', this.fogModeChangedHandler);
    this.eventBus.on('background-sprite-updated', this.backgroundBoundsUpdatedHandler);
  }

  private setupStoreSubscriptions(): void {
    let prevTool = this.store.getState().activeTool;
    let prevFog = this.store.getState().objects?.fog;
    let prevLoading = this.store.getState().isMapLoading;
    let prevMapPath = this.store.getState().mapPath;
    let prevGMView = this.store.getState().isGMView;

    this.unsubscribe = this.store.subscribe((state) => {
      // Tool changes → enable/disable fog mode or toggle interaction
      if (state.activeTool !== prevTool) {
        prevTool = state.activeTool;
        if (state.activeTool === 'fog' || state.activeTool === 'eraser') {
          this.isErasing = state.activeTool === 'eraser';
          this.enableFogMode();
        } else {
          this.disableFogMode();
        }
      }

      // Fog data changes (undo/redo, map load, drag commit) → rebuild sprites
      // Skip during drawing (Zustand fires synchronously before isDrawing resets)
      // and during map loading (the isMapLoading→false handler rebuilds instead)
      if (state.objects?.fog !== prevFog) {
        prevFog = state.objects?.fog;
        if (!this.isDrawing && !this.isLassoDrawing && !state.isMapLoading) {
          this.refreshBounds();
          this.rebuildFogSprites();
        }
      }

      // Map loading completed → load fog
      if (state.isMapLoading !== prevLoading) {
        prevLoading = state.isMapLoading;
        if (state.isMapLoading) {
          this.container.visible = false;
        } else {
          this.refreshBounds();
          this.rebuildFogSprites();
        }
      }

      // Map path change → clear + re-render on next load
      if (state.mapPath !== prevMapPath) {
        prevMapPath = state.mapPath;
        if (state.mapPath !== this.currentMapPath) {
          this.container.visible = false;
          this.currentMapPath = state.mapPath;
          this.resetDrawingState();
          this.clearAllFogSprites();
        }
      }

      // GM view toggle → adjust fog opacity
      if (state.isGMView !== prevGMView) {
        prevGMView = state.isGMView;
        this.previewSprite.alpha = resolveFogPreviewAlpha({
          isPlayerView: state.isPlayerView,
          isGMView: state.isGMView,
        });
      }
    });
  }

  private applyInitialStoreState(): void {
    const state = this.store.getState();
    this.currentMapPath = state.mapPath;
    this.previewSprite.alpha = resolveFogPreviewAlpha({
      isPlayerView: state.isPlayerView,
      isGMView: state.isGMView,
    });

    if (state.isMapLoading) {
      this.container.visible = false;
      this.previewSprite.visible = false;
      return;
    }

    this.refreshBounds();
    this.rebuildFogSprites();
  }

  // ═══════════════════════════════════════════════════════════════════
  // Per-operation sprite management
  // ═══════════════════════════════════════════════════════════════════

  /** Rebuild all per-operation sprites from store. */
  private rebuildFogSprites(): void {
    try {
      const fogOps = this.store.getState().objects?.fog;
      const allOps = fogOps ? Object.values(fogOps) : [];
      const paintOps = allOps.filter((op) => !op.isErasing);
      const eraseOps = allOps.filter((op) => op.isErasing);

      // Track which IDs are still in the store
      const currentIds = new Set(paintOps.map((op) => op.id));

      // Remove sprites for deleted operations
      for (const [id, entry] of this.fogSprites) {
        if (!currentIds.has(id)) {
          entry.opCanvas.destroy();
          if (!entry.texture.destroyed) entry.texture.destroy(true);
          if (!entry.sprite.destroyed) {
            this.container.removeChild(entry.sprite);
            entry.sprite.destroy();
          }
          this.fogSprites.delete(id);
        }
      }

      // Create or update hit-test sprites for each paint operation
      for (const paintOp of paintOps) {
        const bounds = calculateOperationBounds(paintOp);
        if (bounds.width <= 0 || bounds.height <= 0) continue;

        const existing = this.fogSprites.get(paintOp.id);
        if (existing) {
          existing.opCanvas.destroy();
          if (!existing.texture.destroyed) existing.texture.destroy(true);

          const opCanvas = new FogOperationCanvas(paintOp, eraseOps);
          const wb = opCanvas.getWorldBounds();
          const texture = PIXI.Texture.from(opCanvas.getCanvas());

          existing.sprite.texture = texture;
          existing.sprite.position.set(wb.x, wb.y);
          existing.sprite.width = wb.width;
          existing.sprite.height = wb.height;
          existing.texture = texture;
          existing.opCanvas = opCanvas;
        } else {
          this.createFogSprite(paintOp, eraseOps);
        }
      }

      // Update compositor display (single flat layer — no overlap artifacts)
      this.renderPreviewFromStore();

      // Update visibility
      if (allOps.length > 0) {
        this.container.visible = true;
        this.previewSprite.visible = true;
      } else {
        const tool = this.store.getState().activeTool;
        const isFogDrawing = tool === 'fog' || tool === 'eraser';
        if (!isFogDrawing) {
          this.container.visible = false;
        }
        this.previewSprite.visible = false;
      }

      // Sprites stay non-interactive; viewport-level dispatch handles fog clicks.
      this.setFogSpritesInteractive(false);
    } catch (error) {
      console.error('[FogOfWarRenderer] Error rebuilding fog sprites:', error);
    }
  }

  private createFogSprite(paintOp: FogOperation, eraseOps: FogOperation[]): void {
    const bounds = calculateOperationBounds(paintOp);
    if (bounds.width <= 0 || bounds.height <= 0) return;

    const opCanvas = new FogOperationCanvas(paintOp, eraseOps);
    const wb = opCanvas.getWorldBounds();
    const texture = PIXI.Texture.from(opCanvas.getCanvas());

    const sprite = new PIXI.Sprite(texture);
    sprite.position.set(wb.x, wb.y);
    sprite.width = wb.width;
    sprite.height = wb.height;
    sprite.alpha = 0; // Invisible hit-test proxy — display via compositor
    sprite.zIndex = paintOp.timestamp;
    sprite.label = `fog_${paintOp.id}`;
    sprite.eventMode = 'none';

    this.container.addChild(sprite);
    this.fogSprites.set(paintOp.id, { sprite, texture, opCanvas });
  }

  private clearAllFogSprites(): void {
    for (const entry of this.fogSprites.values()) {
      entry.opCanvas.destroy();
      if (!entry.texture.destroyed) entry.texture.destroy(true);
      if (!entry.sprite.destroyed) {
        this.container.removeChild(entry.sprite);
        entry.sprite.destroy();
      }
    }
    this.fogSprites.clear();
  }

  private setFogSpritesInteractive(interactive: boolean): void {
    for (const [, entry] of this.fogSprites) {
      entry.sprite.eventMode = interactive ? 'static' : 'none';
      entry.sprite.cursor = interactive ? 'pointer' : 'default';
      entry.sprite.off('pointerdown');
    }
  }

  // ═══════════════════════════════════════════════════════════════════
  // Fog sprite interaction (select / drag / context menu)
  // ═══════════════════════════════════════════════════════════════════

  private onFogSpritePointerDown(e: PIXI.FederatedPointerEvent, fogId: string): void {
    e.stopPropagation();
    const groupIds = this.findMergedFogGroup(fogId);

    if (e.button === 2) {
      this.showFogContextMenu(groupIds, e);
      return;
    }

    // Left-click → select the entire merged group
    this.store.getState().setSelection(groupIds);
  }

  private showFogContextMenu(fogIds: string[], e: PIXI.FederatedPointerEvent): void {
    const menu = new Menu();

    menu.addItem((item) => {
      item
        .setTitle('Delete')
        .setIcon('trash')
        .onClick(() => {
          const worldPos = this.viewport.toWorld(e.global);
          const erased = this.eraseConnectedVisibleRegionAt(worldPos.x, worldPos.y);
          if (!erased) {
            this.store.getState().deleteFogOperations(fogIds);
          }
        });
    });

    const globalPos = e.global;
    menu.showAtPosition({ x: globalPos.x, y: globalPos.y });
  }

  private eraseConnectedVisibleRegionAt(worldX: number, worldY: number): boolean {
    const eraseRects = this.computeComponentEraseRects(worldX, worldY);
    if (eraseRects.length === 0) {
      return false;
    }

    const state = this.store.getState();
    const currentFog = state.objects?.fog ?? {};
    const nextFog: Record<string, FogOperation> = { ...currentFog };
    const timestampBase = Date.now();
    let added = 0;

    for (let i = 0; i < eraseRects.length; i++) {
      const rect = eraseRects[i]!;
      if (rect.width <= 0 || rect.height <= 0) {
        continue;
      }
      const id = `fog_${timestampBase}_${Math.random().toString(36).slice(2, 9)}_${i}`;
      nextFog[id] = {
        id,
        kind: 'fog',
        timestamp: timestampBase + i,
        type: 'rectangle',
        isErasing: true,
        x: rect.x,
        y: rect.y,
        width: rect.width,
        height: rect.height,
      };
      added += 1;
    }

    if (added === 0) {
      return false;
    }
    state.setFogOperations(nextFog);
    return true;
  }

  private computeComponentEraseRects(worldX: number, worldY: number): Array<{
    x: number;
    y: number;
    width: number;
    height: number;
  }> {
    // Ensure compositor reflects the current fog state before sampling.
    this.renderPreviewFromStore();

    const canvas = this.compositor.getCanvas();
    const bounds = this.compositor.getBounds();
    if (canvas.width <= 0 || canvas.height <= 0 || bounds.width <= 0 || bounds.height <= 0) {
      return [];
    }

    const ctx = canvas.getContext('2d', { willReadFrequently: true });
    if (!ctx) {
      return [];
    }

    const scaleX = canvas.width / bounds.width;
    const scaleY = canvas.height / bounds.height;
    const seedCanvasX = Math.floor((worldX - bounds.x) * scaleX);
    const seedCanvasY = Math.floor((worldY - bounds.y) * scaleY);

    if (
      seedCanvasX < 0 ||
      seedCanvasY < 0 ||
      seedCanvasX >= canvas.width ||
      seedCanvasY >= canvas.height
    ) {
      return [];
    }

    const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height).data;
    const seedAlpha = imageData[(seedCanvasY * canvas.width + seedCanvasX) * 4 + 3] ?? 0;
    if (seedAlpha <= COMPONENT_DELETE_ALPHA_THRESHOLD) {
      return [];
    }

    const coarseW = Math.ceil(canvas.width / COMPONENT_DELETE_CELL_SIZE);
    const coarseH = Math.ceil(canvas.height / COMPONENT_DELETE_CELL_SIZE);
    const mask = new Uint8Array(coarseW * coarseH);

    for (let gy = 0; gy < coarseH; gy++) {
      for (let gx = 0; gx < coarseW; gx++) {
        const startX = gx * COMPONENT_DELETE_CELL_SIZE;
        const startY = gy * COMPONENT_DELETE_CELL_SIZE;
        const endX = Math.min(canvas.width, startX + COMPONENT_DELETE_CELL_SIZE);
        const endY = Math.min(canvas.height, startY + COMPONENT_DELETE_CELL_SIZE);
        let occupied = 0;
        for (let py = startY; py < endY && occupied === 0; py++) {
          for (let px = startX; px < endX; px++) {
            const alpha = imageData[(py * canvas.width + px) * 4 + 3] ?? 0;
            if (alpha > COMPONENT_DELETE_ALPHA_THRESHOLD) {
              occupied = 1;
              break;
            }
          }
        }
        mask[gy * coarseW + gx] = occupied;
      }
    }

    const seedCoarseX = Math.floor(seedCanvasX / COMPONENT_DELETE_CELL_SIZE);
    const seedCoarseY = Math.floor(seedCanvasY / COMPONENT_DELETE_CELL_SIZE);
    const coarseRects = extractConnectedComponentRects(mask, coarseW, coarseH, seedCoarseX, seedCoarseY);
    if (coarseRects.length === 0 || coarseRects.length > COMPONENT_DELETE_MAX_RECTS) {
      return [];
    }

    const worldPerCanvasX = bounds.width / canvas.width;
    const worldPerCanvasY = bounds.height / canvas.height;

    return coarseRects.map((rect) => {
      const canvasStartX = rect.x * COMPONENT_DELETE_CELL_SIZE;
      const canvasStartY = rect.y * COMPONENT_DELETE_CELL_SIZE;
      const canvasEndX = Math.min(canvas.width, (rect.x + rect.width) * COMPONENT_DELETE_CELL_SIZE);
      const canvasEndY = Math.min(canvas.height, (rect.y + rect.height) * COMPONENT_DELETE_CELL_SIZE);
      return {
        x: bounds.x + canvasStartX * worldPerCanvasX,
        y: bounds.y + canvasStartY * worldPerCanvasY,
        width: (canvasEndX - canvasStartX) * worldPerCanvasX,
        height: (canvasEndY - canvasStartY) * worldPerCanvasY,
      };
    });
  }

  // ═══════════════════════════════════════════════════════════════════
  // Drawing pointer handlers (fog/eraser tool)
  // ═══════════════════════════════════════════════════════════════════

  private onPointerDown(event: PIXI.FederatedPointerEvent): void {
    const tool = this.store.getState().activeTool;
    if (tool !== 'fog' && tool !== 'eraser') return;

    const worldPos = this.viewport.toWorld(event.global);

    if (this.fogMode === 'lasso') {
      this.isLassoDrawing = true;
      this.lassoPoints = [{ x: worldPos.x, y: worldPos.y }];
      this.drawLassoPreview();
    } else if (this.fogMode === 'rectangle') {
      this.isDrawing = true;
      this.rectStart = this.snapToGridCorner(worldPos.x, worldPos.y);
    } else {
      // Brush mode
      this.isDrawing = true;
      this.currentBrushPoints = [{ x: worldPos.x, y: worldPos.y }];
      this.previewBrushIncremental();
    }
  }

  private snapToGridCorner(x: number, y: number): { x: number; y: number } {
    const grid = this.store.getState().grid;
    if (!grid?.size) return { x, y };
    const { size, offsetX = 0, offsetY = 0 } = grid;
    return {
      x: Math.round((x - offsetX) / size) * size + offsetX,
      y: Math.round((y - offsetY) / size) * size + offsetY,
    };
  }

  private onPointerMove(event: PIXI.FederatedPointerEvent): void {
    const tool = this.store.getState().activeTool;
    const worldPos = this.viewport.toWorld(event.global);

    if (this.fogMode === 'brush' && (tool === 'fog' || tool === 'eraser')) {
      this.cursorPreview.updatePosition(worldPos.x, worldPos.y);
    }

    if (this.fogMode === 'lasso' && this.isLassoDrawing) {
      this.lassoPoints.push({ x: worldPos.x, y: worldPos.y });
      this.drawLassoPreview();
    } else if (this.fogMode === 'rectangle' && this.isDrawing && this.rectStart) {
      this.drawRectPreview(this.snapToGridCorner(worldPos.x, worldPos.y));
    } else if (this.fogMode === 'brush' && this.isDrawing) {
      this.currentBrushPoints.push({ x: worldPos.x, y: worldPos.y });
      this.previewBrushIncremental();
    }
  }

  private onPointerUp(): void {
    const tool = this.store.getState().activeTool;
    const isErasing = tool === 'eraser';

    if (this.fogMode === 'lasso' && this.isLassoDrawing) {
      this.isLassoDrawing = false;
      if (this.lassoPoints.length >= 3) {
        this.store.getState().addFogOperation({
          type: 'lasso',
          isErasing,
          points: this.lassoPoints.map((p) => ({ x: p.x, y: p.y })),
        });
      }
      this.lassoPoints = [];
      this.lassoGraphics.clear();
    } else if (this.fogMode === 'rectangle' && this.isDrawing && this.rectStart) {
      this.isDrawing = false;
      const bounds = this.lastRectBounds;
      if (bounds && bounds.width > 0 && bounds.height > 0) {
        this.store.getState().addFogOperation({
          type: 'rectangle',
          isErasing,
          x: bounds.x,
          y: bounds.y,
          width: bounds.width,
          height: bounds.height,
        });
      }
      this.rectStart = null;
      this.lastRectBounds = null;
      this.rectPreviewGraphics.clear();
    } else if (this.fogMode === 'brush' && this.isDrawing) {
      this.isDrawing = false;
      if (this.currentBrushPoints.length > 0) {
        this.store.getState().addFogOperation({
          type: 'brush',
          isErasing,
          points: this.currentBrushPoints.map((p) => ({ x: p.x, y: p.y })),
          brushRadius: this.brushSize,
        });
      }
      this.currentBrushPoints = [];
    }
  }

  // ═══════════════════════════════════════════════════════════════════
  // Preview helpers (live visual feedback during drawing)
  // ═══════════════════════════════════════════════════════════════════

  private previewBrushIncremental(): void {
    const tool = this.store.getState().activeTool;
    const isErasing = tool === 'eraser';

    const tempOp: FogOperation = {
      id: '__preview__',
      kind: 'fog',
      timestamp: Date.now(),
      type: 'brush',
      isErasing,
      points: this.currentBrushPoints,
      brushRadius: this.brushSize,
    };

    const committed = Object.values(this.store.getState().objects?.fog ?? {});
    this.compositor.compositeAll([...committed, tempOp]);
    this.updatePreviewTexture();
  }

  private renderPreviewFromStore(): void {
    const fogOps = this.store.getState().objects?.fog;
    const ops = fogOps ? Object.values(fogOps) : [];
    this.compositor.compositeAll(ops);
    this.updatePreviewTexture();
  }

  private drawLassoPreview(): void {
    this.lassoGraphics.clear();
    if (this.lassoPoints.length < 2) return;

    const tool = this.store.getState().activeTool;
    const color = tool === 'eraser' ? 0xff4444 : 0xffffff;

    const first = this.lassoPoints[0]!;
    this.lassoGraphics.moveTo(first.x, first.y);
    for (let i = 1; i < this.lassoPoints.length; i++) {
      const p = this.lassoPoints[i]!;
      this.lassoGraphics.lineTo(p.x, p.y);
    }
    this.lassoGraphics.closePath();
    this.lassoGraphics.stroke({ width: 2, color, alpha: 0.6 });
    this.lassoGraphics.fill({ color, alpha: 0.15 });
  }

  private drawRectPreview(currentPos: { x: number; y: number }): void {
    this.rectPreviewGraphics.clear();
    if (!this.rectStart) return;

    const tool = this.store.getState().activeTool;
    const color = tool === 'eraser' ? 0xff4444 : 0xffffff;

    const x = Math.min(this.rectStart.x, currentPos.x);
    const y = Math.min(this.rectStart.y, currentPos.y);
    const w = Math.abs(currentPos.x - this.rectStart.x);
    const h = Math.abs(currentPos.y - this.rectStart.y);

    this.lastRectBounds = { x, y, width: w, height: h };

    this.rectPreviewGraphics.rect(x, y, w, h);
    this.rectPreviewGraphics.stroke({ width: 2, color, alpha: 0.6 });
    this.rectPreviewGraphics.fill({ color, alpha: 0.15 });
  }

  // ═══════════════════════════════════════════════════════════════════
  // Texture update
  // ═══════════════════════════════════════════════════════════════════

  private updatePreviewTexture(): void {
    if (this.previewTexture && !this.previewTexture.destroyed) {
      this.previewTexture.source.update();
    }
  }

  // ═══════════════════════════════════════════════════════════════════
  // Bounds calculation
  // ═══════════════════════════════════════════════════════════════════

  private calculateFogBounds(): FogBounds {
    if (this.explicitMapBounds) {
      const explicitPadded = {
        x: this.explicitMapBounds.x - BOUNDS_PADDING,
        y: this.explicitMapBounds.y - BOUNDS_PADDING,
        width: this.explicitMapBounds.width + BOUNDS_PADDING * 2,
        height: this.explicitMapBounds.height + BOUNDS_PADDING * 2,
      };
      return explicitPadded;
    }

    type Candidate = {
      x: number;
      y: number;
      width: number;
      height: number;
      area: number;
      source: string;
    };

    const candidates: Candidate[] = [];
    for (const child of this.viewport.children) {
      if (child === this.container) {
        continue;
      }
      if (this.isTexturedDisplayObject(child)) {
        candidates.push({
          x: child.x,
          y: child.y,
          width: child.width,
          height: child.height,
          area: child.width * child.height,
          source: `viewport-child:${child.label || child.constructor?.name || 'DisplayObject'}`,
        });
      }
    }

    if (candidates.length === 0) {
      const stack: PIXI.Container[] = [...this.viewport.children];
      while (stack.length > 0) {
        const node = stack.pop()!;
        if (node === this.container) {
          continue;
        }

        if (this.isTexturedDisplayObject(node)) {
          const globalBounds = node.getBounds();
          const topLeft = this.viewport.toLocal(new PIXI.Point(globalBounds.x, globalBounds.y));
          const bottomRight = this.viewport.toLocal(
            new PIXI.Point(globalBounds.x + globalBounds.width, globalBounds.y + globalBounds.height),
          );
          const width = Math.abs(bottomRight.x - topLeft.x);
          const height = Math.abs(bottomRight.y - topLeft.y);
          if (width > 0 && height > 0) {
            candidates.push({
              x: Math.min(topLeft.x, bottomRight.x),
              y: Math.min(topLeft.y, bottomRight.y),
              width,
              height,
              area: width * height,
              source: `descendant:${node.label || node.constructor?.name || 'Sprite'}`,
            });
          }
        }

        if (node.children.length > 0) {
          stack.push(...node.children);
        }
      }
    }

    const fogOpsBounds = this.calculateFogOpsBoundsCandidate();
    if (fogOpsBounds) {
      candidates.push(fogOpsBounds);
    }

    const sorted = [...candidates].sort((a, b) => b.area - a.area);
    const chosen = sorted[0];
    if (!chosen) {
      return DEFAULT_BOUNDS;
    }

    const paddedBounds = {
      x: chosen.x - BOUNDS_PADDING,
      y: chosen.y - BOUNDS_PADDING,
      width: chosen.width + BOUNDS_PADDING * 2,
      height: chosen.height + BOUNDS_PADDING * 2,
    };
    return paddedBounds;
  }

  private isTexturedDisplayObject(node: PIXI.Container): boolean {
    if (!('texture' in node) || !node.texture || node.texture === PIXI.Texture.EMPTY) {
      return false;
    }
    return node.width > 0 && node.height > 0;
  }

  private calculateFogOpsBoundsCandidate():
    | {
        x: number;
        y: number;
        width: number;
        height: number;
        area: number;
        source: string;
      }
    | null {
    const fog = this.store.getState().objects?.fog;
    if (!fog) {
      return null;
    }

    const ops = Object.values(fog).filter((op) => !op.isErasing);
    if (ops.length === 0) {
      return null;
    }

    let minX = Number.POSITIVE_INFINITY;
    let minY = Number.POSITIVE_INFINITY;
    let maxX = Number.NEGATIVE_INFINITY;
    let maxY = Number.NEGATIVE_INFINITY;

    for (const op of ops) {
      const bounds = calculateOperationBounds(op);
      if (bounds.width <= 0 || bounds.height <= 0) {
        continue;
      }
      minX = Math.min(minX, bounds.x);
      minY = Math.min(minY, bounds.y);
      maxX = Math.max(maxX, bounds.x + bounds.width);
      maxY = Math.max(maxY, bounds.y + bounds.height);
    }

    if (!Number.isFinite(minX) || !Number.isFinite(minY) || !Number.isFinite(maxX) || !Number.isFinite(maxY)) {
      return null;
    }

    const width = Math.max(1, maxX - minX);
    const height = Math.max(1, maxY - minY);
    return {
      x: minX,
      y: minY,
      width,
      height,
      area: width * height,
      source: `fog-ops:${ops.length}`,
    };
  }

  private refreshBounds(): void {
    const newBounds = this.calculateFogBounds();
    const oldBounds = this.compositor.getBounds();

    if (
      Math.abs(newBounds.x - oldBounds.x) > 10 ||
      Math.abs(newBounds.y - oldBounds.y) > 10 ||
      Math.abs(newBounds.width - oldBounds.width) > 10 ||
      Math.abs(newBounds.height - oldBounds.height) > 10
    ) {
      this.compositor.updateBounds(newBounds);

      if (this.previewTexture && !this.previewTexture.destroyed) {
        this.previewTexture.destroy(true);
      }
      this.previewTexture = PIXI.Texture.from(this.compositor.getCanvas());
      this.previewSprite.texture = this.previewTexture;
      this.previewSprite.position.set(newBounds.x, newBounds.y);
      this.previewSprite.width = newBounds.width;
      this.previewSprite.height = newBounds.height;
    }
  }

  // ═══════════════════════════════════════════════════════════════════
  // Helpers
  // ═══════════════════════════════════════════════════════════════════

  private resetDrawingState(): void {
    this.isDrawing = false;
    this.isLassoDrawing = false;
    this.currentBrushPoints = [];
    this.lassoPoints = [];
    this.rectStart = null;
    this.lastRectBounds = null;
    this.clearPreviewGraphics();
  }

  private clearPreviewGraphics(): void {
    if (this.lassoGraphics && !this.lassoGraphics.destroyed) {
      this.lassoGraphics.clear();
    }
    if (this.rectPreviewGraphics && !this.rectPreviewGraphics.destroyed) {
      this.rectPreviewGraphics.clear();
    }
  }
}
