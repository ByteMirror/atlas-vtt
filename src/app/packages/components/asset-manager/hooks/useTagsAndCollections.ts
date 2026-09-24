import type * as React from 'react';
import { useState, useCallback } from 'react';
import type { AnyAsset, Tag } from '../types';
import type { AssetService } from '../../../../services/AssetService';
import { hasAssetTag, type TagGroup } from '../../../../services/tagGroups';
import { showAtlasToast } from '../../../../react/components/AtlasToast';
import { tagGroupOfTab, type TagsByGroup } from '../utils/assetTags';

export interface TagsAndCollectionsState {
  // Tag manager modal
  isTagManagerOpen: boolean;
  setIsTagManagerOpen: (open: boolean) => void;
  // Tag CRUD within one tag group of the selected collection
  handleCreateTag: (group: TagGroup, tag: string) => Promise<Tag | null>;
  handleUpdateTag: (group: TagGroup, tagId: string, name: string) => Promise<void>;
  handleDeleteTag: (group: TagGroup, tagId: string) => Promise<void>;
  /** Replaces an asset's tags: shown at once, restored if saving fails. */
  setAssetTags: (asset: AnyAsset, tags: string[]) => Promise<void>;
  // Collection CRUD
  handleUpdateCollection: (collectionId: string, name: string) => Promise<void>;
  handleDeleteCollection: (collectionId: string) => Promise<void>;
}

export function useTagsAndCollections(
  assetService: AssetService | null,
  selectedCollection: string | null,
  tagsByGroup: TagsByGroup,
  setAssets: React.Dispatch<React.SetStateAction<AnyAsset[]>>,
  reloadCollections: () => Promise<void>,
  reloadGlobalTags: () => Promise<void>
): TagsAndCollectionsState {
  const [isTagManagerOpen, setIsTagManagerOpen] = useState(false);
  const collection = selectedCollection || 'default';

  /** Rewrites the tags of the loaded assets that belong to `group`. */
  const retagAssets = useCallback((group: TagGroup, retag: (tags: string[]) => string[]): void => {
    setAssets(prev => prev.map(asset =>
      tagGroupOfTab(asset.type) === group ? { ...asset, tags: retag(asset.tags ?? []) } : asset));
  }, [setAssets]);

  const handleCreateTag = useCallback(async (group: TagGroup, tag: string): Promise<Tag | null> => {
    if (!assetService) return null;
    try {
      const { id, name } = await assetService.createTag(collection, group, tag);
      await reloadGlobalTags();
      return { id, name };
    } catch (error) {
      console.error('[AssetManager] Failed to create tag:', error);
      showAtlasToast('Could not create the tag');
      return null;
    }
  }, [assetService, collection, reloadGlobalTags]);

  const handleUpdateTag = useCallback(async (group: TagGroup, tagId: string, name: string): Promise<void> => {
    if (!assetService) return;
    const previous = tagsByGroup[group].find(t => t.id === tagId);
    try {
      const renamed = await assetService.renameTag(collection, group, tagId, name);
      retagAssets(group, tags => tags.map(value =>
        value === tagId ? renamed.id : value === previous?.name ? renamed.name : value));
      await reloadGlobalTags();
    } catch (error) {
      console.error('[AssetManager] Failed to rename tag:', error);
      showAtlasToast('Could not rename the tag');
    }
  }, [assetService, collection, tagsByGroup, retagAssets, reloadGlobalTags]);

  const handleDeleteTag = useCallback(async (group: TagGroup, tagId: string): Promise<void> => {
    if (!assetService) return;
    const tag = tagsByGroup[group].find(t => t.id === tagId) ?? { id: tagId, name: tagId };
    try {
      await assetService.deleteTag(collection, group, tagId);
      retagAssets(group, tags => tags.filter(value => !hasAssetTag([value], tag)));
      await reloadGlobalTags();
    } catch (error) {
      console.error('[AssetManager] Failed to delete tag:', error);
      showAtlasToast('Could not delete the tag');
    }
  }, [assetService, collection, tagsByGroup, retagAssets, reloadGlobalTags]);

  const setAssetTags = useCallback(async (asset: AnyAsset, tags: string[]): Promise<void> => {
    if (!assetService) return;
    setAssets(prev => prev.map(a => a.id === asset.id ? { ...a, tags } : a));
    try {
      await assetService.updateAssetTags(asset.id, tags);
    } catch (error) {
      console.error('[AssetManager] Failed to update asset tags:', error);
      // Restore the previous tags unless a later edit replaced these meanwhile.
      setAssets(prev => prev.map(a => a.id === asset.id && a.tags === tags ? { ...a, tags: asset.tags ?? [] } : a));
      showAtlasToast('Could not save the tags');
    }
  }, [assetService, setAssets]);

  const handleUpdateCollection = useCallback(async (collectionId: string, name: string): Promise<void> => {
    if (!assetService) return;
    try {
      await assetService.renameCollection(collectionId, name);
      await reloadCollections();
    } catch (error) {
      console.error('[AssetManager] Failed to rename collection:', error);
      showAtlasToast('Could not rename the collection');
    }
  }, [assetService, reloadCollections]);

  const handleDeleteCollection = useCallback(async (collectionId: string): Promise<void> => {
    if (!assetService) return;
    try {
      if (collectionId === 'default') {
        showAtlasToast('The default collection cannot be deleted');
        return;
      }
      await assetService.deleteCollection(collectionId);
      await reloadCollections();
    } catch (error) {
      console.error('[AssetManager] Failed to delete collection:', error);
      showAtlasToast('Could not delete the collection');
    }
  }, [assetService, reloadCollections]);

  return {
    isTagManagerOpen, setIsTagManagerOpen,
    handleCreateTag, handleUpdateTag, handleDeleteTag, setAssetTags,
    handleUpdateCollection, handleDeleteCollection,
  };
}
