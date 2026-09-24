import type { ContextMenuEntry } from '../../../../react/components/context-menu/AtlasContextMenu';
import type { SortOption, SortOrder } from '../types';
import { SORT_LABELS } from '../utils/assetSort';

export interface ContentContextMenuDeps {
  sortBy: SortOption;
  sortOptions: readonly SortOption[];
  setSortBy: (sort: SortOption) => void;
  sortOrder: SortOrder;
  setSortOrder: (order: SortOrder) => void;
  handleCreateFolder: () => void;
  handleRefresh: () => unknown;
}

export function buildContentContextMenuEntries(
  deps: ContentContextMenuDeps
): ContextMenuEntry[] {
  const entries: ContextMenuEntry[] = [];

  entries.push({
    type: 'item',
    label: 'New Folder',
    icon: 'folder-plus',
    onClick: deps.handleCreateFolder,
  });

  entries.push({ type: 'separator' });

  entries.push({
    type: 'submenu',
    label: 'Sort by',
    icon: 'arrow-up-down',
    children: [
      ...deps.sortOptions.map((option): ContextMenuEntry => ({
        type: 'item', label: SORT_LABELS[option], checked: deps.sortBy === option, onClick: () => deps.setSortBy(option),
      })),
      { type: 'separator' },
      {
        type: 'item',
        label: deps.sortOrder === 'asc' ? 'Ascending' : 'Descending',
        icon: deps.sortOrder === 'asc' ? 'arrow-up' : 'arrow-down',
        onClick: () => deps.setSortOrder(deps.sortOrder === 'asc' ? 'desc' : 'asc'),
      },
    ],
  });

  entries.push({ type: 'separator' });

  entries.push({
    type: 'item',
    label: 'Refresh',
    icon: 'refresh-cw',
    onClick: deps.handleRefresh,
  });

  return entries;
}
