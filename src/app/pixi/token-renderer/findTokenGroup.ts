import type { Container } from 'pixi.js';
import type { TokenGroupContainer } from './types';

function isTokenGroup(container: Container): container is TokenGroupContainer {
  return 'tokenId' in container;
}

/** Looks up a token's root container in the viewport's token layer. */
export function findTokenGroup(viewport: Container, tokenId: string): TokenGroupContainer | null {
  for (const layer of viewport.children) {
    if (layer.label !== 'tokenContainer') continue;
    for (const child of layer.children) {
      if (isTokenGroup(child) && child.tokenId === tokenId) {
        return child;
      }
    }
  }
  return null;
}
