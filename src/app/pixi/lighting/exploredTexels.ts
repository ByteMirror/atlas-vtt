import { BufferImageSource, Container, Graphics, Rectangle, Sprite, Texture, type RenderTexture, type Renderer } from 'pixi.js';
import { destroyTree } from '../utils/destroyTree';
import type { TexelRegion } from './StampScratch';

/**
 * The explored memory's texels as bytes, for the undo steps of edits by hand: read from the
 * texture itself and written back texel for texel, at the memory's own size, never through the
 * image a scene saves.
 */

/** The coverage (0..255) of every texel of `region` of the memory, top row first. */
export function readCoverage(renderer: Renderer, memory: RenderTexture, region: TexelRegion): Uint8Array {
  const view = new Texture({ source: memory.source, frame: new Rectangle(region.x, region.y, region.width, region.height) });
  const { pixels } = renderer.extract.pixels({ target: view });
  view.destroy(false);
  const coverage = new Uint8Array(region.width * region.height);
  for (let i = 0; i < coverage.length; i++) coverage[i] = pixels[i * 4]!;
  return coverage;
}

/** Puts `coverage`, as `readCoverage` gave it, back into `region` of the memory: the texels there are replaced. */
export function writeCoverage(renderer: Renderer, memory: RenderTexture, region: TexelRegion, coverage: Uint8Array): void {
  const texels = new Uint8Array(coverage.length * 4);
  // Premultiplied white, as the stamps draw it.
  for (let i = 0; i < coverage.length; i++) texels.fill(coverage[i]!, i * 4, i * 4 + 4);
  const image = new Texture({ source: new BufferImageSource({ resource: texels, width: region.width, height: region.height, alphaMode: 'premultiplied-alpha', scaleMode: 'nearest' }) });
  const patch = new Container();
  // What the region held goes first: `erase` leaves nothing of it under an opaque shape.
  const blank = new Graphics().rect(region.x, region.y, region.width, region.height).fill({ color: 0xffffff });
  blank.blendMode = 'erase';
  const sprite = new Sprite(image);
  sprite.position.set(region.x, region.y);
  patch.addChild(blank, sprite);
  renderer.render({ container: patch, target: memory, clear: false });
  destroyTree(patch);
  image.destroy(true);
}
