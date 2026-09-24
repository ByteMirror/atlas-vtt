import { hasAssetTag } from '../../../../services/tagGroups';
import type { AnyAsset, Folder, Tab, Tag } from '../types';

export interface AssetFilter {
  tab: Tab;
  /** The open folder; null at the tab's root. */
  folderId: string | null;
  /** Text the asset's name must contain. */
  search: string;
  /** Tags an asset must all carry. */
  tags: readonly Pick<Tag, 'id' | 'name'>[];
}

/**
 * The assets the content area shows. Unfiltered, those directly in the open
 * folder. While a search or tag filters, those anywhere below it, so a filter
 * finds assets whatever folder they sit in; at the root that is every asset of the tab.
 */
export function filterAssets(assets: readonly AnyAsset[], folders: readonly Folder[], filter: AssetFilter): AnyAsset[] {
  const searchLower = filter.search.toLowerCase();
  const inScope = folderScope(folders, filter);
  return assets.filter((asset) =>
    asset.type === filter.tab
    && inScope(asset.folderId)
    && (!searchLower || asset.name.toLowerCase().includes(searchLower))
    && filter.tags.every((tag) => hasAssetTag(asset.tags, tag)),
  );
}

/** The subfolders the content area shows: none while filtering, since their matching assets are listed directly. */
export function filterFolders(folders: readonly Folder[], filter: AssetFilter): Folder[] {
  if (isFiltering(filter)) return [];
  return folders.filter((folder) => folder.type === filter.tab && folder.parentId === filter.folderId);
}

function folderScope(folders: readonly Folder[], filter: AssetFilter): (folderId: string | null | undefined) => boolean {
  if (!isFiltering(filter)) return (folderId) => folderId === filter.folderId;
  if (filter.folderId === null) return () => true;
  const subtree = folderSubtree(folders, filter.folderId);
  return (folderId) => folderId != null && subtree.has(folderId);
}

function isFiltering(filter: AssetFilter): boolean {
  return filter.search !== '' || filter.tags.length > 0;
}

/** `rootId` and the ids of every folder below it. */
function folderSubtree(folders: readonly Folder[], rootId: string): Set<string> {
  const subtree = new Set([rootId]);
  const pending = [rootId];
  for (let parentId = pending.pop(); parentId !== undefined; parentId = pending.pop()) {
    for (const folder of folders) {
      if (folder.parentId === parentId && !subtree.has(folder.id)) {
        subtree.add(folder.id);
        pending.push(folder.id);
      }
    }
  }
  return subtree;
}
