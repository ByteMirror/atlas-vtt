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
  handleUpdateTag: (oldTag: string, newTag: string) => void;
  handleDeleteTag: (tagId: string) => Promise<void>;
  handleSaveAssetTags: (tags: string[]) => Promise<void>;
  // Collection CRUD
  handleUpdateCollection: (oldCollection: string, newCollection: string) => Promise<void>;
  handleDeleteCollection: (collection: string) => Promise<void>;
}

export function useTagsAndCollections(
  assetService: AssetService | null,
  selectedCollection: string | null,
  availableTags: Tag[],
  setAvailableTags: React.Dispatch<React.SetStateAction<Tag[]>>,
  setAssets: React.Dispatch<React.SetStateAction<AnyAsset[]>>,
  collections: string[],
  setCollections: React.Dispatch<React.SetStateAction<string[]>>,
  setSelectedCollection: (c: string | null) => void,
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

  const handleUpdateTag = useCallback((oldTag: string, newTag: string): void => {
    setAvailableTags(prev =>
      prev.map(t => t.id === oldTag ? { id: newTag, name: newTag } : t)
    );
    setAssets(prev =>
      prev.map(asset => ({
        ...asset,
        tags: asset.tags?.map(t => t === oldTag ? newTag : t) ?? [],
      }))
    );
  }, [setAvailableTags, setAssets]);

  const handleDeleteTag = useCallback(async (tagId: string): Promise<void> => {
    if (!assetService) return;
    const col = selectedCollection || 'default';
    try {
      await assetService.deleteTag(col, tagId);
      setAvailableTags(prev => prev.filter(t => t.id !== tagId));
      setAssets(prev =>
        prev.map(asset => ({
          ...asset,
          tags: asset.tags?.filter(t => t !== tagId) ?? [],
        }))
      );
    } catch (error) {
      console.error('[AssetManager] Failed to delete tag:', error);
    }
  }, [assetService, selectedCollection, setAvailableTags, setAssets]);

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

  const handleUpdateCollection = useCallback(async (oldCollection: string, newCollection: string): Promise<void> => {
    if (!assetService) return;
    try {
      const id = await assetService.resolveCollectionId(oldCollection);
      if (!id) return;
      await assetService.renameCollection(id, newCollection);
      setCollections(prev => prev.map(c => c === oldCollection ? newCollection : c));
      if (selectedCollection === oldCollection) {
        setSelectedCollection(newCollection);
      }
    } catch (error) {
      console.error('[AssetManager] Failed to rename collection:', error);
      showAtlasToast('Could not rename the collection');
    }
  }, [assetService, setCollections, selectedCollection, setSelectedCollection]);

  const handleDeleteCollection = useCallback(async (collection: string): Promise<void> => {
    if (!assetService) return;
    try {
      const id = await assetService.resolveCollectionId(collection);
      if (id === 'default') {
        showAtlasToast('The default collection cannot be deleted');
        return;
      }
      if (id) await assetService.deleteCollection(id);
      setCollections(prev => prev.filter(c => c !== collection));
      if (selectedCollection === collection) {
        setSelectedCollection(null);
      }
    } catch (error) {
      console.error('[AssetManager] Failed to delete collection:', error);
      showAtlasToast('Could not delete the collection');
    }
  }, [assetService, setCollections, selectedCollection, setSelectedCollection]);

  return {
    isTagManagerOpen, setIsTagManagerOpen,
    isEditTagsModalOpen, editingAssetForTags,
    openEditTagsModal, closeEditTagsModal,
    handleCreateTag, handleUpdateTag, handleDeleteTag, handleSaveAssetTags,
    handleUpdateCollection, handleDeleteCollection,
  };
}
