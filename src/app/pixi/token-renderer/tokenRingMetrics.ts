/**
 * Shared token ring geometry.
 *
 * `tokenSize` is the token sprite diameter (content area). The ring should sit just
 * outside that by the grid stroke inset on both sides so 1x tokens hug one full cell.
 */

export function getTokenRingOuterDiameter(
  tokenSize: number,
  strokeWidth: number = 4,
  ringScale: number = 1,
): number {
  const safeTokenSize = Number.isFinite(tokenSize) && tokenSize > 0 ? tokenSize : 70;
  const safeStrokeWidth = Number.isFinite(strokeWidth) && strokeWidth > 0 ? strokeWidth : 4;
  const safeScale = Number.isFinite(ringScale) && ringScale > 0 ? ringScale : 1;

  return safeTokenSize + safeStrokeWidth * 2 * safeScale;
}

export function getTokenRingCenterRadius(
  tokenSize: number,
  strokeWidth: number = 4,
  ringScale: number = 1,
): number {
  const safeTokenSize = Number.isFinite(tokenSize) && tokenSize > 0 ? tokenSize : 70;
  const outerDiameter = getTokenRingOuterDiameter(safeTokenSize, strokeWidth, ringScale);
  // Center of the visible ring band.
  return (outerDiameter + safeTokenSize) / 4;
}
