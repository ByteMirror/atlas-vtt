/**
 * Build-level feature switches.
 *
 * Atlas VTT ships offline-only for its first release. The features below are
 * implemented but not shipped: their code is left in place and gated here, so
 * re-enabling one is a single edit rather than a revert.
 *
 * These are deliberately constants rather than persisted settings — a shipped
 * build must not expose a switch that turns on a feature the release does not support.
 */

/** Ambient sound tool in the map toolbar. */
export const AMBIENT_AUDIO_ENABLED = false;

/** Walls & dynamic lighting: wall tool, light sources, token vision, collection vision settings. */
export const WALLS_AND_LIGHTING_ENABLED = false;
