import type { EventEmitter } from 'events';
import type { Container } from 'pixi.js';
import type { Viewport } from 'pixi-viewport';
import { chosenLightPreset, emissionOf } from '../../lighting/lightPresetChoice';
import type { LightPresetDefinition } from '../../types/lightPresetTypes';
import type { ViewAtlasStore } from '../../storeFactory';
import { runHistoryTransaction } from '../../stores/history';
import { WallTool, type WallToolMode, type WallToolSubMode } from '../../tools/WallTool';
import type { Point } from '../../types/visionTypes';
import type { WallType } from '../../types/wallTypes';
import { WallInteraction } from '../vision/WallInteraction';
import { WallRenderer } from '../vision/WallRenderer';
import { WallDrawingSession } from './WallDrawingSession';
import { splitWall } from './wallEdits';

interface SegmentEvent { p1: Point; p2: Point; type: WallType; chainId: string }

/**
 * The lighting tool's editor: wall lines and their handles, and the tool's input to them. Lights
 * have their own markers, which take the pointer before the editor does (`LightInteraction`);
 * the editor only keeps which of them are selected. It takes input only while its layer shows
 * (`shown`); whoever owns the layer's visibility calls `afterVisibilityChange`, which ends
 * whatever was under way once it is hidden, so nothing is drawn or dragged where no one sees it.
 */
export class WallEditor {
  readonly renderer: WallRenderer;
  readonly walls: WallInteraction;
  private readonly tool: WallTool;
  private readonly drawing: WallDrawingSession;
  private readonly cleanups: Array<() => void> = [];

  /** `onLightSelection` shows the selected lights on their markers; `lightPresets` are the lights of the map's collection. */
  constructor(
    viewport: Viewport,
    private readonly store: ViewAtlasStore,
    eventBus: EventEmitter,
    onLightSelection: (lightIds: string[]) => void,
    private readonly lightPresets: () => readonly LightPresetDefinition[],
  ) {
    this.renderer = new WallRenderer(viewport, store);
    this.walls = new WallInteraction(store, this.renderer, onLightSelection);
    this.tool = new WallTool(eventBus);
    this.drawing = new WallDrawingSession(store);
    this.listen(eventBus);
  }

  /** The layer with the editor's lines and handles. */
  get layer(): Container {
    return this.renderer.getContainer();
  }

  get shown(): boolean {
    return this.layer.visible;
  }

  /** The layer was shown or hidden: it draws only while shown, and edits nothing while hidden. */
  afterVisibilityChange(): void {
    if (this.shown) this.renderer.forceRedraw();
    else this.stop();
  }

  pointerDown(point: Point, shift: boolean, ctrl: boolean): boolean {
    if (!this.shown) return false;
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
        this.renderer.setPreviewAnchor(endpoint);
        return true;
      }
      const wallId = this.renderer.hitTestWalls(point.x, point.y);
      if (wallId) {
        this.split(wallId, point);
        return true;
      }
    }
    // Without Shift (or with Ctrl to multi-select), existing walls take the click
    if ((!shift || ctrl) && this.walls.handlePointerDown(point.x, point.y, ctrl)) {
      this.renderer.clearPreview();
      return true;
    }
    if (settings.subMode === 'place-light') {
      const emission = emissionOf(chosenLightPreset(this.lightPresets(), settings.lightPreset));
      this.store.getState().addLight({ x: point.x, y: point.y, emission });
      return true;
    }
    if (settings.mode === 'point-to-point') {
      this.tool.addVertex(point.x, point.y, shift);
      return true;
    }
    const start = this.vertexAt(point) ?? point;
    this.tool.startFreeform(start.x, start.y);
    this.renderer.startFreeformPreview(start.x, start.y);
    return true;
  }

  pointerMove(point: Point): void {
    if (!this.shown) return;
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
      this.renderer.updatePreviewCursor(point.x, point.y);
    } else {
      this.tool.addFreeformPoint(point.x, point.y);
      this.renderer.addFreeformPreviewPoint(point.x, point.y);
    }
  }

  pointerUp(): void {
    this.walls.handlePointerUp();
    this.finishStroke();
  }

  /** A double click ends the chain being drawn. */
  doubleClick(): void {
    if (this.shown) this.tool.finishChain();
  }

  cursorAt(point: Point): string {
    if (!this.shown) return 'default';
    if (this.renderer.hitTestVertices(point.x, point.y)) return 'grab';
    return this.renderer.hitTestWalls(point.x, point.y) ? 'pointer' : 'crosshair';
  }

  /** A wall handle shows at the point: it is grabbed before a light's marker beneath it. */
  handleAt(point: Point): boolean {
    return this.shown && this.renderer.hitTestVertices(point.x, point.y) !== null;
  }

  /** Escape: stop placing a door, drop the chain being drawn, or clear the wall selection. */
  handleEscape(): boolean {
    if (!this.shown) return false;
    if (this.walls.isPlacingDoor()) this.walls.cancelDoorPlacement();
    else if (this.tool.isCurrentlyDrawing()) this.tool.cancelDrawing();
    else if (this.walls.hasSelection()) this.walls.clearSelection();
    else return false;
    return true;
  }

  handleDelete(): boolean {
    if (!this.shown) return false;
    this.walls.deleteSelected();
    return true;
  }

  /** A chain half drawn on a scene must not follow the map switch. */
  cancelDrawing(): void {
    this.tool.cancelDrawing();
  }

  /** Ends a drag, a door placement and the chain or stroke being drawn. */
  private stop(): void {
    this.walls.handlePointerUp();
    this.walls.cancelDoorPlacement();
    if (this.store.getState().activeTool === 'wall') {
      // Only hidden (session view, the peek key): what was drawn so far is kept, as its one undo step.
      this.finishStroke();
      this.tool.finishChain();
    } else {
      this.tool.cancelDrawing();
    }
    this.renderer.clearPreview();
    this.renderer.clearFreeformPreview();
  }

  private finishStroke(): void {
    if (!this.tool.isCurrentlyDrawing() || this.tool.getSettings().mode !== 'freeform') return;
    // A stroke's segments arrive together; one session makes them one undo step
    this.drawing.start();
    this.tool.finishFreeform();
    this.drawing.finish();
    this.renderer.clearFreeformPreview();
  }

  private vertexAt(point: Point): Point | null {
    const hit = this.renderer.hitTestVertices(point.x, point.y);
    return hit ? this.store.getState().objects.walls[hit.wallId]?.[hit.vertex] ?? null : null;
  }

  private split(wallId: string, at: Point): void {
    const state = this.store.getState();
    const wall = state.objects.walls[wallId];
    const halves = wall ? splitWall(wall, at) : null;
    if (!halves) return;
    runHistoryTransaction(this.store, () => {
      state.deleteWall(wallId);
      for (const half of halves) state.addWall(half);
    });
  }

  private listen(eventBus: EventEmitter): void {
    const on = <Args extends unknown[]>(event: string, handler: (...args: Args) => void): void => {
      eventBus.on(event, handler);
      this.cleanups.push(() => eventBus.off(event, handler));
    };
    on('wall-submode-changed', (subMode: WallToolSubMode) => this.tool.setSubMode(subMode));
    on('wall-type-changed', (type: WallType) => this.tool.setWallType(type));
    on('wall-mode-changed', (mode: WallToolMode) => this.tool.setMode(mode));
    on('lighting-preset-changed', (preset: string) => this.tool.setLightPreset(preset));
    on('wall-chain-start', (point: Point) => {
      this.drawing.start();
      this.renderer.setPreviewAnchor(point);
    });
    on('wall-segment-created', ({ p1, p2, type, chainId }: SegmentEvent) => {
      this.drawing.add({ type, p1, p2, chainId, closed: true });
      if (this.tool.isCurrentlyDrawing()) this.renderer.setPreviewAnchor(p2);
    });
    on('wall-chain-finish', () => {
      this.drawing.finish();
      this.renderer.clearPreview();
    });
    on('wall-drawing-cancelled', () => {
      this.drawing.cancel();
      this.renderer.clearPreview();
      this.renderer.clearFreeformPreview();
    });
  }

  destroy(): void {
    this.drawing.finish();
    for (const cleanup of this.cleanups) cleanup();
    this.renderer.destroy();
    this.walls.destroy();
  }
}
