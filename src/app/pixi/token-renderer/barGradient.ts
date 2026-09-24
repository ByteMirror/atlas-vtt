import { FillGradient } from 'pixi.js';
import { darkenColor, lightenColor } from '../../styles/designTokens';

/**
 * Metallic bar gradients depend only on the base colour, so one FillGradient
 * (and its backing texture) is shared by every token bar of that colour.
 */
const barGradientCache = new Map<number, FillGradient>();

export function getBarGradient(baseColor: number): FillGradient {
  let gradient = barGradientCache.get(baseColor);
  if (!gradient) {
    gradient = new FillGradient({
      type: 'linear',
      colorStops: [
        { offset: 0, color: lightenColor(baseColor, 0.5) },
        { offset: 0.15, color: lightenColor(baseColor, 0.25) },
        { offset: 0.4, color: baseColor },
        { offset: 0.6, color: darkenColor(baseColor, 0.1) },
        { offset: 0.85, color: darkenColor(baseColor, 0.2) },
        { offset: 1, color: lightenColor(baseColor, 0.15) },
      ],
      start: { x: 0, y: 0 },
      end: { x: 0, y: 1 },
    });
    barGradientCache.set(baseColor, gradient);
  }
  return gradient;
}
