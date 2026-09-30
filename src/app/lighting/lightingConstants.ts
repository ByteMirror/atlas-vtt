import type { MapBounds } from '../vision/visibility';

/** Distances in the wall field are clamped here; sphere tracing never needs a longer step. */
export const FIELD_MAX = 128;
/** World pixels per texel of the world-space lighting textures on ordinary maps. */
export const BASE_TEXEL = 2;
/** Longest side of a world-space texture; larger maps get coarser texels. */
export const MAX_TEXELS = 4096;
/** Rays traced across a light's flame per tile texel in its penumbra. */
export const TILE_RAYS = 32;
/** A light's glow ends at this multiple of its dim radius. */
export const LIGHT_REACH = 1.12;
/** Tiles cover a little more than the reach, so flicker's radius breathing stays inside them. */
export const TILE_MARGIN = 1.05;
/** Height of the lamp above the floor, as a multiple of its bright radius. */
export const FALLOFF_HEIGHT = 1;
export const EXPOSURE = 0.9;
/** Light colours are mixed this far towards white, so tinted light keeps the map readable. */
export const TINT_TO_WHITE = 0.5;
/** Smallest flame, as a share of the dim radius, so shadow edges never look cut out. */
export const MIN_SOFTNESS = 0.12;
/** How far past a wall's centre line the drawn wall is revealed to players, in world pixels. */
export const REVEAL = 8;
/** Strength of the cool grey shift where light is low. */
export const PURKINJE = 0.55;

export const BOUNCE = {
  probe: 16,
  interval: 16,
  cascades: 4,
  emitTexel: 4,
  spread: 250,
  floorGain: 0.004,
  wallGain: 0.6,
  gain: 1,
  /** While lights move, bounce is rebuilt at most this often. */
  throttleMs: 100,
} as const;

export const BLOOM = { threshold: 0.8, bloomScale: 0.35, brightness: 1, blur: 6, quality: 4 } as const;

/** World pixels per texel for a map: 2 px, coarser on maps longer than 8,192 px. */
export function worldTexel(bounds: MapBounds): number {
  return Math.max(BASE_TEXEL, Math.max(bounds.width, bounds.height) / MAX_TEXELS);
}

/**
 * Walls are capsules this wide around their centre line: at least a texel's diagonal, so a
 * bilinear sample of a world texture never carries light past the centre line.
 */
export function wallRadius(texel: number): number {
  return Math.max(3, texel * Math.SQRT2 + 0.01);
}

/** Bilinear interpolation of a 1-Lipschitz field overestimates it by less than this. */
export function fieldMargin(texel: number): number {
  return texel * 0.75;
}

/** Wall ends closer than this are one joint, for light and sight alike. */
export function weldTolerance(texel: number): number {
  return 2 * wallRadius(texel);
}
