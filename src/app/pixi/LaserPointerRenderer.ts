import { Application, Color, Container, FederatedPointerEvent, Graphics } from 'pixi.js';
import type { Viewport } from 'pixi-viewport';
import type { EventEmitter } from 'events';
import type { ViewAtlasState, ViewAtlasStore } from '../storeFactory';
import type { LaserPointerSettings } from '../tools/LaserPointerTool';
import { setCanvasCursor } from './utils/canvasCursor';

interface TrailPoint {
  x: number;
  y: number;
  timestamp: number;
}

const MAX_TRAIL_POINTS = 100;
const MIN_POINT_DISTANCE_SQ = 4; // 2px minimum gap between trail points
/**
 * Renders the laser pointer visual effects on the PIXI canvas.
 * Self-manages activation via store subscription on `activeTool`.
 * Handles viewport input directly (left-click when active, middle-click always).
 */
export class LaserPointerRenderer {
  private viewport: Viewport;
  private pixiApp: Application;
  private eventBus: EventEmitter;
  private store: ViewAtlasStore;
  private canvasEl: HTMLCanvasElement;

  private container: Container;
  private trailGraphics: Graphics;
  private cursorGraphics: Graphics;

  private trailPoints: TrailPoint[] = [];
  private isToolActive: boolean = false;
  private isPointing: boolean = false;
  private isQuickMode: boolean = false;
  private settings: LaserPointerSettings = { color: '#FF0000', size: 10, fadeTime: 800 };
  /** Last pointer position in screen (canvas) space, used to re-project the cursor when the viewport moves. */
  private lastPointerScreen: { x: number; y: number } | null = null;

  private tickerCallback: (() => void) | null = null;
  private unsubscribeFromStore?: () => void;
  private settingsHandler: (s: LaserPointerSettings) => void;
  private onCanvasLeave: () => void;

  // Bound viewport handlers (stored for cleanup)
  private onPointerDown: (e: FederatedPointerEvent) => void;
  private onPointerMove: (e: FederatedPointerEvent) => void;
  private onPointerUp: (e: FederatedPointerEvent) => void;
  private onPointerUpOutside: (e: FederatedPointerEvent) => void;
  private onViewportMoved: () => void;

  constructor(
    viewport: Viewport,
    pixiApp: Application,
    eventBus: EventEmitter,
    store: ViewAtlasStore,
    canvasEl: HTMLCanvasElement,
  ) {
    this.viewport = viewport;
    this.pixiApp = pixiApp;
    this.eventBus = eventBus;
    this.store = store;
    this.canvasEl = canvasEl;

    // Build display hierarchy
    this.container = new Container();
    this.container.label = 'laser-pointer-layer';
    this.container.interactive = false;
    this.container.interactiveChildren = false;

    this.trailGraphics = new Graphics();
    this.trailGraphics.label = 'laser-trail';
    this.trailGraphics.blendMode = 'add';
    this.container.addChild(this.trailGraphics);

    this.cursorGraphics = new Graphics();
    this.cursorGraphics.label = 'laser-cursor';
    this.cursorGraphics.blendMode = 'add';
    this.container.addChild(this.cursorGraphics);

    // Store subscription for tool activation (follows MeasureRenderer pattern)
    this.unsubscribeFromStore = this.store.subscribe(
      (state: ViewAtlasState) => state.activeTool,
      (tool: string) => {
        const wasActive = this.isToolActive;
        this.isToolActive = tool === 'laser-pointer';

        if (this.isToolActive && !wasActive) {
          setCanvasCursor(this.canvasEl, 'none');
          this.startTicker();
        } else if (!this.isToolActive && wasActive) {
          setCanvasCursor(this.canvasEl, 'auto');
          this.cursorGraphics.clear();
          this.isPointing = false;
        }
      },
      { fireImmediately: true },
    );

    // Settings change listener
    this.settingsHandler = (s: LaserPointerSettings): void => {
      this.settings = s;
    };
    this.eventBus.on('laser-pointer-settings-changed', this.settingsHandler);

    // Bind viewport handlers (always attached, guarded internally)
    this.onPointerDown = this.handlePointerDown.bind(this);
    this.onPointerMove = this.handlePointerMove.bind(this);
    this.onPointerUp = this.handlePointerUp.bind(this);
    this.onPointerUpOutside = this.handlePointerUpOutside.bind(this);
    this.onViewportMoved = this.handleViewportMoved.bind(this);

    viewport.on('pointerdown', this.onPointerDown);
    viewport.on('pointermove', this.onPointerMove);
    viewport.on('pointerup', this.onPointerUp);
    viewport.on('pointerupoutside', this.onPointerUpOutside);
    // Scroll-pan, pinch and decelerate move the world under a stationary pointer
    viewport.on('moved', this.onViewportMoved);

    this.onCanvasLeave = (): void => {
      this.lastPointerScreen = null;
      this.cursorGraphics.clear();
    };
    this.canvasEl.addEventListener('mouseleave', this.onCanvasLeave);
  }

  public getContainer(): Container {
    return this.container;
  }

  // ── Input handling ──────────────────────────────────────────────────

  private getWorldFromPointerEvent(e: FederatedPointerEvent): { x: number; y: number } | null {
    const global = e.global;
    if (!global) {
      return null;
    }
    const world = this.viewport.toWorld(global);
    if (!world || typeof world.x !== 'number' || typeof world.y !== 'number') {
      return null;
    }
    this.lastPointerScreen = { x: global.x, y: global.y };
    return { x: world.x, y: world.y };
  }

  private handlePointerDown(e: FederatedPointerEvent): void {
    const button: number = e.button;
    const world = this.getWorldFromPointerEvent(e);
    if (!world) {
      return;
    }

    // Middle-click → quick mode regardless of active tool
    if (button === 1) {
      this.isQuickMode = true;
      this.isPointing = true;
      setCanvasCursor(this.canvasEl, 'none');
      this.addTrailPoint(world.x, world.y);
      this.startTicker();
      e.stopPropagation();
      return;
    }

    // Left-click when laser tool active
    if (button === 0 && this.isToolActive) {
      this.isPointing = true;
      this.addTrailPoint(world.x, world.y);
      this.startTicker();
      e.stopPropagation();
    }
  }

  private handlePointerMove(e: FederatedPointerEvent): void {
    const world = this.getWorldFromPointerEvent(e);
    if (!world) {
      return;
    }
    this.trackPointer(world);
    if (this.isPointing) {
      e.stopPropagation();
    }
  }

  /**
   * Re-projects the stationary pointer after the viewport panned or zoomed
   * underneath it, so the cursor and trail keep following the real pointer.
   */
  private handleViewportMoved(): void {
    if (!this.lastPointerScreen) {
      return;
    }
    const world = this.viewport.toWorld(this.lastPointerScreen.x, this.lastPointerScreen.y);
    this.trackPointer({ x: world.x, y: world.y });
  }

  private trackPointer(world: { x: number; y: number }): void {
    if (this.isPointing) {
      this.addTrailPoint(world.x, world.y);
    } else if (this.isToolActive || this.isQuickMode) {
      this.drawCursor(world.x, world.y);
    } else {
      this.cursorGraphics.clear();
    }
  }

  private handlePointerUp(e: FederatedPointerEvent): void {
    const button: number = e.button;

    if (button === 1 && this.isQuickMode) {
      this.isQuickMode = false;
      this.isPointing = false;
      if (!this.isToolActive) {
        setCanvasCursor(this.canvasEl, 'auto');
        this.cursorGraphics.clear();
      }
      e.stopPropagation();
      return;
    }

    if (button === 0 && this.isToolActive && this.isPointing) {
      this.isPointing = false;
      e.stopPropagation();
    }
  }

  private handlePointerUpOutside(_e: any): void {
    if (this.isQuickMode) {
      this.isQuickMode = false;
      this.isPointing = false;
      if (!this.isToolActive) {
        setCanvasCursor(this.canvasEl, 'auto');
        this.cursorGraphics.clear();
      }
      return;
    }
    if (this.isPointing) {
      this.isPointing = false;
    }
  }

  // ── Trail management ────────────────────────────────────────────────

  private addTrailPoint(x: number, y: number): void {
    // Enforce minimum distance to avoid dense clusters at slow speeds
    const last = this.trailPoints[this.trailPoints.length - 1];
    if (last) {
      const dx = x - last.x;
      const dy = y - last.y;
      if (dx * dx + dy * dy < MIN_POINT_DISTANCE_SQ) return;
    }

    this.trailPoints.push({ x, y, timestamp: Date.now() });
    if (this.trailPoints.length > MAX_TRAIL_POINTS) {
      this.trailPoints.splice(0, this.trailPoints.length - MAX_TRAIL_POINTS);
    }
  }

  // ── Ticker-driven rendering ─────────────────────────────────────────

  private startTicker(): void {
    if (this.tickerCallback) return;

    this.tickerCallback = (): void => {
      this.tick();
    };
    this.pixiApp.ticker.add(this.tickerCallback);
  }

  private stopTicker(): void {
    if (!this.tickerCallback) return;
    this.pixiApp.ticker.remove(this.tickerCallback);
    this.tickerCallback = null;
  }

  private tick(): void {
    const now = Date.now();
    const fade = this.settings.fadeTime;

    // Expire old points
    this.trailPoints = this.trailPoints.filter(p => now - p.timestamp < fade);

    // Redraw trail
    this.drawTrail(now, fade);

    // Auto-stop ticker when idle
    if (
      this.trailPoints.length === 0 &&
      !this.isToolActive &&
      !this.isQuickMode
    ) {
      this.trailGraphics.clear();
      this.stopTicker();
    }
  }

  // ── Drawing helpers ─────────────────────────────────────────────────

  private drawTrail(now: number, fadeDuration: number): void {
    this.trailGraphics.clear();
    if (this.trailPoints.length < 2) return;

    const color = new Color(this.settings.color);
    const hex = color.toNumber();
    const size = this.settings.size;

    // Glow layers: outer soft → inner → bright core
    const layers: Array<{ widthMul: number; alphaMul: number }> = [
      { widthMul: 3.0, alphaMul: 0.12 },
      { widthMul: 1.6, alphaMul: 0.25 },
      { widthMul: 0.7, alphaMul: 0.6 },
    ];

    // Additive sub-trail technique: draw the trail N times, each starting
    // from a different age threshold. With blendMode 'add', areas covered
    // by more sub-trails glow brighter. The head is covered by ALL sub-trails
    // (max brightness), the tail only by the longest one (faintest).
    const SUB_TRAILS = 6;

    for (const layer of layers) {
      const alphaPerPass = layer.alphaMul / SUB_TRAILS;

      for (let sub = 0; sub < SUB_TRAILS; sub++) {
        // Each sub-trail covers points younger than this age
        const maxAge = fadeDuration * ((sub + 1) / SUB_TRAILS);

        // Find first point within this sub-trail's age window
        const startIdx = this.trailPoints.findIndex(p => now - p.timestamp < maxAge);
        if (startIdx < 0 || startIdx >= this.trailPoints.length - 1) continue;

        this.trailGraphics.setStrokeStyle({
          width: size * layer.widthMul,
          color: hex,
          alpha: alphaPerPass,
          cap: 'round',
          join: 'round',
        });

        // Single continuous polyline — one moveTo, many lineTos, one stroke
        this.trailGraphics.moveTo(this.trailPoints[startIdx]!.x, this.trailPoints[startIdx]!.y);
        for (let i = startIdx + 1; i < this.trailPoints.length; i++) {
          this.trailGraphics.lineTo(this.trailPoints[i]!.x, this.trailPoints[i]!.y);
        }
        this.trailGraphics.stroke();
      }
    }
  }

  private drawCursor(x: number, y: number): void {
    this.cursorGraphics.clear();
    const color = new Color(this.settings.color);
    const hex = color.toNumber();
    const size = this.settings.size;

    // Soft outer glow
    this.cursorGraphics.circle(x, y, size * 2);
    this.cursorGraphics.fill({ color: hex, alpha: 0.04 });

    // Mid glow
    this.cursorGraphics.circle(x, y, size * 1.0);
    this.cursorGraphics.fill({ color: hex, alpha: 0.1 });

    // Bright core
    this.cursorGraphics.circle(x, y, size * 0.35);
    this.cursorGraphics.fill({ color: hex, alpha: 0.85 });
  }

  // ── Cleanup ─────────────────────────────────────────────────────────

  public destroy(): void {
    this.stopTicker();
    this.unsubscribeFromStore?.();
    this.eventBus.off('laser-pointer-settings-changed', this.settingsHandler);

    this.viewport.off('pointerdown', this.onPointerDown);
    this.viewport.off('pointermove', this.onPointerMove);
    this.viewport.off('pointerup', this.onPointerUp);
    this.viewport.off('pointerupoutside', this.onPointerUpOutside);
    this.viewport.off('moved', this.onViewportMoved);
    this.canvasEl.removeEventListener('mouseleave', this.onCanvasLeave);

    this.trailPoints = [];
    this.cursorGraphics.destroy();
    this.trailGraphics.destroy();
    this.container.destroy();
  }
}
