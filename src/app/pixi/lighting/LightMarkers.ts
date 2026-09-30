import { Container, Graphics } from 'pixi.js';
import type { Viewport } from 'pixi-viewport';
import type { ViewAtlasState, ViewAtlasStore } from '../../storeFactory';
import type { LightSource } from '../../types/lightingTypes';
import { destroyTree } from '../utils/destroyTree';
import { mapMarkerScale } from '../utils/mapMarkerScale';

/** Above the lighting layer (90), so the GM finds lights in the dark; below token UI (100). */
export const LIGHT_MARKERS_Z_INDEX = 95;
/** Screen pixels, like map pins. */
const RADIUS = 7;
const WARM = 0xffcc33;
const FLAME = 0xfff4d6;

type MarkerState = Pick<ViewAtlasState, 'lighting' | 'activeTool'>;

/** Lit scenes show the markers, except while the lighting tool draws the full light handles. */
export function lightMarkersShown({ lighting, activeTool }: MarkerState): boolean {
  return lighting.enabled && activeTool !== 'wall';
}

/** A faint warm disc with a flame dot; a switched-off light is only its ring. */
function drawMarker(g: Graphics, hidden: boolean): void {
  g.clear();
  g.circle(0, 0, RADIUS).stroke({ width: 3, color: 0x000000, alpha: 0.25 });
  if (hidden) {
    g.circle(0, 0, RADIUS).stroke({ width: 1.5, color: WARM, alpha: 0.4 });
    return;
  }
  g.circle(0, 0, RADIUS).fill({ color: WARM, alpha: 0.3 }).stroke({ width: 1.5, color: WARM, alpha: 0.65 });
  g.circle(0, 0, 2.5).fill({ color: FLAME, alpha: 0.75 });
}

interface Marker {
  graphics: Graphics;
  light: LightSource;
}

/**
 * A faint icon on every placed light for the GM, at a constant size on screen, so lights are
 * found without the lighting tool. It never reaches the player view (`GmOverlays`). Markers
 * move in place when their light changes and are only updated while shown.
 */
export class LightMarkers {
  readonly view = new Container({ label: 'light-markers', zIndex: LIGHT_MARKERS_Z_INDEX, eventMode: 'none', interactiveChildren: false });
  private readonly markers = new Map<string, Marker>();
  private readonly unsubscribe: () => void;
  private readonly rescale = (): void => {
    const scale = this.scale();
    for (const { graphics } of this.markers.values()) graphics.scale.set(scale);
  };

  constructor(private readonly viewport: Viewport, store: ViewAtlasStore) {
    viewport.addChild(this.view);
    viewport.on('zoomed', this.rescale);
    viewport.on('zoomed-end', this.rescale);
    this.unsubscribe = store.subscribe((state, previous) => {
      if (
        state.objects.lights !== previous.objects.lights
        || state.lighting.enabled !== previous.lighting.enabled
        || state.activeTool !== previous.activeTool
      ) this.sync(state);
    });
    this.sync(store.getState());
  }

  private scale(): number {
    return mapMarkerScale(this.viewport.scale.x);
  }

  private sync(state: ViewAtlasState): void {
    const shown = lightMarkersShown(state);
    this.view.visible = shown;
    if (!shown) return;
    const { lights } = state.objects;
    for (const [id, marker] of this.markers) {
      if (lights[id]) continue;
      destroyTree(marker.graphics);
      this.markers.delete(id);
    }
    for (const light of Object.values(lights)) {
      const previous = this.markers.get(light.id);
      if (previous?.light === light) continue;
      const graphics = previous?.graphics ?? this.view.addChild(new Graphics({ scale: this.scale() }));
      if (!previous || !!previous.light.hidden !== !!light.hidden) drawMarker(graphics, !!light.hidden);
      graphics.position.set(light.x, light.y);
      this.markers.set(light.id, { graphics, light });
    }
  }

  destroy(): void {
    this.unsubscribe();
    this.viewport.off('zoomed', this.rescale);
    this.viewport.off('zoomed-end', this.rescale);
    this.markers.clear();
    destroyTree(this.view);
  }
}
