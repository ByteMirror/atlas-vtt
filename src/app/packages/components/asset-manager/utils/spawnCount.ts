/** Largest number of copies a single spawn places. */
export const MAX_SPAWN_COUNT = 99;

/** A digit typed within this window after the previous one extends the number (typing "1", "2" gives 12). */
const TYPING_WINDOW_MS = 1000;

export function clampSpawnCount(count: number): number {
  return Math.min(MAX_SPAWN_COUNT, Math.max(1, Math.round(count)));
}

export interface TypedSpawnCount {
  assetId: string;
  digits: string;
  at: number;
}

/**
 * Folds a typed digit into the spawn count of `assetId`. Digits typed quickly on the same card
 * build a multi-digit number; anything else starts over. Returns null for a leading zero.
 */
export function typeSpawnCountDigit(
  previous: TypedSpawnCount | null,
  assetId: string,
  digit: string,
  now: number,
): (TypedSpawnCount & { count: number }) | null {
  const continues = previous !== null && previous.assetId === assetId && now - previous.at <= TYPING_WINDOW_MS;
  const extended = continues ? previous.digits + digit : digit;
  const digits = Number(extended) <= MAX_SPAWN_COUNT ? extended : digit;
  if (Number(digits) === 0) return null;
  return { assetId, digits, at: now, count: clampSpawnCount(Number(digits)) };
}

/** Quick picks offered by the asset context menu. */
export const SPAWN_MULTIPLE_COUNTS = [2, 3, 4, 5, 6, 8, 10] as const;
