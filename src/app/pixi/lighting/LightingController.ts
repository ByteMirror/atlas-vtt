import type { EventEmitter } from 'events';
import type { App } from 'obsidian';
import type { Application } from 'pixi.js';
import type { Viewport } from 'pixi-viewport';
import type { MeasurementSettings } from '../../grid/measurementFormat';
import { bindHoldHotkey } from '../../keyboard/holdHotkey';
import { DEFAULT_MAP_HOTKEYS } from '../../keyboard/mapHotkeys';
import { emissionOfPreset } from '../../lighting/lightEmissionForm';
import type { LightPresetId } from '../../lighting/lightPresets';
import { AssetService } from '../../services/AssetService';
import { mapMeasurementSettings } from '../../services/mapMeasurementSettings';
import { SettingsService } from '../../services/SettingsService';
import type { ViewAtlasStore } from '../../storeFactory';
import { runHistoryTransaction } from '../../stores/history';
import { WallTool, type WallToolMode, type WallToolSubMode } from '../../tools/WallTool';
import type { Point } from '../../types/visionTypes';
import type { WallType } from '../../types/wallTypes';
import type { MapBounds } from '../../vision/visibility';
import type { HideableLayer } from '../playerSafeFrame';
import type { TokenRenderer } from '../TokenRenderer';
import { usesCanvasRenderer } from '../utils/rendererType';
import { WallInteraction } from '../vision/WallInteraction';
import { WallRenderer } from '../vision/WallRenderer';
import { CanvasLightingFallback } from './CanvasLightingFallback';
import { DoorIcons } from './DoorIcons';
import { showWallMenu, type LightingMenuContext } from './lightingMenus';
import { LightingRenderer } from './LightingRenderer';
import type { SceneLightingView } from './sceneLightingView';
import { WallDrawingSession } from './WallDrawingSession';
import { splitWall } from './wallEdits';

export interface LightingControllerDeps {
  viewport: Viewport;
  app: Application;
  store: ViewAtlasStore;
  eventBus: EventEmitter;
  obsApp: App;
  viewId: string;
  bounds: () => MapBounds | null;
}

interface SegmentEvent { p1: Point; p2: Point; type: WallType; chainId: string }

/**
 * Walls, lights and scene lighting for one map view: owns the lighting renderer, the wall
 * editor and the door badges, and routes the wall tool's pointer input and events to them.
 * Walls are never snapped to the grid: they follow the map's artwork.
 */
export class LightingController {
  readonly renderer: SceneLightingView;
  private readonly wallRenderer: WallRenderer;
  private readonly walls: WallInteraction;
  private readonly tool: WallTool;
  private readonly doors: DoorIcons;
  private readonly drawing: WallDrawingSession;
  private readonly cleanups: Array<() => void> = [];
  /** The toolbar's preview switch and the held peek key both show the players' view. */
  private previewing = false;
  private peeking = false;

  constructor(private readonly deps: LightingControllerDeps) {
    const { viewport, app, store, obsApp } = deps;
    const assetService = AssetService.getInstance(obsApp);
    const measurement = (): MeasurementSettings => mapMeasurementSettings(assetService, store.getState());
    this.renderer = usesCanvasRenderer(app.renderer)
      ? new CanvasLightingFallback({ viewport, store, measurement, bounds: deps.bounds })
      : new LightingRenderer({ viewport, app, store, measurement, bounds: deps.bounds });
    this.wallRenderer = new WallRenderer(viewport, store);
    this.walls = new WallInteraction(store, this.wallRenderer);
    this.tool = new WallTool(deps.eventBus);
    this.drawing = new WallDrawingSession(store);
    this.doors = new DoorIcons(store);
    viewport.addChild(this.doors.view);

    const settings = SettingsService.forApp(obsApp);
    this.cleanups.push(bindHoldHotkey(window, () => (settings?.getHotkeys() ?? DEFAULT_MAP_HOTKEYS).lightingPeek, deps.viewId, (held) => {
      this.peeking = held;
      this.applyPreview();
    }));
    this.cleanups.push(store.subscribe((state, previous) => {
      if (state.activeTool !== previous.activeTool || state.lighting.enabled !== previous.lighting.enabled) this.syncTool();
    }));
    this.listen();
    this.syncTool();
  }

  /** Routes the wall tool's viewport input and door clicks from the token renderer's dispatch. */
  wire(tokens: TokenRenderer): void {
    tokens.setWallPointerDownHandler((x, y, e) => this.pointerDown({ x, y }, e.shiftKey, e.ctrlKey || e.metaKey));
    tokens.setWallPointerMoveHandler((x, y) => this.pointerMove({ x, y }));
    tokens.setWallPointerUpHandler(() => this.pointerUp());
    tokens.setWallDoubleClickHandler((x, y) => {
      const lightId = this.wallRenderer.hitTestLights(x, y);
      if (lightId) this.configureLight(lightId, this.clientPoint({ x, y }));
      else this.tool.finishChain();
    });
    tokens.setWallContextMenuHandler((x, y, screenX, screenY) => showWallMenu(this.menuContext(), x, y, screenX, screenY));
    tokens.setWallCursorProvider((x, y) => {
      if (this.wallRenderer.hitTestVertices(x, y)) return 'grab';
      return this.wallRenderer.hitTestWalls(x, y) || this.wallRenderer.hitTestLights(x, y) ? 'pointer' : 'crosshair';
    });
    tokens.setDoorClickHandler((x, y) => {
      const doorId = this.doors.hitTest(x, y);
      if (doorId) this.doors.toggle(doorId);
      return !!doorId;
    });
  }

  /** Wall lines, handles and door badges: GM-only. */
  gmOverlays(): HideableLayer[] {
    return [this.wallRenderer.getContainer(), this.doors.view];
  }

  /** Escape: stop placing a door, drop the chain being drawn, or clear the wall selection. */
  handleEscape(): boolean {
    if (this.deps.store.getState().activeTool !== 'wall') return false;
    if (this.walls.isPlacingDoor()) this.walls.cancelDoorPlacement();
    else if (this.tool.isCurrentlyDrawing()) this.tool.cancelDrawing();
    else if (this.walls.hasSelection()) this.walls.clearSelection();
    else return false;
    return true;
  }

  handleDelete(): boolean {
    if (this.deps.store.getState().activeTool !== 'wall') return false;
    this.walls.deleteSelected();
    return true;
  }

  private menuContext(): LightingMenuContext {
    return {
      store: this.deps.store,
      walls: this.walls,
      wallRenderer: this.wallRenderer,
      configureLight: (lightId, clientX, clientY) => this.configureLight(lightId, { x: clientX, y: clientY }),
    };
  }

  private configureLight(lightId: string, client: Point): void {
    this.deps.store.getState().openLightPanel({ lightId, clientX: client.x, clientY: client.y });
  }

  /** A world point in client pixels, where panels open from. */
  private clientPoint(world: Point): Point {
    const screen = this.deps.viewport.toScreen(world.x, world.y);
    const canvas = this.deps.app.canvas.getBoundingClientRect();
    return { x: canvas.left + screen.x, y: canvas.top + screen.y };
  }

  private applyPreview(): void {
    this.renderer.setPreview(this.peeking || this.previewing);
  }

  private syncTool(): void {
    const state = this.deps.store.getState();
    const active = state.activeTool === 'wall';
    this.wallRenderer.setVisible(active);
    this.doors.view.visible = active || state.lighting.enabled;
    if (active) return;
    this.wallRenderer.clearPreview();
    this.wallRenderer.clearFreeformPreview();
    this.tool.cancelDrawing();
  }

  private listen(): void {
    const { eventBus } = this.deps;
    const on = <Args extends unknown[]>(event: string, handler: (...args: Args) => void): void => {
      eventBus.on(event, handler);
      this.cleanups.push(() => eventBus.off(event, handler));
    };
    on('wall-submode-changed', (subMode: WallToolSubMode) => this.tool.setSubMode(subMode));
    on('wall-type-changed', (type: WallType) => this.tool.setWallType(type));
    on('wall-mode-changed', (mode: WallToolMode) => this.tool.setMode(mode));
    on('lighting-preset-changed', (preset: LightPresetId) => this.tool.setLightPreset(preset));
    on('lighting-preview', (preview: boolean) => {
      this.previewing = preview;
      this.applyPreview();
    });
    on('lighting-reset-explored', () => this.renderer.resetExplored());
    // A chain half drawn on the old scene must not follow the map switch.
    on('map-unloading', () => this.tool.cancelDrawing());
    on('wall-chain-start', (point: Point) => {
      this.drawing.start();
      this.wallRenderer.setPreviewAnchor(point);
    });
    on('wall-segment-created', ({ p1, p2, type, chainId }: SegmentEvent) => {
      this.drawing.add({ type, p1, p2, chainId, closed: true });
      if (this.tool.isCurrentlyDrawing()) this.wallRenderer.setPreviewAnchor(p2);
    });
    on('wall-chain-finish', () => {
      this.drawing.finish();
      this.wallRenderer.clearPreview();
    });
    on('wall-drawing-cancelled', () => {
      this.drawing.cancel();
      this.wallRenderer.clearPreview();
      this.wallRenderer.clearFreeformPreview();
    });
  }

  private pointerDown(point: Point, shift: boolean, ctrl: boolean): boolean {
    if (this.walls.isPlacingDoor()) {
      this.walls.confirmDoorPlacement();
      return true;
    }
    const settings = this.tool.getSettings();
    if (shift && !ctrl && settings.mode === 'point-to-point' && settings.subMode === 'draw') {
      // Shift on a vertex continues from it; Shift on a wall line splits the wall there
      const endpoint = this.vertexAt(point);
      if (endpoint) {
        this.tool.continueFromEndpoint(endpoint.x, endpoint.y);
        this.wallRenderer.setPreviewAnchor(endpoint);
        return true;
      }
      const wallId = this.wallRenderer.hitTestWalls(point.x, point.y);
      if (wallId) {
        this.split(wallId, point);
        return true;
      }
    }
    // Without Shift (or with Ctrl to multi-select), existing walls and lights take the click
    if ((!shift || ctrl) && this.walls.handlePointerDown(point.x, point.y, ctrl)) {
      this.wallRenderer.clearPreview();
      return true;
    }
    if (settings.subMode === 'place-light') {
      this.deps.store.getState().addLight({ x: point.x, y: point.y, emission: emissionOfPreset(settings.lightPreset) });
      return true;
    }
    if (settings.mode === 'point-to-point') {
      this.tool.addVertex(point.x, point.y, shift);
      return true;
    }
    const start = this.vertexAt(point) ?? point;
    this.tool.startFreeform(start.x, start.y);
    this.wallRenderer.startFreeformPreview(start.x, start.y);
    return true;
  }

  private pointerMove(point: Point): void {
    if (this.walls.isPlacingDoor()) {
      this.walls.updateDoorPlacement(point.x, point.y);
      return;
    }
    if (this.walls.isDragging()) {
      this.walls.handlePointerMove(point.x, point.y);
      return;
    }
    if (!this.tool.isCurrentlyDrawing()) return;
    if (this.tool.getSettings().mode === 'point-to-point') {
      this.wallRenderer.updatePreviewCursor(point.x, point.y);
    } else {
      this.tool.addFreeformPoint(point.x, point.y);
      this.wallRenderer.addFreeformPreviewPoint(point.x, point.y);
    }
  }

  private pointerUp(): void {
    this.walls.handlePointerUp();
    if (!this.tool.isCurrentlyDrawing() || this.tool.getSettings().mode !== 'freeform') return;
    // A stroke's segments arrive together; one session makes them one undo step
    this.drawing.start();
    this.tool.finishFreeform();
    this.drawing.finish();
    this.wallRenderer.clearFreeformPreview();
  }

  private vertexAt(point: Point): Point | null {
    const hit = this.wallRenderer.hitTestVertices(point.x, point.y);
    const wall = hit ? this.deps.store.getState().objects.walls[hit.wallId] : undefined;
    return hit && wall ? wall[hit.vertex] : null;
  }

  private split(wallId: string, at: Point): void {
    const state = this.deps.store.getState();
    const wall = state.objects.walls[wallId];
    const halves = wall ? splitWall(wall, at) : null;
    if (!halves) return;
    runHistoryTransaction(this.deps.store, () => {
      state.deleteWall(wallId);
      for (const half of halves) state.addWall(half);
    });
  }

  destroy(): void {
    this.drawing.finish();
    for (const cleanup of this.cleanups) cleanup();
    this.renderer.destroy();
    this.doors.destroy();
    this.wallRenderer.destroy();
    this.walls.destroy();
  }
}
