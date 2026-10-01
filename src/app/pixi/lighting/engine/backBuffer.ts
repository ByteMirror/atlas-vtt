import type { Renderer, WebGLRenderer } from 'pixi.js';

/**
 * From this renderer resolution on, the lighting back buffer is not multisampled. An
 * antialiased canvas gives PIXI a 4× back buffer, whose samples are resolved several times a
 * frame (the composite's copy of the scene, the present): at 2880×1720 a lit render took
 * 10.6–14 ms of GPU time against 3.2–6.4 ms with a plain one, and at two device pixels per
 * CSS pixel the edges look nearly the same.
 */
export const PLAIN_BACK_BUFFER_RESOLUTION = 2;

/**
 * The one field of PIXI 8.21's `GlBackBufferSystem` this needs, private there and settable
 * only through `init`, which would leave another shader bound to the white texture on every
 * call. PIXI reads it when it creates the back buffer texture, on the first render through it.
 */
interface BackBufferMultisampling {
  _antialias: boolean;
}

/**
 * WebGL only offers the scene beneath a filter through a back buffer. Atlas never changes a
 * renderer's resolution after init, so the multisampling is settled before the back buffer
 * texture exists and that texture is never replaced.
 */
export function setBackBuffer(renderer: Renderer, on: boolean): void {
  if (renderer.name !== 'webgl') return;
  const { backBuffer } = renderer as WebGLRenderer;
  if (on && renderer.resolution >= PLAIN_BACK_BUFFER_RESOLUTION) {
    (backBuffer as unknown as BackBufferMultisampling)._antialias = false;
  }
  backBuffer.useBackBuffer = on;
}
