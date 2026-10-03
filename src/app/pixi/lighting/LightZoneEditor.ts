import type { EventEmitter } from 'events';
import type { Container } from 'pixi.js';
import type { Viewport } from 'pixi-viewport';
import { MAX_LIGHT_ZONES, MAX_ZONE_CORNERS, hasArea, lightZoneList } from '../../lighting/lightZones';
import type { ViewAtlasStore } from '../../storeFactory';
import { abandonHistoryTransaction, beginHistoryTransaction, endHistoryTransaction } from '../../stores/history';
import type { WallToolSubMode } from '../../tools/WallTool';
import type { Point } from '../../types/visionTypes';
import { LightZoneOverlay } from './LightZoneOverlay';
import { closesDraft, snapToWallEnd, zoneCornerAt, zoneHandleAt, type ZoneCorner } from './lightZoneGeometry';

export interface LightZoneEditorDeps {
  viewport: Viewport;
  /** The map's canvas: a pointer cancelled on it, or its window losing focus, ends a drag that will get no release. */
  canvas: HTMLCanvasElement;
  store: ViewAtlasStore;
  eventBus: EventEmitter;
  /** The lighting tool entered or left its zone mode: whoever owns the layer's visibility shows or hides it. */
  onActiveChange: () => void;
  /** A zone was begun on a map that holds `MAX_LIGHT_ZONES`: none is begun, and the GM is told. */
  onFull: () => void;
}

/** What a press needs of the pointer event: Alt places a corner freely, without snapping to a wall's end. */
type Keys = { altKey: boolean };

/**
 * The lighting tool's zone mode: a click places a corner of a new light zone, and Enter, a
 * click on the first corner or a double click closes it (one undo step); Escape drops it. A
 * corner of a zone is dragged to move it (one undo step; Escape, a cancelled pointer, the window
 * losing focus and the next press put it back and leave no step), a click on a
 * zone's handle opens its popover, and Delete deletes the zone whose popover is open. Corners
 * snap to wall ends close by, so a zone drawn along walls ends on them. It takes input only in
 * zone mode and while its layer shows; the popover is open only then too.
 */
export class LightZoneEditor {
  private readonly overlay: LightZoneOverlay;
  private mode: WallToolSubMode = 'draw';
  private draft: Point[] = [];
  private cursor: Point | null = null;
  private hovered: ZoneCorner | null = null;
  /** The corner being dragged, and the polygon as it was. */
  private drag: { corner: ZoneCorner; before: Point[] } | null = null;
  private readonly unsubscribe: () => void;
  private readonly redraw = (): void => this.draw();
  private readonly abort = (): void => {
    if (!this.drag) return;
    this.cancelDrag();
    this.draw();
  };
  private readonly onSubMode = (mode: WallToolSubMode): void => {
    const was = this.active;
    this.mode = mode;
    if (was === this.active) return;
    if (!this.active) this.stop();
    this.deps.onActiveChange();
  };

  constructor(private readonly deps: LightZoneEditorDeps) {
    const { viewport, store, eventBus } = deps;
    this.overlay = new LightZoneOverlay(viewport);
    viewport.on('zoomed', this.redraw);
    viewport.on('zoomed-end', this.redraw);
    eventBus.on('wall-submode-changed', this.onSubMode);
    this.unsubscribe = store.subscribe((state, previous) => {
      if (state.objects.lightZones !== previous.objects.lightZones || state.lightZonePopover !== previous.lightZonePopover) this.draw();
    });
  }

  /** The layer with the zones' outlines and handles. */
  get view(): Container {
    return this.overlay.view;
  }

  /** The lighting tool is in its zone mode. */
  get active(): boolean {
    return this.mode === 'light-zone';
  }

  /** A zone is being drawn. */
  get drawing(): boolean {
    return this.draft.length > 0;
  }

  private get shown(): boolean {
    return this.active && this.view.visible;
  }

  /** The layer was shown or hidden: it draws only while shown, and nothing is drawn or dragged where no one sees it. */
  afterVisibilityChange(): void {
    if (this.view.visible) this.draw();
    else this.stop();
  }

  pointerDown(point: Point, keys: Keys): boolean {
    if (!this.shown) return false;
    // A drag whose release never came (a button released outside the window) ends here.
    if (this.drag) this.cancelDrag();
    const { store } = this.deps;
    const zoom = this.zoom();
    if (this.drawing) {
      if (closesDraft(this.draft, point, zoom)) this.close();
      else this.place(point, keys);
      return true;
    }
    const zones = this.zones();
    const corner = zoneCornerAt(zones, point, zoom);
    const zone = corner && zones.find((candidate) => candidate.id === corner.zoneId);
    if (corner && zone) {
      this.drag = { corner, before: zone.polygon };
      beginHistoryTransaction(store);
      this.watchPointer(true);
    } else {
      const handle = zoneHandleAt(zones, point, zoom);
      if (handle) store.getState().openLightZonePopover(handle);
      else this.place(point, keys);
    }
    this.draw();
    return true;
  }

  pointerMove(point: Point, keys: Keys): void {
    if (!this.shown) return;
    if (this.drag) {
      const { zoneId, index } = this.drag.corner;
      const zone = this.zones().find((candidate) => candidate.id === zoneId);
      if (zone) this.deps.store.getState().updateLightZone(zoneId, { polygon: zone.polygon.map((corner, i) => (i === index ? this.snapped(point, keys) : corner)) });
      return;
    }
    // The overlay follows the pointer only where it shows it: the line to the next corner, or the corner under it.
    const hovered = this.drawing ? null : zoneCornerAt(this.zones(), point, this.zoom());
    const same = !this.drawing && this.cursor === null && hovered?.zoneId === this.hovered?.zoneId && hovered?.index === this.hovered?.index;
    this.cursor = this.drawing ? point : null;
    this.hovered = hovered;
    if (!same) this.draw(false);
  }

  pointerUp(): void {
    if (!this.drag) return;
    this.drag = null;
    this.watchPointer(false);
    endHistoryTransaction(this.deps.store);
    this.draw();
  }

  /** A double click closes the zone being drawn. */
  doubleClick(): void {
    if (this.shown && this.drawing) this.close();
  }

  cursorAt(point: Point): string {
    if (this.drawing) return 'crosshair';
    const zones = this.zones();
    if (zoneCornerAt(zones, point, this.zoom())) return 'grab';
    return zoneHandleAt(zones, point, this.zoom()) ? 'pointer' : 'crosshair';
  }

  /** Enter closes the zone being drawn; with fewer than three corners it goes on. */
  handleEnter(): boolean {
    if (!this.shown || !this.drawing) return false;
    this.close();
    return true;
  }

  /** Escape puts a dragged corner back, drops the zone being drawn or closes the zone popover. */
  handleEscape(): boolean {
    if (!this.shown) return false;
    const state = this.deps.store.getState();
    if (this.drag) this.cancelDrag();
    else if (this.drawing) this.draft = [];
    else if (state.lightZonePopover) state.closeLightZonePopover();
    else return false;
    this.cursor = null;
    this.draw();
    return true;
  }

  /** Delete deletes the zone whose popover is open. */
  handleDelete(): boolean {
    const state = this.deps.store.getState();
    if (!this.shown || !state.lightZonePopover) return false;
    state.deleteLightZone(state.lightZonePopover);
    return true;
  }

  /** Ends whatever is under way: a dragged corner goes back, a zone half drawn is dropped, the zone popover closes. */
  stop(): void {
    if (this.drag) this.cancelDrag();
    this.deps.store.getState().closeLightZonePopover();
    this.draft = [];
    this.cursor = null;
    this.hovered = null;
    this.draw();
  }

  private zones(): ReturnType<typeof lightZoneList> {
    return lightZoneList(this.deps.store.getState().objects.lightZones);
  }

  private zoom(): number {
    return this.deps.viewport.scale.x;
  }

  private snapped(point: Point, { altKey }: Keys): Point {
    return altKey ? point : snapToWallEnd(point, this.deps.store.getState().objects.walls, this.zoom());
  }

  private place(point: Point, keys: Keys): void {
    this.deps.store.getState().closeLightZonePopover();
    if (!this.drawing && this.zones().length >= MAX_LIGHT_ZONES) {
      this.deps.onFull();
      return;
    }
    this.draft = [...this.draft, this.snapped(point, keys)];
    this.cursor = point;
    // The engine reads a zone's outline from a list of this length: the last corner closes it.
    if (this.draft.length >= MAX_ZONE_CORNERS) this.close();
    this.draw();
  }

  /**
   * Makes the corners placed a zone, when they are an area: a new zone is one undo step, starts
   * with the scene's ambient light, and its popover opens. Corners on one line are none yet (such a zone could not be opened or deleted:
   * it shows nowhere), so drawing goes on.
   */
  private close(): void {
    // The second click of a double click lands on the corner the first one placed.
    const polygon = this.draft.filter((point, i) => i === 0 || point.x !== this.draft[i - 1]!.x || point.y !== this.draft[i - 1]!.y);
    if (polygon.length < 3 || !hasArea(polygon)) return;
    const state = this.deps.store.getState();
    this.draft = [];
    this.cursor = null;
    // The scene's own level, and its tint: closing a zone changes nothing on the map, and records nothing, until the GM sets its light.
    state.openLightZonePopover(state.addLightZone({ polygon, ambient: Math.min(1, Math.max(0, state.lighting.ambient)) }));
    this.draw();
  }

  private cancelDrag(): void {
    const { store } = this.deps;
    const { corner, before } = this.drag!;
    this.drag = null;
    this.watchPointer(false);
    if (store.getState().objects.lightZones?.[corner.zoneId]) store.getState().updateLightZone(corner.zoneId, { polygon: before });
    abandonHistoryTransaction(store);
  }

  /** While a corner is held, a pointer that is lost cancels the drag: no release would end it. */
  private watchPointer(on: boolean): void {
    const { canvas } = this.deps;
    const win = canvas.ownerDocument.defaultView;
    if (on) {
      canvas.addEventListener('pointercancel', this.abort);
      win?.addEventListener('blur', this.abort);
    } else {
      canvas.removeEventListener('pointercancel', this.abort);
      win?.removeEventListener('blur', this.abort);
    }
  }

  /** Draws the overlay; `retheme` false while it only follows the pointer, which never changes the theme. */
  private draw(retheme = true): void {
    if (retheme) this.overlay.retheme();
    this.overlay.draw(this.shown ? this.zones() : [], {
      selected: this.deps.store.getState().lightZonePopover,
      draft: this.draft,
      cursor: this.cursor,
      corner: this.drag?.corner ?? this.hovered,
    });
  }

  destroy(): void {
    if (this.drag) this.cancelDrag();
    this.unsubscribe();
    this.deps.eventBus.off('wall-submode-changed', this.onSubMode);
    this.deps.viewport.off('zoomed', this.redraw);
    this.deps.viewport.off('zoomed-end', this.redraw);
    this.overlay.destroy();
  }
}
