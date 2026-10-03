import type { TokenEntity } from '../types';

const layerOf = (token: TokenEntity): number => token.layer ?? 0;

/**
 * Puts the tokens on top of every other token of the map, in the order they lie in among
 * themselves: the token put on a square last covers the ones that were there. Tokens that
 * already lie above all others stay as they are. Changes `tokens` in place (a store draft).
 */
export function raiseTokens(tokens: Record<string, TokenEntity>, ids: readonly string[]): void {
  const picked = new Set(ids);
  const raised: TokenEntity[] = [];
  let below = -Infinity;
  for (const token of Object.values(tokens)) {
    if (picked.has(token.id)) raised.push(token);
    else below = Math.max(below, layerOf(token));
  }
  if (raised.every((token) => layerOf(token) > below)) return;

  raised.sort((a, b) => layerOf(a) - layerOf(b));
  raised.forEach((token, index) => {
    token.layer = below + 1 + index;
  });
}
