import { Texture, type Renderer, type Shader, type WebGLRenderer } from 'pixi.js';

/**
 * From this renderer resolution on, the lighting back buffer is not multisampled. A
 * multisampled back buffer has its samples resolved several times a frame (the composite's copy
 * of the scene, the present): at 2880×1720 a lit render took 10.6–14 ms of GPU time against
 * 3.2–6.4 ms with a plain one, and at two device pixels per CSS pixel the edges look nearly the
 * same.
 */
export const PLAIN_BACK_BUFFER_RESOLUTION = 2;

/**
 * The fields of PIXI 8.21's `GlBackBufferSystem` this needs, private there. `_antialias` is
 * settable only through `init`, which would leave another shader bound to the white texture on
 * every call; PIXI reads it when it creates `_backBufferTexture`, on the first render through
 * the back buffer, and keeps that texture until it is destroyed. `_bigTriangleShader` presents
 * the back buffer and holds it bound until the next present.
 */
interface BackBufferInternals {
  _antialias: boolean;
  _backBufferTexture: Texture | null;
  _bigTriangleShader: Shader;
}

function internalsOf(renderer: WebGLRenderer): BackBufferInternals {
  return renderer.backBuffer as unknown as BackBufferInternals;
}

/**
 * Draws the canvas through the back buffer or not, multisampled or not. A back buffer texture
 * that no longer fits is destroyed with its source, so PIXI makes the right one on the next
 * render and the graphics memory of the old one is given back (at 3110×1870 a back buffer is
 * 46 MB with its depth and stencil, four times that multisampled).
 */
function applyBackBuffer(renderer: WebGLRenderer, use: boolean, antialias: boolean): void {
  const internals = internalsOf(renderer);
  renderer.backBuffer.useBackBuffer = use;
  internals._antialias = antialias;
  const texture = internals._backBufferTexture;
  if (texture && (!use || texture.source.antialias !== antialias)) {
    // Unbound first: PIXI warns of a source destroyed while a shader still holds it.
    internals._bigTriangleShader.resources.uTexture = Texture.WHITE.source;
    texture.destroy(true);
    internals._backBufferTexture = null;
  }
}

/**
 * One owner's hold on the back buffer: on while its lighting is, and given back only by the one
 * that took it, so nothing else turns the back buffer on or off behind its back.
 *
 * WebGL only offers the scene beneath a filter through a back buffer. A renderer created with
 * `useBackBuffer` draws through one all the time (the plugin's, `PixiAppManager`): PIXI then
 * gives the canvas no multisampling and the back buffer takes the renderer's antialiasing, so
 * the hold only makes it plain while lighting is on at a high resolution. Otherwise the canvas
 * keeps its own antialiasing and the hold switches the back buffer on and off.
 */
export class BackBufferHold {
  private held = false;
  /** Whether the renderer draws through the back buffer on its own. */
  private readonly always: boolean;
  /** The renderer's antialiasing, which the back buffer keeps whenever lighting leaves it. */
  private readonly antialias: boolean;

  constructor(private readonly renderer: Renderer) {
    const webgl = renderer.name === 'webgl' ? (renderer as WebGLRenderer) : null;
    this.always = webgl?.backBuffer.useBackBuffer ?? false;
    this.antialias = webgl ? internalsOf(webgl)._antialias : false;
  }

  set(on: boolean): void {
    if (this.renderer.name === 'webgl') {
      const plain = on && this.renderer.resolution >= PLAIN_BACK_BUFFER_RESOLUTION;
      applyBackBuffer(this.renderer as WebGLRenderer, on || this.always, this.antialias && !plain);
    }
    this.held = on;
  }

  release(): void {
    if (this.held) this.set(false);
    this.held = false;
  }
}
