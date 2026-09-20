import React from 'react';
import { openContextMenuGlobal } from '../../../../react/root/ContextMenuContext';
import { buildAssetContextMenuEntries } from '../contextMenus/assetContextMenu';
import { buildFolderContextMenuEntries } from '../contextMenus/folderContextMenu';
import { buildContentContextMenuEntries } from '../contextMenus/contentContextMenu';
import type { AnyAsset, Folder as FolderType } from '../types';
import type { AssetData } from './useAssetData';
import type { SelectionState } from './useSelectionHandlers';
import type { AssetCrudActions } from './useAssetCrud';
import type { TagsAndCollectionsState } from './useTagsAndCollections';
import type { StatblockLinkState } from './useStatblockLink';

interface ContextMenuDeps {
  data: AssetData;
  sel: SelectionState;
  crud: AssetCrudActions;
  tags: TagsAndCollectionsState;
  statblock: StatblockLinkState;
  onClose: () => void;
}

interface ContextMenuHandlers {
  handleAssetContextMenu: (asset: AnyAsset, event: React.MouseEvent) => void;
  handleFolderContextMenu: (folder: FolderType, event: React.MouseEvent) => void;
  handleContentContextMenu: (event: React.MouseEvent) => void;
}

export function useContextMenus({
  data, sel, crud, tags, statblock, onClose,
}: ContextMenuDeps): ContextMenuHandlers {
  const handleAssetContextMenu = (asset: AnyAsset, event: React.MouseEvent): void => {
    if (!sel.selectedAssetIds.includes(asset.id)) {
      sel.setSelectedAssetIds([asset.id]);
    }
    const selectedAssets = sel.selectedAssetIds.length > 1 && sel.selectedAssetIds.includes(asset.id)
      ? data.assets.filter(a => sel.selectedAssetIds.includes(a.id))
      : [asset];

    const entries = buildAssetContextMenuEntries(asset, selectedAssets, {
      app: data.app, view: data.view, addToken: data.addToken, setSelection: data.setSelection,
      assetService: data.assetService, onClose,
      setEditingToken: crud.setEditingToken, setIsTokenCreatorOpen: crud.setIsTokenCreatorOpen,
      setIsMoveModalOpen: crud.setIsMoveModalOpen,
      setInputModalState: crud.setInputModalState,
      setAssets: data.setAssets, setSelectedAssetIds: sel.setSelectedAssetIds,
      setAvailableTags: data.setAvailableTags,
      loadAssetsForActiveTab: data.loadAssetsForActiveTab,
      handleCreateTag: tags.handleCreateTag,
      handleSaveAsEncounter: crud.handleSaveAsEncounter,
      openStatblockLinkModal: statblock.openStatblockLinkModal,
      unlinkStatblock: statblock.unlinkStatblock,
      deleteAssetFromVault: crud.deleteAssetFromVault,
      selectedAssetIds: sel.selectedAssetIds,
      assets: data.assets, folders: data.folders, availableTags: data.availableTags,
    });
    openContextMenuGlobal(entries, { x: event.clientX, y: event.clientY });
  };

  const handleFolderContextMenu = (folder: FolderType, event: React.MouseEvent): void => {
    event.preventDefault();
    const entries = buildFolderContextMenuEntries(folder, {
      folders: data.folders, assets: data.assets,
      setInputModalState: crud.setInputModalState,
      setFolders: data.setFolders, setAssets: data.setAssets,
      setSelectedFolderIds: sel.setSelectedFolderIds,
      handleFolderDoubleClick: sel.handleFolderDoubleClick,
      deleteFolderFromVault: crud.deleteFolderFromVault,
    });
    openContextMenuGlobal(entries, { x: event.clientX, y: event.clientY });
  };

  const handleContentContextMenu = (event: React.MouseEvent): void => {
    event.preventDefault();
    const entries = buildContentContextMenuEntries({
      sortBy: sel.sortBy, setSortBy: sel.setSortBy,
      sortOrder: sel.sortOrder, setSortOrder: sel.setSortOrder,
      handleCreateFolder: crud.handleCreateFolder,
      handleRefresh: crud.handleRefresh,
    });
    openContextMenuGlobal(entries, { x: event.clientX, y: event.clientY });
  };

  return { handleAssetContextMenu, handleFolderContextMenu, handleContentContextMenu };
}
