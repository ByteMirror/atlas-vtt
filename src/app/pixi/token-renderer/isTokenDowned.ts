import type { TokenEntity } from '../../types';
import type { ResourceDefinition } from '../../resources/resourceTypes';
import { isDefeated } from '../../resources/resourceValues';

/** Whether a creature token has a resource that defeats it when spent, and it is spent. */
export function isTokenDowned(token: TokenEntity, definitions: readonly ResourceDefinition[]): boolean {
  return token.kind === 'character' && isDefeated(token, definitions);
}
