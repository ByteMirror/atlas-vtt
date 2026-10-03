import type { ResourceValue } from '../../../resources/resourceTypes';

/** A whole maximum from two up to this many points is divided into one segment per point. */
export const MAX_WHEEL_SEGMENTS = 8;
const TOP = -Math.PI / 2;
const TURN = Math.PI * 2;

/** How a wheel shows a value, in radians clockwise from the top. */
export interface WheelGauge {
  /** Filled share of the ring, 0 to 1. */
  share: number;
  /** Where the fill ends. */
  end: number;
  /** Where the ring is divided, one tick per segment boundary; none for a ring that is not divided. */
  ticks: number[];
}

/**
 * The gauge of a wheel showing `value`, or null without a maximum. `current` counts in the
 * resource's own direction, so the filled share is `current / max` for draining and filling alike.
 */
export function wheelGauge({ current, max }: ResourceValue): WheelGauge | null {
  if (!(max > 0)) return null;
  const share = Math.max(0, Math.min(1, current / max));
  const segmented = Number.isInteger(max) && max > 1 && max <= MAX_WHEEL_SEGMENTS;
  return {
    share,
    end: TOP + TURN * share,
    ticks: segmented ? Array.from({ length: max }, (_, i) => TOP + (TURN / max) * i) : [],
  };
}

/** The top of the ring, where its fill starts. */
export const WHEEL_START = TOP;
