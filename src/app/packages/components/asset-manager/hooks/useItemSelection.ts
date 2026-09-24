import { useCallback, useState } from 'react';

export interface ItemSelection {
  selectedIds: ReadonlySet<string>;
  /** Toggles `id`; with `range`, adds (or removes) every id between the last selected one and `id`. */
  select: (id: string, range: boolean) => void;
  /** Selects every id, or clears the selection when all of them are selected. */
  toggleAll: () => void;
  replace: (ids: Iterable<string>) => void;
  clear: () => void;
}

/** Multi-selection over an ordered list of ids: click toggles, Shift+click selects a range. */
export function useItemSelection(orderedIds: readonly string[]): ItemSelection {
  const [selectedIds, setSelectedIds] = useState<ReadonlySet<string>>(new Set());

  const select = useCallback((id: string, range: boolean): void => {
    setSelectedIds((previous) => {
      const next = new Set(previous);
      const anchorIndex = orderedIds.indexOf(Array.from(previous).pop() ?? '');
      const index = orderedIds.indexOf(id);
      if (range && anchorIndex !== -1 && index !== -1) {
        const rangeIds = orderedIds.slice(Math.min(anchorIndex, index), Math.max(anchorIndex, index) + 1);
        const removing = previous.has(id);
        for (const rangeId of rangeIds) {
          if (removing) next.delete(rangeId);
          else next.add(rangeId);
        }
        return next;
      }
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }, [orderedIds]);

  const toggleAll = useCallback((): void => {
    setSelectedIds((previous) => (previous.size === orderedIds.length ? new Set() : new Set(orderedIds)));
  }, [orderedIds]);

  const replace = useCallback((ids: Iterable<string>): void => setSelectedIds(new Set(ids)), []);
  const clear = useCallback((): void => setSelectedIds(new Set()), []);

  return { selectedIds, select, toggleAll, replace, clear };
}
