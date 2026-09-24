import React from 'react';
import { TokenCreator } from '../TokenCreator';
import TagManager from '../TagManager';
import EditAssetTagsModal from '../EditAssetTagsModal';
import CreateSceneModal from '../CreateSceneModal';
import StatblockLinkModal from '../StatblockLinkModal';
import InputModal from '../../primitives/InputModal';
import { CollectionTransferLayer } from '../collection-transfer/CollectionTransferLayer';
import { CollectionSettingsModal } from '../../../../react/components/CollectionSettingsModal';
import { MoveModal } from './MoveModal';
import { CreateFolderModal } from './CreateFolderModal';
import type { Tab, TokenAsset } from '../types';
import type { AssetData } from '../hooks/useAssetData';
import type { SelectionState } from '../hooks/useSelectionHandlers';
import type { AssetCrudActions } from '../hooks/useAssetCrud';
import type { TagsAndCollectionsState } from '../hooks/useTagsAndCollections';
import type { StatblockLinkState } from '../hooks/useStatblockLink';

export interface ModalLayerProps {
  isOpen: boolean;
  activeTab: Tab;
  selectedCollection: string | null;
  onClose: () => void;
  data: AssetData;
  sel: SelectionState;
  crud: AssetCrudActions;
  tags: TagsAndCollectionsState;
  statblock: StatblockLinkState;
}

export function ModalLayer({
  isOpen, activeTab, selectedCollection, onClose, data, sel, crud, tags, statblock,
}: ModalLayerProps): React.JSX.Element {
  const collectionOrDefault = selectedCollection || 'default';

  const closeMoveModal = (): void => {
    crud.setIsMoveModalOpen(false);
    crud.setMoveTargetFolderId(null);
    crud.setMoveFolderSearch('');
    crud.setMoveFolderListOpen(false);
  };

  const confirmMove = async (): Promise<void> => {
    await crud.moveAssetsToFolder(sel.selectedAssetIds, crud.moveTargetFolderId);
    sel.setSelectedAssetIds([]);
    closeMoveModal();
  };

  const reloadAfterCreator = async (): Promise<void> => {
    if (data.assetService) {
      await data.loadAssetsForActiveTab();
      await data.reloadGlobalTags();
    }
  };

  return (
    <>
      <CollectionTransferLayer
        transfer={crud.transfer}
        confirmExport={crud.confirmExport}
        confirmImport={crud.confirmImport}
        closeTransfer={crud.closeTransfer}
      />

      {/* Token Creator */}
      {isOpen && crud.isTokenCreatorOpen && (
        <TokenCreator
          isOpen={crud.isTokenCreatorOpen}
          selectedCollection={collectionOrDefault}
          onClose={() => {
            crud.setIsTokenCreatorOpen(false);
            crud.setEditingToken(null);
            if (activeTab === 'tokens') void reloadAfterCreator();
          }}
          editToken={crud.editingToken ? {
            id: crud.editingToken.id,
            name: crud.editingToken.name,
            imageUrl: (crud.editingToken as TokenAsset).imageUrl,
            imagePath: (crud.editingToken as TokenAsset).imagePath,
            tags: crud.editingToken.tags || [],
            showRing: (crud.editingToken as TokenAsset).showRing ?? true,
            size: (crud.editingToken as TokenAsset).size,
          } : null}
        />
      )}

      {/* Map Creator */}
      {isOpen && crud.isMapCreatorOpen && (
        <TokenCreator
          isOpen={crud.isMapCreatorOpen}
          mode="map"
          selectedCollection={collectionOrDefault}
          onClose={() => {
            crud.setIsMapCreatorOpen(false);
            if (activeTab === 'maps') void reloadAfterCreator();
          }}
        />
      )}

      {/* Move Modal */}
      {crud.isMoveModalOpen && (
        <MoveModal
          selectedAssetIds={sel.selectedAssetIds}
          folders={data.folders}
          activeTab={activeTab}
          moveTargetFolderId={crud.moveTargetFolderId}
          setMoveTargetFolderId={crud.setMoveTargetFolderId}
          moveFolderSearch={crud.moveFolderSearch}
          setMoveFolderSearch={crud.setMoveFolderSearch}
          moveFolderListOpen={crud.moveFolderListOpen}
          setMoveFolderListOpen={crud.setMoveFolderListOpen}
          onClose={closeMoveModal}
          onConfirm={() => { void confirmMove(); }}
        />
      )}

      {/* Create Folder Modal */}
      {crud.isCreateFolderModalOpen && (
        <CreateFolderModal
          selectedFolderId={sel.selectedFolderId}
          activeTab={activeTab}
          targetFolderName={crud.targetFolderName}
          setTargetFolderName={crud.setTargetFolderName}
          onClose={() => { crud.setIsCreateFolderModalOpen(false); crud.setTargetFolderName(''); }}
          onConfirm={() => { void crud.createFolderInVault(crud.targetFolderName.trim()); }}
        />
      )}

      {/* Tag Manager */}
      <TagManager
        isOpen={tags.isTagManagerOpen}
        onClose={() => tags.setIsTagManagerOpen(false)}
        tags={data.availableTags.map(t => t.name)}
        collections={data.collections}
        onCreateTag={(tag) => { void tags.handleCreateTag(tag); }}
        onCreateCollection={crud.handleCreateCollection}
        onUpdateTag={tags.handleUpdateTag}
        onUpdateCollection={tags.handleUpdateCollection}
        onDeleteTag={tags.handleDeleteTag}
        onDeleteCollection={tags.handleDeleteCollection}
      />

      {/* Edit Asset Tags Modal */}
      {tags.editingAssetForTags && (
        <EditAssetTagsModal
          isOpen={tags.isEditTagsModalOpen}
          onClose={tags.closeEditTagsModal}
          assetName={tags.editingAssetForTags.name}
          currentTags={tags.editingAssetForTags.tags || []}
          availableTags={data.availableTags.map(t => t.name)}
          onSave={(assetTags) => { void tags.handleSaveAssetTags(assetTags); }}
          onCreateTag={(tag) => { void tags.handleCreateTag(tag); }}
        />
      )}

      {/* Statblock Link Modal */}
      {statblock.linkingStatblockAsset && (
        <StatblockLinkModal
          isOpen={true}
          onClose={statblock.closeStatblockLinkModal}
          asset={statblock.linkingStatblockAsset}
          onLink={(statblockPath) => { void statblock.handleLinkStatblock(statblockPath); }}
          app={data.app}
        />
      )}

      {/* Input Modal (rename, etc.) */}
      <InputModal
        isOpen={crud.inputModalState.isOpen}
        onClose={() => crud.setInputModalState({ ...crud.inputModalState, isOpen: false })}
        title={crud.inputModalState.title}
        placeholder={crud.inputModalState.placeholder}
        defaultValue={crud.inputModalState.defaultValue}
        onConfirm={crud.inputModalState.onConfirm}
        validation={crud.inputModalState.validation}
      />

      {/* Create Scene Modal */}
      {isOpen && crud.isCreateSceneModalOpen && (
        <CreateSceneModal
          isOpen={crud.isCreateSceneModalOpen}
          onClose={() => crud.setIsCreateSceneModalOpen(false)}
          collections={data.collections}
          selectedCollection={collectionOrDefault}
          assetService={data.assetService}
          backgroundPath={crud.createScenePrefill?.backgroundPath ?? null}
          defaultName={crud.createScenePrefill?.defaultName ?? ''}
          onSceneCreated={onClose}
        />
      )}

      {/* Collection Settings */}
      {crud.settingsModalCollectionId && (
        <CollectionSettingsModal
          isOpen={true}
          onClose={() => crud.setSettingsModalCollectionId(null)}
          collectionId={crud.settingsModalCollectionId}
        />
      )}
    </>
  );
}
