import { useEffect, useRef } from 'react';
import type { CollectionOption } from '../types';

/**
 * Keeps the selection on a real collection. Renaming a collection's folder
 * changes its id but not its uid, so the selection follows it; a deleted
 * collection falls back to the default one.
 */
export function useFollowSelectedCollection(
  collections: readonly CollectionOption[],
  selectedCollection: string | null,
  setSelectedCollection: (collectionId: string) => void,
): void {
  const selectedUid = useRef<string | null>(null);

  useEffect(() => {
    if (selectedCollection === null || collections.length === 0) return;
    const selected = collections.find((collection) => collection.id === selectedCollection);
    if (selected) {
      selectedUid.current = selected.uid;
      return;
    }
    const moved = collections.find((collection) => collection.uid === selectedUid.current);
    setSelectedCollection(moved?.id ?? 'default');
  }, [collections, selectedCollection, setSelectedCollection]);
}
