import type { MapBounds } from '../vision/visibility';

/** Distances in the wall field are clamped here; sphere tracing never needs a longer step. */
export const FIELD_MAX = 128;
/** World pixels per texel of the world-space lighting textures on ordinary maps. */
export const BASE_TEXEL = 2;
/** Longest side of a world-space texture; larger maps get coarser texels. */
export const MAX_TEXELS = 4096;
/** Rays traced across a light's flame per tile texel in its penumbra. */
export const TILE_RAYS = 32;
/**
 * Largest radius, in texels, over which a traced tile is smoothed: it melts the steps between
 * ray counts into a ramp. Each texel smooths only within its wall clearance, so less near walls.
 */
export const TILE_SMOOTH = 4;
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
/**
 * Near a wall, sight is read this far beyond the wall's lit band (`wallBand`) on the pixel's own
 * side, in world pixels, so the face of a wall shows wherever the floor in front of it is seen.
 */
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

/**
 * A soft glow around each flame, drawn with the light so it stays inside its walls; an
 * image-space bloom would blur light across walls. `gain` is its peak on top of the falloff
 * (HDR), `size` its Gaussian sigma as a share of the bright radius.
 */
export const HALO = { gain: 0.6, size: 0.18 } as const;

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

/**
 * Within this distance of a wall's centre line a pixel keeps its own light and sight: closer in,
 * the wall field's gradient may point across the line.
 */
export function wallCore(texel: number): number {
  return 1.5 * texel;
}

/**
 * Distance from a wall's centre line at which the light map is fully lit again: past the tiles'
 * contact fade (two texels) and the light map's bilinear footprint (a texel diagonal).
 */
export function wallBand(texel: number): number {
  return wallRadius(texel) + fieldMargin(texel) + (2 + Math.SQRT2) * texel;
}

/**
 * How far from its centre line a wall still changes a tile: smoothing reads a texel's clearance
 * up to `TILE_SMOOTH` texels (the contact fade only two), plus a texel for the bilinear field.
 */
export function tileWallReach(texel: number): number {
  return wallRadius(texel) + fieldMargin(texel) + (TILE_SMOOTH + 1) * texel;
}

/**
 * Wall ends closer than this to another wall are joined by a bridge, for light and sight
 * alike: wider than any gap the field closes by itself (two capsules with their bilinear
 * margin, plus the tile's contact fade), so light and sight always agree on what is closed.
 */
export function sealTolerance(texel: number): number {
  return 2 * (wallRadius(texel) + fieldMargin(texel)) + 2 * texel;
}
