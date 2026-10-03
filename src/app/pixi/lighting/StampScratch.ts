import { Container, Graphics, Matrix, RenderTexture, type Renderer } from 'pixi.js';
import type { ExploredShapes } from '../../vision/exploredShapes';
import type { Polygon } from '../../vision/visibility';
import { destroyTree } from '../utils/destroyTree';

/** Side of the scratch target and of the tiles a stamp is drawn in, in texels. */
export const TILE = 512;

/** A rectangle of texels in the explored memory. */
export interface TexelRegion {
  x: number;
  y: number;
  width: number;
  height: number;
}

/**
 * Where a stamp lands in the memory: the bounds of what it draws (of the clip where that is
 * smaller), in texels, cut to the texture. Null when it draws nothing.
 */
export function stampRegion({ polygons, clip, ambient }: ExploredShapes, scale: number, limit: { width: number; height: number }): TexelRegion | null {
  // The ambient light of a scene with zones is painted over the whole clip.
  const drawn = ambient && clip ? boundsOf(clip) : boundsOf(polygons);
  const visible = clip ? boundsOf(clip) : drawn;
  if (!drawn || !visible) return null;
  const x0 = Math.max(0, Math.floor(Math.max(drawn.minX, visible.minX) * scale));
  const y0 = Math.max(0, Math.floor(Math.max(drawn.minY, visible.minY) * scale));
  const x1 = Math.min(limit.width, Math.ceil(Math.min(drawn.maxX, visible.maxX) * scale));
  const y1 = Math.min(limit.height, Math.ceil(Math.min(drawn.maxY, visible.maxY) * scale));
  return x1 > x0 && y1 > y0 ? { x: x0, y: y0, width: x1 - x0, height: y1 - y0 } : null;
}

/** The corners of the `TILE`-aligned tiles that `region` touches. */
export function tilesOf(region: TexelRegion): { x: number; y: number }[] {
  const tiles: { x: number; y: number }[] = [];
  for (let y = Math.floor(region.y / TILE) * TILE; y < region.y + region.height; y += TILE) {
    for (let x = Math.floor(region.x / TILE) * TILE; x < region.x + region.width; x += TILE) tiles.push({ x, y });
  }
  return tiles;
}

/**
 * A fixed multisampled target the explored stamps are drawn into one tile at a time, so their
 * edges are anti-aliased without making the whole memory texture multisampled, and however
 * large a stamp is, this costs the same.
 */
export class StampScratch {
  private readonly target = RenderTexture.create({ width: TILE, height: TILE, antialias: true });
  private readonly stamp = new Container();
  private readonly painter = new Graphics();
  private readonly clip = new Graphics();
  /** Magical darkness: black over what was painted, so nothing of it is recorded. */
  private readonly hole = new Graphics();
  /** The darkness again, in white, shown only where a sense that sees in it perceives it. */
  private readonly pierced = new Graphics();
  private readonly piercing = new Graphics();

  constructor(private readonly renderer: Renderer) {
    this.stamp.addChild(this.painter, this.clip, this.hole, this.pierced, this.piercing);
    this.pierced.mask = this.piercing;
  }

  /** Builds the shapes once; `renderTile` then only moves them. */
  begin({ polygons, clip, except, ambient }: ExploredShapes): void {
    this.painter.clear();
    if (ambient) this.paintAmbient(ambient, clip ?? []);
    fillPolygons(this.painter, polygons);
    fillPolygons(this.clip.clear(), clip ?? []);
    this.painter.mask = clip ? this.clip : null;
    // The scratch is merged with `max`: black records nothing.
    fillPolygons(this.hole.clear(), except?.areas ?? [], 0x000000);
    const seenInDarkness = except && except.unless.length > 0;
    fillPolygons(this.pierced.clear(), seenInDarkness ? except.areas : []);
    fillPolygons(this.piercing.clear(), seenInDarkness ? except.unless : []);
  }

  /** Where the ambient light of a scene with zones is lit: the scene itself over the clip's bounds, then each zone in its order, lit or dark. */
  private paintAmbient({ base, zones }: NonNullable<ExploredShapes['ambient']>, clip: readonly Polygon[]): void {
    const bounds = boundsOf(clip);
    if (base && bounds) this.painter.rect(bounds.minX, bounds.minY, bounds.maxX - bounds.minX, bounds.maxY - bounds.minY).fill({ color: 0xffffff });
    for (const { polygon, lit } of zones) fillPolygons(this.painter, [polygon], lit ? 0xffffff : 0x000000);
  }

  /** Draws the begun shapes into the scratch so it shows the tile at (`x`, `y`) of the memory. */
  renderTile(scale: number, x: number, y: number): RenderTexture {
    this.renderer.render({
      container: this.stamp,
      target: this.target,
      clear: true,
      clearColor: [0, 0, 0, 0],
      transform: new Matrix(scale, 0, 0, scale, -x, -y),
    });
    return this.target;
  }

  destroy(): void {
    destroyTree(this.stamp);
    this.target.destroy(true);
  }
}

function boundsOf(polygons: readonly Polygon[]): { minX: number; minY: number; maxX: number; maxY: number } | null {
  let bounds: { minX: number; minY: number; maxX: number; maxY: number } | null = null;
  for (const polygon of polygons) {
    if (polygon.length < 3) continue;
    for (const { x, y } of polygon) {
      bounds ??= { minX: x, minY: y, maxX: x, maxY: y };
      bounds.minX = Math.min(bounds.minX, x);
      bounds.minY = Math.min(bounds.minY, y);
      bounds.maxX = Math.max(bounds.maxX, x);
      bounds.maxY = Math.max(bounds.maxY, y);
    }
  }
  return bounds;
}

function fillPolygons(g: Graphics, polygons: readonly Polygon[], color = 0xffffff): Graphics {
  for (const polygon of polygons) {
    if (polygon.length >= 3) g.poly(polygon.flatMap((p) => [p.x, p.y])).fill({ color });
  }
  return g;
}
