import { readLight } from '../../lighting/lightingObjects';
import { Container, Graphics } from 'pixi.js';
import type { Viewport } from 'pixi-viewport';
import type { MeasurementSettings } from '../../grid/measurementFormat';
import { gameUnitsToWorld, unitScaleOf, type UnitScale } from '../../lighting/lightingUnits';
import { beamOf } from '../../lighting/lightBeam';
import { RANGE_FIELDS } from '../../lighting/lightRanges';
import type { ViewAtlasStore } from '../../storeFactory';
import type { LightSource } from '../../types/lightingTypes';
import type { Point } from '../../types/visionTypes';
import type { VisionCone } from '../../vision/visionCone';
import { PANEL_ENTER_MS, prefersReducedMotion } from '../../utils/motion';
import { canvasBadgeColors } from '../utils/canvasBadgeColors';
import { destroyTree } from '../utils/destroyTree';
import { ValueTransition } from '../utils/ValueTransition';
import { lightColorNumber } from './lightMarker';
import { ringHandleAt, ringHandlePoint, rotationHandlePoint, type RingGeometry, type RingHandle } from './lightRingGeometry';

/** Above the light markers (95), below token UI (100). */
export const RANGE_RINGS_Z_INDEX = 96;
/** Screen pixels. */
const HANDLE_RADIUS = 6;
const LINE_WIDTH = 1.5;
const UNDER_WIDTH = 3.5;
const DASH = 7;
const DASH_GAP = 6;
const MAX_DASHES = 240;
const HANDLE_LIFT = 1.25;

/**
 * The bright and dim range of the light whose popover is open, as rings on the map: the bright
 * ring a solid line, the dim ring dashed (a source of magical darkness has the one ring of its radius, solid), in the light's colour over a dark hairline so they
 * read on any map, each with a handle to drag. A light that shines one way has arcs between
 * the two edges of its beam, the range handles on those edges and a third handle beyond the dim
 * arc that turns it. Lines and handles keep their size on screen.
 * They bloom out of the marker when the popover opens and fade back when it closes. A GM overlay
 * (`GmOverlays`): never in the players' view.
 */
export class LightRangeRings {
  readonly view = new Container({ label: 'light-range-rings', zIndex: RANGE_RINGS_Z_INDEX, eventMode: 'none', interactiveChildren: false });
  private readonly lines = this.view.addChild(new Graphics());
  private readonly handles: Record<RingHandle, Graphics> = {
    bright: this.view.addChild(new Graphics()),
    dim: this.view.addChild(new Graphics()),
    rotation: this.view.addChild(new Graphics()),
  };
  /** 0 hidden, 1 fully shown. */
  private readonly reveal = new ValueTransition(0, PANEL_ENTER_MS, () => this.draw());
  /** The light the rings are drawn for; it stays while they fade out. */
  private lightId: string | null = null;
  private suppressed = false;
  private hovered: RingHandle | null = null;
  private dragging: RingHandle | null = null;
  private readonly unsubscribe: () => void;
  private readonly redraw = (): void => this.draw();

  constructor(
    private readonly viewport: Viewport,
    private readonly store: ViewAtlasStore,
    private readonly measurement: () => MeasurementSettings,
  ) {
    this.view.visible = false;
    viewport.addChild(this.view);
    viewport.on('zoomed', this.redraw);
    viewport.on('zoomed-end', this.redraw);
    this.unsubscribe = store.subscribe((state, previous) => {
      if (state.lightPopover !== previous.lightPopover) this.follow(state.lightPopover);
      else if (state.objects.lights !== previous.objects.lights || state.grid !== previous.grid) this.draw();
    });
    this.follow(store.getState().lightPopover);
  }

  /** Hides the rings at once while the canvas shows the players' view. */
  setSuppressed(on: boolean): void {
    if (this.suppressed === on) return;
    this.suppressed = on;
    this.draw();
  }

  setHovered(handle: RingHandle | null): void {
    if (this.hovered === handle) return;
    this.hovered = handle;
    this.draw();
  }

  setDragging(handle: RingHandle | null): void {
    if (this.dragging === handle) return;
    this.dragging = handle;
    this.draw();
  }

  /** How many game units a cell spans and how wide it is, for converting a drag. */
  unitScale(): UnitScale {
    return unitScaleOf(this.measurement(), this.store.getState().grid);
  }

  /** The rings of the open light, or null while none show. */
  geometry(): RingGeometry | null {
    const light = this.shownLight();
    if (!light || this.suppressed || this.store.getState().lightPopover !== light.id) return null;
    return this.geometryOf(light, 1);
  }

  /** The rings of `light`, `grow` times their size. */
  private geometryOf(light: LightSource, grow: number): RingGeometry {
    const scale = this.unitScale();
    const cone = beamOf(light);
    return {
      center: { x: light.x, y: light.y },
      radius: { bright: gameUnitsToWorld(light.emission.bright, scale) * grow, dim: gameUnitsToWorld(light.emission.dim, scale) * grow },
      ...(cone && { cone }),
    };
  }

  /** The handle at the world point, while the rings show. */
  handleAt(x: number, y: number): RingHandle | null {
    const geometry = this.geometry();
    return geometry ? ringHandleAt(geometry, { x, y }, this.viewport.scale.x) : null;
  }

  private shownLight(): LightSource | null {
    return this.lightId ? readLight(this.store.getState().objects.lights[this.lightId]) : null;
  }

  /** The popover opened, moved to another light or closed. */
  private follow(lightId: string | null): void {
    const reduce = prefersReducedMotion(document.body);
    if (lightId) {
      // Rings of another light bloom anew from its marker.
      if (lightId !== this.lightId) this.reveal.jumpTo(0);
      this.lightId = lightId;
      if (reduce) this.reveal.jumpTo(1);
      else this.reveal.animateTo(1);
      return;
    }
    this.hovered = null;
    this.dragging = null;
    const forget = (): void => {
      this.lightId = null;
      this.draw();
    };
    if (reduce || this.reveal.value === 0) {
      this.reveal.jumpTo(0);
      forget();
    } else {
      this.reveal.animateTo(0, forget);
    }
  }

  private draw(): void {
    const light = this.shownLight();
    const reveal = this.reveal.value;
    const shown = !!light && !this.suppressed && reveal > 0;
    this.view.visible = shown;
    this.lines.clear();
    if (!light || !shown) return;

    const zoom = this.viewport.scale.x;
    const pixel = 1 / zoom;
    const color = lightColorNumber(light.emission.color);
    this.view.alpha = reveal;
    // The rings grow the last tenth of their radius as they fade in.
    const geometry = this.geometryOf(light, 0.9 + 0.1 * reveal);
    const { center, radius, cone } = geometry;
    const turn = rotationHandlePoint(geometry, zoom);
    const g = this.lines;
    for (const field of RANGE_FIELDS) {
      this.handles[field].visible = radius[field] > 0;
      if (radius[field] <= 0) continue;
      for (const [width, lineColor, alpha] of [[UNDER_WIDTH, 0x000000, 0.45], [LINE_WIDTH, color, 1]] as const) {
        // A light's dim range is dashed; a darkness has one ring, where it ends, and it is solid.
        if (field === 'bright' || light.emission.darkness) this.arc(center, radius[field], cone);
        else this.dashes(center, radius.dim, zoom, cone);
        // The beam's two edges and the stem of the handle that turns it belong to its outer arc.
        if (field === 'dim' && cone) this.beamLines(center, radius.dim, cone, turn);
        g.stroke({ width: width * pixel, color: lineColor, alpha });
      }
      this.placeHandle(field, ringHandlePoint(geometry, field), color, pixel);
    }
    this.handles.rotation.visible = !!turn;
    if (turn) this.placeHandle('rotation', turn, color, pixel);
  }

  /** A ring: the whole circle, or the arc between a beam's edges. */
  private arc(center: Point, radius: number, cone: VisionCone | undefined): void {
    if (!cone) {
      this.lines.circle(center.x, center.y, radius);
      return;
    }
    const start = cone.facing - cone.angle / 2;
    this.lines.moveTo(center.x + Math.cos(start) * radius, center.y + Math.sin(start) * radius);
    this.lines.arc(center.x, center.y, radius, start, start + cone.angle);
  }

  /** The dim ring: dashes of a constant length on screen, as many as fit. */
  private dashes(center: Point, radius: number, zoom: number, cone: VisionCone | undefined): void {
    const sweep = cone?.angle ?? 2 * Math.PI;
    const length = sweep * radius * zoom;
    const count = Math.min(MAX_DASHES, Math.max(cone ? 2 : 8, Math.round(length / (DASH + DASH_GAP))));
    // Around a circle a gap follows every dash; on a beam's arc a dash ends at each edge.
    const unit = sweep / (count * DASH + (cone ? count - 1 : count) * DASH_GAP);
    const dash = unit * DASH;
    // Centred on the handle's axis, so a dash, not a gap, sits under the handle.
    const first = cone ? cone.facing - cone.angle / 2 : Math.PI / 2 - dash / 2;
    for (let i = 0; i < count; i++) {
      const start = first + i * unit * (DASH + DASH_GAP);
      this.lines.moveTo(center.x + Math.cos(start) * radius, center.y + Math.sin(start) * radius);
      this.lines.arc(center.x, center.y, radius, start, start + dash);
    }
  }

  private beamLines(center: Point, radius: number, cone: VisionCone, turn: Point | null): void {
    for (const side of [-1, 1]) {
      const angle = cone.facing + (side * cone.angle) / 2;
      this.lines.moveTo(center.x, center.y).lineTo(center.x + Math.cos(angle) * radius, center.y + Math.sin(angle) * radius);
    }
    if (turn) this.lines.moveTo(center.x + Math.cos(cone.facing) * radius, center.y + Math.sin(cone.facing) * radius).lineTo(turn.x, turn.y);
  }

  private placeHandle(which: RingHandle, at: Point, color: number, pixel: number): void {
    const handle = this.handles[which];
    const held = this.dragging === which;
    handle.clear();
    handle.circle(0, 0, HANDLE_RADIUS + 1).stroke({ width: 1, color: 0x000000, alpha: 0.45 });
    handle.circle(0, 0, HANDLE_RADIUS).fill({ color: held ? color : canvasBadgeColors().background });
    handle.circle(0, 0, HANDLE_RADIUS - 1).stroke({ width: 2, color });
    // The handle that turns the beam has a dot in it, which tells it from the two that resize.
    if (which === 'rotation' && !held) handle.circle(0, 0, 2).fill({ color });
    handle.position.set(at.x, at.y);
    handle.scale.set(pixel * (this.hovered === which || held ? HANDLE_LIFT : 1));
  }

  destroy(): void {
    this.unsubscribe();
    this.reveal.cancel();
    this.viewport.off('zoomed', this.redraw);
    this.viewport.off('zoomed-end', this.redraw);
    destroyTree(this.view);
  }
}
