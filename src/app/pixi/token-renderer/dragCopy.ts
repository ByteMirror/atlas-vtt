import type { StoreApi } from 'zustand';
import type { ViewAtlasState } from '../../storeFactory';
import { collectMapObjects } from '../../clipboard/mapObjectContent';

type Positions = Record<string, { x: number; y: number }>;

/**
 * Alt/Option-drag: copies the dragged tokens where they stand, so the drag carries the copies
 * away and the originals stay put. Call it inside the drag's history transaction, which makes
 * the copy and the move one undo step. Returns the copies' ids with their start positions,
 * or null when nothing could be copied.
 */
export function copyTokensForDrag(
  store: Pick<StoreApi<ViewAtlasState>, 'getState'>,
  dragIds: readonly string[],
  initialPositions: Positions,
): { ids: string[]; initialPositions: Positions } | null {
  const state = store.getState();
  const tokenIds = dragIds.filter((id) => state.objects.tokens[id] && initialPositions[id]);
  if (tokenIds.length === 0) return null;

  // Tokens are inserted in the order they were collected, so copies line up with tokenIds.
  const ids = state.insertMapObjects(collectMapObjects(state.objects, tokenIds));
  const positions: Positions = {};
  ids.forEach((id, index) => {
    positions[id] = initialPositions[tokenIds[index]!]!;
  });
  return { ids, initialPositions: positions };
}
