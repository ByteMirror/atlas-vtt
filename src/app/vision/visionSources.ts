import type { TokenEntity } from '../types';
import type { LightSource, VisionSettings } from '../types/wallTypes';
import type { VisionSource } from '../types/visionTypes';

/**
 * Collect all vision sources from tokens and lights.
 * Only tokens explicitly marked with `hasVision` generate vision.
 *
 * Vision settings (defaultInnerRadius, defaultOuterRadius) and per-token
 * overrides are in game units (feet/meters). They're converted to world
 * pixels using gridSize and unitDistance.
 *
 * Light source radii are already stored in world pixels (converted at
 * placement time and in the config panel), so no conversion needed for lights.
 */
export function collectVisionSources(
  tokens: Record<string, TokenEntity>,
  lights: Record<string, LightSource>,
  visionSettings: VisionSettings | undefined,
  gridSize: number = 70,
  unitDistance: number = 5,
): VisionSource[] {
  const sources: VisionSource[] = [];

  if (!visionSettings?.enabled) return sources;

  /** Convert game units to world pixels. */
  const toPixels = (units: number): number => (units / unitDistance) * gridSize;

  // Only tokens with hasVision flag generate vision sources
  for (const token of Object.values(tokens)) {
    if (!token.hasVision) continue;

    // Token overrides and collection defaults are in game units → convert to pixels
    const innerUnits = token.visionInnerRadius ?? visionSettings.defaultInnerRadius;
    const outerUnits = token.visionOuterRadius ?? visionSettings.defaultOuterRadius ?? innerUnits;
    const innerRadius = toPixels(innerUnits);
    const outerRadius = toPixels(outerUnits);

    if (innerRadius <= 0) continue;

    sources.push({
      id: token.id,
      x: token.x,
      y: token.y,
      innerRadius,
      outerRadius: Math.max(innerRadius, outerRadius),
    });
  }

  // Light sources
  for (const light of Object.values(lights)) {
    const outerRadius = light.outerRadius ?? light.innerRadius;
    if (light.innerRadius <= 0) continue;

    sources.push({
      id: light.id,
      x: light.x,
      y: light.y,
      innerRadius: light.innerRadius,
      outerRadius: Math.max(light.innerRadius, outerRadius),
    });
  }

  return sources;
}
