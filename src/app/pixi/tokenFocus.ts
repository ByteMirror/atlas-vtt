import type { ClampZoom, Viewport } from 'pixi-viewport';
import type { TokenEntity } from '../types';
import { computeTokenPixelSize } from './token-renderer/tokenSizing';

/** Focus at a readable CSS-pixel diameter, leaving context in small panes. */
export function focusToken(viewport: Viewport, token: Pick<TokenEntity, 'x' | 'y' | 'size'>, gridSize: number): void {
  const diameter = computeTokenPixelSize(gridSize, token.size || 1);
  const screenDiameter = Math.min(160, viewport.screenWidth / 3, viewport.screenHeight / 3);
  const scale = screenDiameter / diameter;
  if (!Number.isFinite(diameter) || diameter <= 0 || !Number.isFinite(scale) || scale <= 0) return;

  // The default absolute limits cannot accommodate every map resolution.
  // Expand them to include this focus so animation and later wheel input agree.
  const clamp = viewport.plugins.get<ClampZoom>('clamp-zoom');
  if (clamp) {
    if (typeof clamp.options.minScale === 'number') {
      clamp.options.minScale = Math.min(clamp.options.minScale, scale);
    }
    if (typeof clamp.options.maxScale === 'number') {
      clamp.options.maxScale = Math.max(clamp.options.maxScale, scale);
    }
  }

  viewport.animate({
    position: { x: token.x, y: token.y },
    scale,
    time: 400,
    ease: 'easeInOutCubic',
  });
}
