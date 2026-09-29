import type { Renderer } from 'pixi.js';

/**
 * True when PIXI draws with Canvas 2D because WebGL is not available (GPU blocklisted or
 * hardware acceleration off). That renderer has no meshes or shaders and skips filters.
 */
export function usesCanvasRenderer(renderer: Renderer): boolean {
  return renderer.name === 'canvas';
}
