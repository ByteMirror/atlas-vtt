import type { Container } from 'pixi.js';

export interface DestroyTreeOptions {
  /** Also destroy textures of sprites in the tree. Off by default: most textures come from shared caches. */
  textures?: boolean;
}

/**
 * Destroys `node` and all of its descendants, including the geometry of every Graphics.
 *
 * PIXI 8 only frees a Graphics' context when `destroy()` is called without options or
 * with `context: true`. Any other options object (such as `{ children: true }`) leaves
 * the geometry registered with the renderer until the whole Application is destroyed,
 * so every rebuilt grid, token or pin would leak its vertices.
 */
export function destroyTree(node: Container, { textures = false }: DestroyTreeOptions = {}): void {
  if (node.destroyed) return;
  node.destroy({ children: true, context: true, texture: textures });
}
