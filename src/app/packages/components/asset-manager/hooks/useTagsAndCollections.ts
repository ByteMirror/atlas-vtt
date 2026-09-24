import type * as React from 'react';
import { useState, useCallback } from 'react';
import type { AnyAsset, Tag } from '../types';
import type { AssetService } from '../../../../services/AssetService';
import { showAtlasToast } from '../../../../react/components/AtlasToast';

export interface TagsAndCollectionsState {
  // Tag manager modal
  isTagManagerOpen: boolean;
  setIsTagManagerOpen: (open: boolean) => void;
  // Edit tags modal
  isEditTagsModalOpen: boolean;
  editingAssetForTags: AnyAsset | null;
  openEditTagsModal: (asset: AnyAsset) => void;
  closeEditTagsModal: () => void;
  // Tag CRUD
  handleCreateTag: (tag: string) => Promise<void>;
  handleUpdateTag: (tagId: string, name: string) => Promise<void>;
  handleDeleteTag: (tagId: string) => Promise<void>;
  handleSaveAssetTags: (tags: string[]) => Promise<void>;
  // Collection CRUD
  handleUpdateCollection: (collectionId: string, name: string) => Promise<void>;
  handleDeleteCollection: (collectionId: string) => Promise<void>;
}

export function useTagsAndCollections(
  assetService: AssetService | null,
  selectedCollection: string | null,
  availableTags: Tag[],
  setAvailableTags: React.Dispatch<React.SetStateAction<Tag[]>>,
  setAssets: React.Dispatch<React.SetStateAction<AnyAsset[]>>,
  reloadCollections: () => Promise<void>,
  reloadGlobalTags: () => Promise<void>
): TagsAndCollectionsState {
  const [isTagManagerOpen, setIsTagManagerOpen] = useState(false);
  const [isEditTagsModalOpen, setIsEditTagsModalOpen] = useState(false);
  const [editingAssetForTags, setEditingAssetForTags] = useState<AnyAsset | null>(null);

  const openEditTagsModal = useCallback((asset: AnyAsset): void => {
    setEditingAssetForTags(asset);
    setIsEditTagsModalOpen(true);
  }, []);

  const closeEditTagsModal = useCallback((): void => {
    setIsEditTagsModalOpen(false);
    setEditingAssetForTags(null);
  }, []);

  const handleCreateTag = useCallback(async (tag: string): Promise<void> => {
    if (!assetService) return;
    const col = selectedCollection || 'default';
    try {
      const newTag = await assetService.createTag(col, tag);
      if (!availableTags.some(t => t.id === newTag.id)) {
        setAvailableTags(prev => [...prev, { id: newTag.id, name: newTag.name }]);
      }
    } catch (error) {
      console.error('[AssetManager] Failed to create tag:', error);
    }
  }, [assetService, selectedCollection, availableTags, setAvailableTags]);

  const handleUpdateTag = useCallback(async (tagId: string, name: string): Promise<void> => {
    if (!assetService) return;
    const previous = availableTags.find(t => t.id === tagId);
    try {
      const renamed = await assetService.renameTag(selectedCollection || 'default', tagId, name);
      const retag = (value: string): string =>
        value === tagId ? renamed.id : value === previous?.name ? renamed.name : value;
      setAssets(prev => prev.map(asset => ({ ...asset, tags: asset.tags?.map(retag) ?? [] })));
      await reloadGlobalTags();
    } catch (error) {
      console.error('[AssetManager] Failed to rename tag:', error);
      showAtlasToast('Could not rename the tag');
    }
  }, [assetService, selectedCollection, availableTags, setAssets, reloadGlobalTags]);

  const handleDeleteTag = useCallback(async (tagId: string): Promise<void> => {
    if (!assetService) return;
    const col = selectedCollection || 'default';
    try {
      await assetService.deleteTag(col, tagId);
      const name = availableTags.find(t => t.id === tagId)?.name;
      setAvailableTags(prev => prev.filter(t => t.id !== tagId));
      setAssets(prev =>
        prev.map(asset => ({
          ...asset,
          tags: asset.tags?.filter(t => t !== tagId && t !== name) ?? [],
        }))
      );
    } catch (error) {
      console.error('[AssetManager] Failed to delete tag:', error);
      showAtlasToast('Could not delete the tag');
    }
  }, [assetService, selectedCollection, availableTags, setAvailableTags, setAssets]);

  const handleSaveAssetTags = useCallback(async (tags: string[]): Promise<void> => {
    if (!editingAssetForTags || !assetService) return;
    try {
      await assetService.updateAsset(editingAssetForTags.id, { tags });
      setAssets(prev =>
        prev.map(asset =>
          asset.id === editingAssetForTags.id ? { ...asset, tags } : asset
        )
      );
      await reloadGlobalTags();
    } catch (error) {
      console.error('[AssetManager] Error updating asset tags:', error);
    }
  }, [editingAssetForTags, assetService, setAssets, reloadGlobalTags]);

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
    isEditTagsModalOpen, editingAssetForTags,
    openEditTagsModal, closeEditTagsModal,
    handleCreateTag, handleUpdateTag, handleDeleteTag, handleSaveAssetTags,
    handleUpdateCollection, handleDeleteCollection,
  };
}
