import { Color } from 'pixi.js';
import type { TokenEntity } from '../../types';
import type { LightEmission, LightSource } from '../../types/lightingTypes';
import { gameUnitsToWorld, type UnitScale } from '../../lighting/lightingUnits';
import { MIN_SOFTNESS, TINT_TO_WHITE } from '../../lighting/lightingConstants';
import { srgbToLinear } from '../../lighting/srgb';
import type { EngineLight } from './engine/types';

/** A light that shines right now: placed on the map or carried by a token. */
export interface ActiveLight {
  /** `light:<id>` or `token:<id>`, stable while the light exists. */
  key: string;
  x: number;
  y: number;
  emission: LightEmission;
}

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

/** A light in world pixels for the engine; its colour mixed towards white and linearised. */
export function engineLight(light: ActiveLight, scale: UnitScale): EngineLight {
  const { emission } = light;
  const bright = gameUnitsToWorld(Math.max(0, emission.bright), scale);
  const dim = Math.max(bright, gameUnitsToWorld(Math.max(0, emission.dim), scale));
  return {
    key: light.key,
    x: light.x,
    y: light.y,
    bright,
    dim,
    // Every light casts soft edges, however small its flame is set: at least a share of its reach.
    flame: Math.max(gameUnitsToWorld(emission.sourceRadius ?? 1, scale), dim * MIN_SOFTNESS),
    color: tintedLinear(emission.color),
    intensity: emission.intensity,
    animation: emission.animation,
  };
}

function tintedLinear(hex: string): [number, number, number] {
  const c = new Color(hex);
  const linear = (v: number): number => srgbToLinear(1 + (v - 1) * TINT_TO_WHITE);
  return [linear(c.red), linear(c.green), linear(c.blue)];
}
