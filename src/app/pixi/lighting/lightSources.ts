import { Color } from 'pixi.js';
import type { TokenEntity } from '../../types';
import type { LightEmission, LightSource } from '../../types/lightingTypes';
import { gameUnitsToWorld, type UnitScale } from '../../lighting/lightingUnits';
import { MIN_SOFTNESS as ENGINE_MIN_SOFTNESS, TINT_TO_WHITE } from '../../lighting/lightingConstants';
import type { FlickerSample } from './lightFlicker';
import type { EngineLight } from './engine/types';
import type { LightFrame } from './lightShaders';

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

/** Smallest flame, as a share of the dim radius, so shadow edges never look cut out. */
export const MIN_SOFTNESS = 0.12;

export function lightFrame(light: ActiveLight, scale: UnitScale, flicker: FlickerSample = { intensity: 1, radiusScale: 1 }): LightFrame {
  const { emission } = light;
  const bright = gameUnitsToWorld(Math.max(0, emission.bright), scale) * flicker.radiusScale;
  const dim = Math.max(bright, gameUnitsToWorld(Math.max(0, emission.dim), scale) * flicker.radiusScale);
  const color = new Color(emission.color);
  return {
    x: light.x,
    y: light.y,
    bright,
    dim,
    // Every light casts soft edges, however small its flame is set: at least a share of its reach.
    sourceRadius: Math.max(gameUnitsToWorld(emission.sourceRadius ?? 1, scale), dim * MIN_SOFTNESS),
    color: [color.red, color.green, color.blue],
    intensity: emission.intensity * flicker.intensity,
  };
}

/** How far bounced light reaches, relative to the light's dim radius. */
export const BOUNCE_REACH = 1.4;

/**
 * Light that bounced off floors and walls, drawn as a faint, very large area light at the
 * same point: its shadows wrap softly around door frames and pillars, but long walls still
 * hide it, so beams through doorways fade out instead of cutting to black.
 */
/**
 * The frame with its flame kept clear of the nearest wall (`clearance` away): a flame
 * crossing a wall would shine behind it. One size for all of a light's walls, so the
 * shadows of walls meeting at a joint add up without a gap.
 */
export function clampFlame(frame: LightFrame, clearance: number): LightFrame {
  const limit = clearance * 0.9;
  return frame.sourceRadius <= limit ? frame : { ...frame, sourceRadius: Math.max(0.5, limit) };
}

export function bounceFrame(frame: LightFrame): LightFrame {
  const sourceRadius = Math.max(frame.sourceRadius, frame.dim * 0.3);
  return { ...frame, bright: 0, dim: frame.dim * BOUNCE_REACH, sourceRadius, intensity: frame.intensity * 0.3 };
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
    flame: Math.max(gameUnitsToWorld(emission.sourceRadius ?? 1, scale), dim * ENGINE_MIN_SOFTNESS),
    color: tintedLinear(emission.color),
    intensity: emission.intensity,
    animation: emission.animation,
  };
}

function tintedLinear(hex: string): [number, number, number] {
  const c = new Color(hex);
  const linear = (v: number): number => {
    const s = 1 + (v - 1) * TINT_TO_WHITE;
    return s <= 0.04045 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
  };
  return [linear(c.red), linear(c.green), linear(c.blue)];
}
