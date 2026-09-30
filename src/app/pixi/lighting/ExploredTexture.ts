import { Container, Graphics, Matrix, RenderTexture, Sprite, Texture, type Renderer } from 'pixi.js';
import type { ExploredShapes } from '../../vision/exploredShapes';
import type { Polygon } from '../../vision/visibility';
import type { MapBounds } from '../../vision/visibility';
import { destroyTree } from '../utils/destroyTree';

/** Longest side of the explored memory in texels; it is drawn dim and soft, so this is plenty. */
const MAX_TEXELS = 2048;

/**
 * What the viewer's tokens have seen so far, in a world-space texture over the map: red is 1
 * where a token has seen. It only grows until reset. Shapes that must stay inside the line of
 * sight are drawn through a mask of it.
 */
export class ExploredTexture {
  readonly texture: RenderTexture;
  private readonly scale: number;
  private readonly stamp = new Container();
  private readonly painter = new Graphics();
  private readonly clip = new Graphics();

  constructor(private readonly renderer: Renderer, bounds: MapBounds) {
    this.scale = Math.min(1, MAX_TEXELS / Math.max(bounds.width, bounds.height, 1));
    this.texture = RenderTexture.create({
      width: Math.max(1, Math.ceil(bounds.width * this.scale)),
      height: Math.max(1, Math.ceil(bounds.height * this.scale)),
    });
    this.painter.blendMode = 'max';
    this.stamp.addChild(this.painter, this.clip);
    this.clear();
  }

  add({ polygons, clip }: ExploredShapes): void {
    fillPolygons(this.painter.clear(), polygons);
    fillPolygons(this.clip.clear(), clip ?? []);
    this.painter.mask = clip ? this.clip : null;
    this.renderer.render({ container: this.stamp, target: this.texture, clear: false, transform: new Matrix().scale(this.scale, this.scale) });
  }

  clear(): void {
    this.renderer.render({ container: new Container(), target: this.texture, clear: true, clearColor: [0, 0, 0, 0] });
  }

  /** Replaces the memory with a saved image of it. */
  async load(dataUrl: string): Promise<void> {
    const image = createEl('img', { attr: { src: dataUrl } });
    await image.decode();
    const texture = Texture.from(image);
    const sprite = new Sprite(texture);
    sprite.width = this.texture.width;
    sprite.height = this.texture.height;
    this.renderer.render({ container: sprite, target: this.texture, clear: true, clearColor: [0, 0, 0, 0] });
    destroyTree(sprite, { textures: true });
  }

  /** The memory as a canvas, for saving. */
  toCanvas(): HTMLCanvasElement {
    return this.renderer.extract.canvas({ target: this.texture }) as HTMLCanvasElement;
  }

  destroy(): void {
    destroyTree(this.stamp);
    this.texture.destroy(true);
  }
}

function fillPolygons(g: Graphics, polygons: readonly Polygon[]): Graphics {
  for (const polygon of polygons) {
    if (polygon.length >= 3) g.poly(polygon.flatMap((p) => [p.x, p.y])).fill({ color: 0xffffff });
  }
  return g;
}
