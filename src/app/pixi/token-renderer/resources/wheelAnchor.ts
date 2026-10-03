import { getTokenRingCenterRadius } from '../tokenRingMetrics';
import { computeTokenStrokeWidth, RESIZE_HANDLE_SIZE, tokenUIScale } from '../tokenSizing';

/**
 * Where a token's right wheels hang from, in world units from the token's centre: just past
 * the resize button (which sits on the ring and scales with the token, not with the UI), on
 * the token's bottom edge. The left wheels hang from its mirror, `-x`. The wheels and their
 * controls both use it, so they cannot drift apart.
 */
export function wheelAnchor(spriteSize: number, gridSize: number, ringScale: number): { x: number; y: number } {
  const ringRadius = getTokenRingCenterRadius(spriteSize * ringScale, computeTokenStrokeWidth(gridSize), ringScale);
  return { x: ringRadius + (RESIZE_HANDLE_SIZE / 2) * tokenUIScale(spriteSize), y: spriteSize / 2 };
}
