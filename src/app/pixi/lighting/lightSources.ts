import { Color } from 'pixi.js';
import type { TokenEntity } from '../../types';
import type { LightEmission, LightSource } from '../../types/lightingTypes';
import { gameUnitsToWorld, type UnitScale } from '../../lighting/lightingUnits';
import type { FlickerSample } from './lightFlicker';
import type { LightFrame } from './lightShaders';

/** A light that shines right now: placed on the map or carried by a token. */
export interface ActiveLight {
  /** `light:<id>` or `token:<id>`, stable while the light exists. */
  key: string;
  x: number;
  y: number;
  emission: LightEmission;
}

const NO_FLICKER: FlickerSample = { intensity: 1, radiusScale: 1, jitterX: 0, jitterY: 0 };

export function activeLights(lights: Record<string, LightSource>, tokens: Record<string, TokenEntity>): ActiveLight[] {
  const active: ActiveLight[] = [];
  for (const light of Object.values(lights)) {
    if (!light.hidden) active.push({ key: `light:${light.id}`, x: light.x, y: light.y, emission: light.emission });
  }
  for (const token of Object.values(tokens)) {
    if (token.light) active.push({ key: `token:${token.id}`, x: token.x, y: token.y, emission: token.light });
  }
  return active;
}

export function lightFrame(light: ActiveLight, scale: UnitScale, flicker: FlickerSample = NO_FLICKER): LightFrame {
  const { emission } = light;
  const bright = gameUnitsToWorld(Math.max(0, emission.bright), scale) * flicker.radiusScale;
  const dim = Math.max(bright, gameUnitsToWorld(Math.max(0, emission.dim), scale) * flicker.radiusScale);
  const color = new Color(emission.color);
  return {
    x: light.x + flicker.jitterX,
    y: light.y + flicker.jitterY,
    bright,
    dim,
    sourceRadius: gameUnitsToWorld(emission.sourceRadius ?? 1, scale),
    color: [color.red, color.green, color.blue],
    intensity: emission.intensity * flicker.intensity,
  };
}
