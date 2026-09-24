import React from 'react';
import { AnimatePresence } from 'framer-motion';
import { TokenCreator } from '../TokenCreator';
import TagManager from '../TagManager';
import CreateSceneModal from '../CreateSceneModal';
import StatblockLinkModal from '../StatblockLinkModal';
import InputModal from '../../primitives/InputModal';
import { CollectionTransferLayer } from '../collection-transfer/CollectionTransferLayer';
import { CollectionSettingsModal } from '../../../../react/components/CollectionSettingsModal';
import { CreateCollectionModal } from '../CreateCollectionModal';
import { MoveModal } from './MoveModal';
import { CreateFolderModal } from './CreateFolderModal';
import type { Tab, TokenAsset } from '../types';
import type { AssetData } from '../hooks/useAssetData';
import type { SelectionState } from '../hooks/useSelectionHandlers';
import type { AssetCrudActions } from '../hooks/useAssetCrud';
import type { TagsAndCollectionsState } from '../hooks/useTagsAndCollections';
import type { StatblockLinkState } from '../hooks/useStatblockLink';
import { tagGroupOfTab } from '../utils/assetTags';

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

  // Each presence keeps its dialog mounted until the dialog has animated out.
  return (
    <>
      <CollectionTransferLayer
        transfer={crud.transfer}
        confirmExport={crud.confirmExport}
        confirmImport={crud.confirmImport}
        closeTransfer={crud.closeTransfer}
      />

      {/* Token Creator */}
      <AnimatePresence>
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
      </AnimatePresence>

      {/* Map Creator */}
      <AnimatePresence>
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
      </AnimatePresence>

      {/* Move Modal */}
      <AnimatePresence>
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
      </AnimatePresence>

      {/* Create Folder Modal */}
      <AnimatePresence>
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
      </AnimatePresence>

      {/* Tag Manager */}
      <TagManager
        isOpen={tags.isTagManagerOpen}
        onClose={() => tags.setIsTagManagerOpen(false)}
        tags={data.tagsByGroup}
        initialTab={tagGroupOfTab(activeTab)}
        collections={data.collections}
        onCreateTag={(group, tag) => { void tags.handleCreateTag(group, tag); }}
        onCreateCollection={crud.handleCreateCollection}
        onUpdateTag={tags.handleUpdateTag}
        onUpdateCollection={tags.handleUpdateCollection}
        onDeleteTag={tags.handleDeleteTag}
        onDeleteCollection={tags.handleDeleteCollection}
      />

      {/* Statblock Link Modal */}
      <AnimatePresence>
        {statblock.linkingStatblockAsset && (
          <StatblockLinkModal
            isOpen={true}
            onClose={statblock.closeStatblockLinkModal}
            asset={statblock.linkingStatblockAsset}
            onLink={(statblockPath) => { void statblock.handleLinkStatblock(statblockPath); }}
            app={data.app}
          />
        )}
      </AnimatePresence>

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
      <AnimatePresence>
        {isOpen && crud.isCreateSceneModalOpen && (
          <CreateSceneModal
            isOpen={crud.isCreateSceneModalOpen}
            onClose={() => crud.setIsCreateSceneModalOpen(false)}
            selectedCollection={collectionOrDefault}
            assetService={data.assetService}
            backgroundPath={crud.createScenePrefill?.backgroundPath ?? null}
            defaultName={crud.createScenePrefill?.defaultName ?? ''}
            onSceneCreated={onClose}
          />
        )}
      </AnimatePresence>

      {/* Create Collection */}
      <AnimatePresence>
        {crud.isCreateCollectionModalOpen && (
          <CreateCollectionModal
            existingNames={data.collections.map((collection) => collection.name)}
            onClose={() => crud.setIsCreateCollectionModalOpen(false)}
            onCreated={(collectionId) => { void crud.showCreatedCollection(collectionId); }}
          />
        )}
      </AnimatePresence>

      {/* Collection Settings */}
      <AnimatePresence>
        {crud.settingsModalCollectionId && (
          <CollectionSettingsModal
            isOpen={true}
            onClose={() => crud.setSettingsModalCollectionId(null)}
            collectionId={crud.settingsModalCollectionId}
          />
        )}
      </AnimatePresence>
    </>
  );
}
