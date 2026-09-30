import { WebGLRenderer, type RenderTexture } from 'pixi.js';

/** A WebGL2 renderer on an offscreen canvas, as the plugin uses. */
export async function createTestRenderer(size = 512): Promise<WebGLRenderer> {
  const renderer = new WebGLRenderer();
  await renderer.init({ width: size, height: size, antialias: false, backgroundAlpha: 1 });
  return renderer;
}

/** Texels of a float target in GL row order (row 0 is where clip y = −1 wrote). */
export function readFloats(renderer: WebGLRenderer, target: RenderTexture): Float32Array {
  const { gl } = renderer;
  renderer.renderTarget.bind(target, false);
  const { pixelWidth, pixelHeight } = target.source;
  const out = new Float32Array(pixelWidth * pixelHeight * 4);
  gl.readPixels(0, 0, pixelWidth, pixelHeight, gl.RGBA, gl.FLOAT, out);
  return out;
}

/** Pixels of an 8-bit target, top row first, as PIXI presents them. */
export function readRgba(renderer: WebGLRenderer, target: RenderTexture): Uint8ClampedArray {
  return renderer.extract.pixels({ target }).pixels;
}
