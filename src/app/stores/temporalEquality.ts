export interface TemporalSnapshotLike {
  objects: unknown;
  grid: unknown;
  background: unknown;
  widgetValues: unknown;
}

/**
 * Hot-path equality for zundo tracked state.
 *
 * We intentionally use reference checks for tracked branches because Immer
 * preserves object identity when fields are unchanged.
 */
export function areTemporalSnapshotsEqual(
  past: TemporalSnapshotLike,
  current: TemporalSnapshotLike,
): boolean {
  return (
    past.objects === current.objects &&
    past.grid === current.grid &&
    past.background === current.background &&
    past.widgetValues === current.widgetValues
  );
}
