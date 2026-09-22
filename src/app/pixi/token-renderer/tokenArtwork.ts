import { Graphics, Sprite } from 'pixi.js';
import type { TokenGroupContainer } from './types';

/** Keep full, unframed artwork proportional when a token is placed or resized. */
export function syncTokenArtwork(container: TokenGroupContainer, size: number): void {
  const sprite = container.getChildByLabel('tokenSprite');
  if (!(sprite instanceof Sprite)) return;
  const framed = container.tokenData?.showRing !== false;
  const mask = container.getChildByLabel('tokenArtMask');
  if (mask instanceof Graphics) {
    mask.clear().circle(0, 0, size / 2).fill(0xffffff);
    sprite.mask = framed ? mask : null;
    mask.visible = framed;
  }
  const glass = container.getChildByLabel('glassOverlay');
  if (glass) glass.visible = framed;
  const width = sprite.texture.width || 1;
  const height = sprite.texture.height || 1;
  sprite.width = framed ? size : size * width / Math.max(width, height);
  sprite.height = framed ? size : size * height / Math.max(width, height);
}
