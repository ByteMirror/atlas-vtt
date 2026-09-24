import type { BaseToken } from '../../types';

/**
 * A nameplate shows when the map shows every nameplate or the token opts in
 * on its own. `showNameplate` is the token's saved preference and only the
 * user changes it, so it survives reloads, statblock links and collection
 * export/import.
 */
export function isNameplateVisible(token: Pick<BaseToken, 'showNameplate'>, mapShowsNameplates: boolean): boolean {
  return mapShowsNameplates || token.showNameplate === true;
}
