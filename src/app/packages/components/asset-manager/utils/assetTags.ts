import type { Tag } from '../types';

/** Creators store tag names; older asset-manager assignments can store IDs. */
export function hasAssetTag(assignedTags: readonly string[] | undefined, tag: Tag): boolean {
  return assignedTags?.some((value) => value === tag.id || value === tag.name) ?? false;
}
