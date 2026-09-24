import { Tutorial } from '../../../onboarding/Tutorial';
import { useAtlasSettings } from '../../../keyboard/useMapHotkeys';
import { SettingsService } from '../../../services/SettingsService';
import React, { useState, useRef, useMemo } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import type { AssetManagerProps, Tab } from './types';

import { Header } from './components/Header';
import { Sidebar } from './components/Sidebar';
import { Content } from './components/Content';
import { Breadcrumb } from './components/Breadcrumb';
import { ModalLayer } from './components/ModalLayer';
import { useAssetData } from './hooks/useAssetData';
import { useSelectionHandlers, type VisibleIds } from './hooks/useSelectionHandlers';
import { useAssetCrud } from './hooks/useAssetCrud';
import { useTagsAndCollections } from './hooks/useTagsAndCollections';
import { AssetTagMenuContext, type AssetTagMenuActions } from './components/assetTagMenuContext';
import { tagGroupOfTab } from './utils/assetTags';
import { useContextMenus } from './hooks/useContextMenus';
import { useStatblockLink } from './hooks/useStatblockLink';
import { useAssetManagerEffects } from './hooks/useAssetManagerEffects';
import { useFollowSelectedCollection } from './hooks/useFollowSelectedCollection';
import { useHeldWhile } from './hooks/useHeldWhile';
import { useSidebarLayout } from './hooks/useSidebarLayout';
import { sortAssets } from './utils/assetSort';
import { filterAssets, filterFolders, type AssetFilter } from './utils/assetFilter';
import { DIALOG_EXIT_DURATION, dialogBackdropVariants, useDialogWindowVariants } from '../primitives/dialogMotion';

const wrapperVariants = {
  hidden: { opacity: 1 },
  visible: { opacity: 1 },
  exit: { opacity: 1, transition: { duration: DIALOG_EXIT_DURATION, when: 'afterChildren' as const } },
};

export default function AssetManager({ isOpen, onClose, initialTab, onExitComplete }: AssetManagerProps): React.JSX.Element {
  const [search, setSearch] = useState('');
  const [activeTab, setActiveTab] = useState<Tab>('tokens');
  const [selectedCollection, setSelectedCollection] = useState<string | null>('default');
  const [collapsedSections, setCollapsedSections] = useState<{ folders: boolean; assets: boolean }>({ folders: false, assets: false });
  const [draggedItems, setDraggedItems] = useState<{ type: 'asset' | 'folder'; ids: string[] } | null>(null);
  const [dropTarget, setDropTarget] = useState<string | null>(null);
  const modalRef = useRef<HTMLDivElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const sidebar = useSidebarLayout(containerRef, isOpen);
  const windowVariants = useDialogWindowVariants();

  const data = useAssetData(activeTab, selectedCollection, isOpen);
  useFollowSelectedCollection(data.collections, selectedCollection, setSelectedCollection);
  const settings = useAtlasSettings(SettingsService.forApp(data.app));

  const visibleIds = useRef<VisibleIds>({ assets: [], folders: [] });
  const sel = useSelectionHandlers(visibleIds, data.folders, activeTab, isOpen);

  const assetFilter = useMemo((): AssetFilter => ({
    tab: activeTab,
    folderId: sel.selectedFolderId,
    search,
    tags: sel.selectedTagIds.map((tagId) => data.availableTags.find((tag) => tag.id === tagId) ?? { id: tagId, name: tagId }),
  }), [activeTab, sel.selectedFolderId, search, sel.selectedTagIds, data.availableTags]);

  const displayedAssets = useMemo(
    () => sortAssets(filterAssets(data.assets, data.folders, assetFilter), sel.sortBy, sel.sortOrder),
    [data.assets, data.folders, assetFilter, sel.sortBy, sel.sortOrder],
  );

  const displayedFolders = useMemo(() => filterFolders(data.folders, assetFilter), [data.folders, assetFilter]);

  // A tab switch keeps the previous tab's content on screen, untouched by the resets
  // the switch triggers, until the new tab's assets have loaded; then the panes swap once.
  const isTabLoading = (data.assetsTab ?? activeTab) !== activeTab;
  const shown = useHeldWhile(isTabLoading, {
    tab: activeTab,
    assets: displayedAssets,
    folders: displayedFolders,
    folderId: sel.selectedFolderId,
    folderPath: sel.selectedFolderId ? sel.getFolderPath(sel.selectedFolderId) : [],
    refinement: [search, sel.sortBy, sel.sortOrder, ...sel.selectedTagIds].join('\n'),
  });

  visibleIds.current = {
    assets: displayedAssets.map((asset) => asset.id),
    folders: displayedFolders.map((folder) => folder.id),
  };

  const crud = useAssetCrud(
    data.app, data.assetService, activeTab, selectedCollection,
    sel.selectedFolderId, data.folders, data.assets, data.collections,
    data.setFolders, data.setAssets, data.reloadCollections, setSelectedCollection,
    data.loadFoldersForActiveTab, data.loadAssetsForActiveTab,
    draggedItems, setDraggedItems, setDropTarget,
  );

  const tags = useTagsAndCollections(
    data.assetService, selectedCollection, data.tagsByGroup,
    data.setAssets, data.reloadCollections, data.reloadGlobalTags,
  );
  const tagGroup = tagGroupOfTab(activeTab);
  const tagMenuActions = useMemo((): AssetTagMenuActions => ({
    tags: data.availableTags,
    setAssetTags: tags.setAssetTags,
    createTag: (name) => tags.handleCreateTag(tagGroup, name),
  }), [data.availableTags, tags.setAssetTags, tags.handleCreateTag, tagGroup]);

  const statblock = useStatblockLink(data.app);

  const { handleAssetContextMenu, handleFolderContextMenu, handleContentContextMenu } =
    useContextMenus({ data, sel, crud, tags, statblock, onClose });

  useAssetManagerEffects({
    isOpen, onClose, initialTab,
    modalRef, containerRef,
    setSearch, setActiveTab, setSelectedCollection,
    data, sel, crud, tags, statblock,
  });

  const anyModalOpen = crud.isTokenCreatorOpen || crud.isMapCreatorOpen;

  return (
    <>
      {/* Stays mounted while closed so the window can animate out. */}
      <AnimatePresence {...(onExitComplete ? { onExitComplete } : {})}>
        {isOpen && (
          <motion.div
            key="asset-manager-modal"
            className="atlas-vtt-plugin atlas-vtt-root atlas-asset-manager-modal"
            ref={modalRef}
            tabIndex={-1}
            variants={wrapperVariants}
            initial="hidden"
            animate="visible"
            exit="exit"
          >
            <motion.div
              className="atlas-asset-manager-backdrop"
              onClick={onClose}
              variants={dialogBackdropVariants}
              initial="hidden"
              animate="visible"
              exit="exit"
            />
            <motion.div
              className={`atlas-asset-manager-container ${sidebar.isFloating ? 'atlas-sidebar-floating' : ''}`}
              ref={containerRef}
              variants={windowVariants}
              initial="hidden"
              animate="visible"
              exit="exit"
            >
              <Sidebar
                selectedTagIds={sel.selectedTagIds}
                onSelectTag={sel.handleTagSelect}
                onClearTags={() => sel.setSelectedTagIds([])}
                tags={data.availableTags}
                assets={data.assets}
                collections={data.collections}
                selectedCollection={selectedCollection}
                onSelectCollection={setSelectedCollection}
                onManageTags={() => tags.setIsTagManagerOpen(true)}
                onEditCollectionSettings={crud.setSettingsModalCollectionId}
                onExportCollection={() => { void crud.handleExportCollection(); }}
                onImportCollection={crud.handleImportCollection}
                layout={sidebar}
              />
              <Header
                search={search}
                onSearch={setSearch}
                activeTab={activeTab}
                onTabChange={setActiveTab}
                assetCounts={data.assetCounts}
                onCreateTokens={() => crud.setIsTokenCreatorOpen(true)}
                onCreateMap={crud.handleCreateMap}
                onCreateCollection={crud.handleCreateCollection}
                onCreateFolder={crud.handleCreateFolder}
                onRefresh={() => { void crud.handleRefresh(); }}
                sidebarToggleLabel={sidebar.toggleLabel}
                onToggleSidebar={sidebar.toggle}
                sel={sel}
              />
              <div
                className="atlas-asset-manager-body"
                onDragOver={(e) => { if (draggedItems && sel.selectedFolderId === null) { e.preventDefault(); e.dataTransfer.dropEffect = 'move'; } }}
                onDrop={(e) => { if (draggedItems && sel.selectedFolderId === null) { e.preventDefault(); crud.handleDrop(null); } }}
              >
                <Breadcrumb
                  activeTab={shown.tab}
                  path={shown.folderPath}
                  onNavigateToFolder={sel.handleNavigateToFolder}
                />
                <div className="atlas-asset-manager-main">
                  <AssetTagMenuContext.Provider value={tagMenuActions}>
                    <Content
                      activeTab={shown.tab}
                      assets={shown.assets}
                      folders={shown.folders}
                      selectedAssetIds={sel.selectedAssetIds}
                      selectedFolderIds={sel.selectedFolderIds}
                      selectedFolderId={shown.folderId}
                      folderDepth={shown.folderPath.length}
                      refinement={shown.refinement}
                      onAssetSelect={sel.handleAssetSelect}
                      onAssetContextMenu={handleAssetContextMenu}
                      onFolderSelection={sel.handleFolderSelection}
                      onFolderContextMenu={handleFolderContextMenu}
                      onFolderDoubleClick={sel.handleFolderDoubleClick}
                      onContentContextMenu={handleContentContextMenu}
                      onClearSelection={sel.handleClearSelection}
                      onClose={onClose}
                      collapsedSections={collapsedSections}
                      setCollapsedSections={setCollapsedSections}
                      draggedItems={draggedItems}
                      setDraggedItems={setDraggedItems}
                      dropTarget={dropTarget}
                      setDropTarget={setDropTarget}
                      onDrop={crud.handleDrop}
                      view={data.view}
                      addTokens={data.addTokens}
                      setSelection={data.setSelection}
                      app={data.app}
                      assetService={data.assetService}
                      spawnCounts={sel.spawnCounts}
                      onSpawnCountChange={sel.handleSpawnCountChange}
                    />
                  </AssetTagMenuContext.Provider>
                </div>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {isOpen && !anyModalOpen && !crud.inputModalState?.isOpen && !crud.settingsModalCollectionId && !crud.isCreateSceneModalOpen && !crud.isMoveModalOpen && !tags.isTagManagerOpen && !statblock.linkingStatblockAsset && (
        settings?.shouldShowTutorial('assets') ? <Tutorial settings={settings} id="assets" steps={[
          { title: 'Your campaign library', body: 'Keep tokens, maps, scenes, and encounters together. Use the tabs to browse, and import your images to get started.', selector: '.atlas-am-toolbar-center' },
          { title: 'Start with a collection', body: 'Create a collection for your campaign to keep its assets together. You can switch collections here at any time.', selector: '.atlas-collections' },
        ]} action={{ label: 'Create collection', onClick: crud.handleCreateCollection }} /> :
        settings?.getSetting('onboarding').tokenImported ? <Tutorial settings={settings} id="tokenStatblocks" steps={[
          { title: 'Give your tokens a statblock', body: 'Use Fantasy Statblocks? Right-click a token in this library and choose Link Statblock. Pick a note containing a Fantasy Statblocks statblock to connect its stats to the token.', selector: '.atlas-asset-manager-main' },
        ]} /> : null
      )}

      <ModalLayer
        isOpen={isOpen}
        activeTab={activeTab}
        selectedCollection={selectedCollection}
        onClose={onClose}
        data={data}
        sel={sel}
        crud={crud}
        tags={tags}
        statblock={statblock}
      />
    </>
  );
}
