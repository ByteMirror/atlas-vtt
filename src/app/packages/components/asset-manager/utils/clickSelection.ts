import type { SelectionEvent } from '../types';

export interface ClickSelectionInput {
  selected: string[];
  /** IDs in the order they are displayed; Shift spans across this order. */
  orderedIds: string[];
  id: string;
  /** Item the last non-Shift click landed on. */
  anchorId: string | null;
  event?: SelectionEvent | undefined;
  /** Force toggle semantics (checkbox click). */
  toggle?: boolean;
}

export interface ClickSelectionResult {
  selected: string[];
  anchorId: string;
}

/**
 * Standard file-manager click semantics: a plain click selects only the item,
 * Ctrl/Cmd (or the checkbox) toggles it, Shift adds the span from the anchor.
 */
export function applyClickSelection({
  selected,
  orderedIds,
  id,
  anchorId,
  event,
  toggle = false,
}: ClickSelectionInput): ClickSelectionResult {
  if (event?.shiftKey && anchorId) {
    const anchorIdx = orderedIds.indexOf(anchorId);
    const targetIdx = orderedIds.indexOf(id);
    if (anchorIdx !== -1 && targetIdx !== -1) {
      const first = Math.min(anchorIdx, targetIdx);
      const last = Math.max(anchorIdx, targetIdx);
      const span = orderedIds.slice(first, last + 1);
      return { selected: [...new Set([...selected, ...span])], anchorId };
    }
  }

  if (toggle || event?.ctrlKey || event?.metaKey) {
    const next = selected.includes(id) ? selected.filter((selectedId) => selectedId !== id) : [...selected, id];
    return { selected: next, anchorId: id };
  }

  return { selected: [id], anchorId: id };
}

export interface SelectAllInput {
  visible: { assets: string[]; folders: string[] };
  selectedAssetIds: string[];
  selectedFolderIds: string[];
}

export interface SelectAllResult {
  assets: string[];
  folders: string[];
}

/**
 * Select-all stays within one list: folders when a folder is selected,
 * otherwise assets (folders only when the view holds no assets).
 * Pressing it again with the whole list selected clears the selection.
 */
export function resolveSelectAll({ visible, selectedAssetIds, selectedFolderIds }: SelectAllInput): SelectAllResult {
  const scopeIsFolders = selectedFolderIds.length > 0 || (selectedAssetIds.length === 0 && visible.assets.length === 0);

  if (scopeIsFolders) {
    const allSelected = visible.folders.every((id) => selectedFolderIds.includes(id));
    return { assets: [], folders: allSelected ? [] : visible.folders };
  }

  const allSelected = visible.assets.every((id) => selectedAssetIds.includes(id));
  return { assets: allSelected ? [] : visible.assets, folders: [] };
}
