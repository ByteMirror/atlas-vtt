import type { TokenEntity } from '../types';

/** Find the lowest unused instance number for tokens sharing the same imagePath. */
export function computeNextInstanceNumber(
  tokens: Record<string, TokenEntity>,
  imagePath: string,
): number {
  const usedNumbers = new Set(
    Object.values(tokens)
      .filter((t) => t.imagePath === imagePath)
      .map((t) => t.instanceNumber)
      .filter((n): n is number => n != null)
  );
  let num = 1;
  while (usedNumbers.has(num)) num++;
  return num;
}
