import { Graphics } from 'pixi.js';
import type { Sight } from '../../vision/sight';
import type { MapBounds, Polygon } from '../../vision/visibility';
import { destroyTree } from '../utils/destroyTree';

/** Alpha a pixel in line of sight gets in the lighting layer; darkvision raises it to 1. */
export const SIGHT_ALPHA = 0.5;

/**
 * Writes what the viewer sees into the lighting layer's alpha with `max` blending, which
 * leaves the light in rgb untouched. A transparent map-sized rectangle keeps the layer (and
 * so the composite) covering the whole map even where nothing is lit or seen.
 */
export class SightLayer {
  readonly view = new Graphics();

  constructor() {
    this.view.blendMode = 'max';
    this.view.eventMode = 'none';
  }

  draw(sight: Sight, bounds: MapBounds): void {
    const g = this.view;
    g.clear();
    g.rect(0, 0, bounds.width, bounds.height).fill({ color: 0x000000, alpha: 0 });
    if (sight.all) return;
    for (const polygon of sight.polygons) fillPolygon(g, polygon, SIGHT_ALPHA);
    for (const polygon of sight.darkvision) fillPolygon(g, polygon, 1);
  }

  destroy(): void {
    destroyTree(this.view);
  }
}

function fillPolygon(g: Graphics, polygon: Polygon, alpha: number): void {
  if (polygon.length < 3) return;
  g.poly(polygon.flatMap((p) => [p.x, p.y])).fill({ color: 0x000000, alpha });
}
