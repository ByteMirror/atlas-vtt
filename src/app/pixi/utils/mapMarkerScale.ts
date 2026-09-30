/** Below this zoom, markers grow on screen instead of keeping their size. */
const BOOST_ZOOM = 0.2;

/**
 * World scale of a map marker (note pins, light icons) at viewport `zoom`, for a readable size on screen:
 * - at zoom 0.2 and above, 1/zoom: a constant screen size, never below 0.15 so markers do not
 *   vanish when zoomed far in;
 * - below it, super-linear, so markers stay prominent on big maps zoomed far out.
 */
export function mapMarkerScale(zoom: number): number {
  const inverse = 1 / zoom;
  if (zoom >= BOOST_ZOOM) return Math.max(0.15, inverse);
  const boostInverse = 1 / BOOST_ZOOM;
  return boostInverse * Math.pow(inverse / boostInverse, 1.21);
}
