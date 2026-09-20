import type { ContextMenuEntry } from '../../../../react/components/context-menu/AtlasContextMenu';
import type { SortOption, SortOrder } from '../types';

export interface ContentContextMenuDeps {
  sortBy: SortOption;
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
      { type: 'item', label: 'Name', checked: deps.sortBy === 'name', onClick: () => deps.setSortBy('name') },
      { type: 'item', label: 'Date Modified', checked: deps.sortBy === 'date', onClick: () => deps.setSortBy('date') },
      { type: 'item', label: 'Type', checked: deps.sortBy === 'type', onClick: () => deps.setSortBy('type') },
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
