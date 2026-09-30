import { Container, Graphics, Matrix, RenderTexture, type Renderer } from 'pixi.js';
import type { ExploredShapes } from '../../vision/exploredShapes';
import type { Polygon } from '../../vision/visibility';
import { destroyTree } from '../utils/destroyTree';

/** Texels kept around a stamp so its anti-aliased edge is never cut. */
const PAD = 2;
/** The scratch grows in steps of this many texels, so stamps of nearly one size share it. */
const STEP = 16;
/** A scratch more than this many times larger than a stamp is replaced by a snug one. */
const MAX_WASTE = 4;

/** A rectangle of texels in the explored memory. */
export interface TexelRegion {
  x: number;
  y: number;
  width: number;
  height: number;
}

/**
 * Where a stamp lands in the memory: the bounds of what it draws (of the clip where that is
 * smaller), in texels, padded and cut to the texture. Null when it draws nothing.
 */
export function stampRegion({ polygons, clip }: ExploredShapes, scale: number, limit: { width: number; height: number }): TexelRegion | null {
  const drawn = boundsOf(polygons);
  const visible = clip ? boundsOf(clip) : drawn;
  if (!drawn || !visible) return null;
  const x0 = Math.max(0, Math.floor(Math.max(drawn.minX, visible.minX) * scale) - PAD);
  const y0 = Math.max(0, Math.floor(Math.max(drawn.minY, visible.minY) * scale) - PAD);
  const x1 = Math.min(limit.width, Math.ceil(Math.min(drawn.maxX, visible.maxX) * scale) + PAD);
  const y1 = Math.min(limit.height, Math.ceil(Math.min(drawn.maxY, visible.maxY) * scale) + PAD);
  return x1 > x0 && y1 > y0 ? { x: x0, y: y0, width: x1 - x0, height: y1 - y0 } : null;
}

/**
 * A small multisampled target the explored stamps are drawn into, so that their edges are
 * anti-aliased without making the whole memory texture multisampled. It is only as large as
 * the stamp being drawn and is reused between stamps.
 */
export class StampScratch {
  private target: RenderTexture | null = null;
  private readonly stamp = new Container();
  private readonly painter = new Graphics();
  private readonly clip = new Graphics();

  constructor(private readonly renderer: Renderer) {
    this.stamp.addChild(this.painter, this.clip);
  }

  /** Draws `shapes` into the scratch, which then shows `region` of the memory from its top-left corner. */
  draw({ polygons, clip }: ExploredShapes, scale: number, region: TexelRegion): RenderTexture {
    const target = this.targetFor(region);
    fillPolygons(this.painter.clear(), polygons);
    fillPolygons(this.clip.clear(), clip ?? []);
    this.painter.mask = clip ? this.clip : null;
    this.renderer.render({
      container: this.stamp,
      target,
      clear: true,
      clearColor: [0, 0, 0, 0],
      transform: new Matrix(scale, 0, 0, scale, -region.x, -region.y),
    });
    return target;
  }

  destroy(): void {
    destroyTree(this.stamp);
    this.target?.destroy(true);
    this.target = null;
  }

  private targetFor({ width, height }: TexelRegion): RenderTexture {
    const fits = this.target !== null && this.target.width >= width && this.target.height >= height;
    const snug = fits && this.target!.width * this.target!.height <= MAX_WASTE * width * height;
    if (this.target && snug) return this.target;
    this.target?.destroy(true);
    this.target = RenderTexture.create({ width: roundUp(width), height: roundUp(height), antialias: true });
    return this.target;
  }
}

function roundUp(texels: number): number {
  return Math.ceil(texels / STEP) * STEP;
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

function fillPolygons(g: Graphics, polygons: readonly Polygon[]): Graphics {
  for (const polygon of polygons) {
    if (polygon.length >= 3) g.poly(polygon.flatMap((p) => [p.x, p.y])).fill({ color: 0xffffff });
  }
  return g;
}
