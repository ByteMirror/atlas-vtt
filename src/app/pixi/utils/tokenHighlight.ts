import { OutlineFilter } from 'pixi-filters';
import { getObsidianAccentColor, cssColorToHexNumber } from './colorUtils';

/**
 * Configuration options for the zoom-to-token functionality
 */
interface ZoomToTokenOptions {
  zoomLevel?: number;
  highlightDuration?: number;
  glowThickness?: number;
}

/**
 * Zooms the viewport to center on a token and applies an animated glow highlight.
 * The highlight uses the Obsidian accent color and pulses for the specified duration.
 * 
 * @param view - The Atlas view instance containing the renderer
 * @param tokenId - The ID of the token to zoom to and highlight
 * @param tokenPosition - The world coordinates of the token { x, y }
 * @param options - Optional configuration for zoom level and highlight duration
 */
export function zoomToTokenWithHighlight(
  view: any,
  tokenId: string,
  tokenPosition: { x: number; y: number },
  options: ZoomToTokenOptions = {}
): void {
  const {
    zoomLevel = 2.5,
    highlightDuration = 3000,
    glowThickness = 4,
  } = options;

  const viewport = view?.renderer?.getViewportInstance?.();
  if (!viewport) {
    console.warn('Viewport not available for zoom-to-token');
    return;
  }

  viewport.setZoom(zoomLevel);
  viewport.moveCenter(tokenPosition.x, tokenPosition.y);

  addTokenHighlight(view, tokenId, { highlightDuration, glowThickness });
}

/**
 * Adds an animated glow highlight to a token sprite.
 * The glow pulses and automatically removes itself after the specified duration.
 * 
 * @param view - The Atlas view instance containing the renderer
 * @param tokenId - The ID of the token to highlight
 * @param options - Configuration for highlight duration and glow thickness
 */
export function addTokenHighlight(
  view: any,
  tokenId: string,
  options: { highlightDuration?: number; glowThickness?: number } = {}
): void {
  const { highlightDuration = 3000, glowThickness = 4 } = options;

  try {
    const tokenRenderer = view?.renderer?.tokenRenderer;
    if (!tokenRenderer) return;

    const tokenSprite = tokenRenderer.tokenSprites[tokenId];
    if (!tokenSprite) return;

    const accentColor = getObsidianAccentColor();
    const hexColor = cssColorToHexNumber(accentColor);
    const glowFilter = new OutlineFilter({ thickness: glowThickness, color: hexColor, quality: 1 });

    if (!tokenSprite.filters) {
      tokenSprite.filters = [];
    }
    tokenSprite.filters = [...tokenSprite.filters, glowFilter];

    let time = 0;
    const animateGlow = (): void => {
      time += 0.05;
      glowFilter.thickness = glowThickness + Math.sin(time) * 2;
      glowFilter.alpha = 0.8 + Math.sin(time) * 0.2;
    };

    const ticker = view?.renderer?.app?.ticker;
    if (ticker) {
      ticker.add(animateGlow);

      window.setTimeout(() => {
        ticker.remove(animateGlow);
        if (tokenSprite.filters) {
          tokenSprite.filters = tokenSprite.filters.filter(
            (f: unknown) => f !== glowFilter
          );
          if (tokenSprite.filters.length === 0) {
            tokenSprite.filters = null;
          }
        }
      }, highlightDuration);
    }
  } catch (e) {
    console.error('Could not add highlight effect:', e);
  }
}
