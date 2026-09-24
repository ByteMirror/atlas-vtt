import type { TokenEntity } from '../../types';

/** Whether a creature token tracks hit points and they are at 0 or below. */
export function isTokenDowned(token: TokenEntity): boolean {
  if (token.kind !== 'character') return false;
  const { hp } = token;
  if (typeof hp === 'number') return hp <= 0;
  // Statblocks without hit points import as 0/0, which is no HP rather than a dead creature
  return typeof hp === 'object' && hp.max > 0 && hp.current <= 0;
}
