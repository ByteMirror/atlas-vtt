import { Tutorial } from '../../../onboarding/Tutorial';
import { useAtlasSettings } from '../../../keyboard/useMapHotkeys';
import { SettingsService } from '../../../services/SettingsService';
import React, { useState, useRef, useMemo } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import type { AssetManagerProps, Tab } from './types';

import { Header } from './components/Header';
import { Sidebar } from './components/Sidebar';
import { Content } from './components/Content';
import { ModalLayer } from './components/ModalLayer';
import { useAssetData } from './hooks/useAssetData';
import { useSelectionHandlers, type VisibleIds } from './hooks/useSelectionHandlers';
import { useAssetCrud } from './hooks/useAssetCrud';
import { useTagsAndCollections } from './hooks/useTagsAndCollections';
import { useContextMenus } from './hooks/useContextMenus';
import { useStatblockLink } from './hooks/useStatblockLink';
import { useAssetManagerEffects } from './hooks/useAssetManagerEffects';
import { runInBackground } from '../../../utils/backgroundTask';
import { hasAssetTag } from './utils/assetTags';

const wrapperVariants = {
  hidden: { opacity: 1 },
  visible: { opacity: 1 },
  exit: { opacity: 1, transition: { duration: 0.12, when: 'afterChildren' as const } },
};

// Strong ease-out so the window reads as responsive; exit is shorter than enter.
const EASE_OUT: [number, number, number, number] = [0.23, 1, 0.32, 1];

const backdropVariants = {
  hidden: { opacity: 0 },
  visible: { opacity: 1, transition: { duration: 0.2, ease: EASE_OUT } },
  exit: { opacity: 0, transition: { duration: 0.12, ease: EASE_OUT } },
};

// Full transform strings keep the animation on the compositor thread.
const containerVariants = {
  hidden: { opacity: 0, transform: 'translateY(8px) scale(0.97)' },
  visible: { opacity: 1, transform: 'translateY(0px) scale(1)', transition: { duration: 0.22, ease: EASE_OUT } },
  exit: { opacity: 0, transform: 'translateY(8px) scale(0.97)', transition: { duration: 0.12, ease: EASE_OUT } },
};

export default function AssetManager({ isOpen, onClose, initialTab }: AssetManagerProps): React.JSX.Element | null {
  const [tokenCreatorSource, setTokenCreatorSource] = useState<'images' | 'statblocks'>('images');
  const [search, setSearch] = useState('');
  const [activeTab, setActiveTab] = useState<Tab>('tokens');
  const [selectedCollection, setSelectedCollection] = useState<string | null>('default');
  const [isSidebarCollapsed, setIsSidebarCollapsed] = useState(false);
  const [collapsedSections, setCollapsedSections] = useState<{ folders: boolean; assets: boolean }>({ folders: false, assets: false });
  const [draggedItems, setDraggedItems] = useState<{ type: 'asset' | 'folder'; ids: string[] } | null>(null);
  const [dropTarget, setDropTarget] = useState<string | null>(null);
  const modalRef = useRef<HTMLDivElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  const data = useAssetData(activeTab, selectedCollection, isOpen);
  const settings = useAtlasSettings(SettingsService.forApp(data.app));

  const visibleIds = useRef<VisibleIds>({ assets: [], folders: [] });
  const sel = useSelectionHandlers(visibleIds, data.folders, activeTab, isOpen);

  const displayedAssets = useMemo(() => {
    const searchLower = search.toLowerCase();
    const hasTagFilter = sel.selectedTagIds.length > 0;
    return data.assets
      .filter((asset): boolean => {
        if (asset.folderId !== sel.selectedFolderId) return false;
        if (asset.type !== activeTab) return false;
        if (search && !asset.name.toLowerCase().includes(searchLower)) return false;
        if (!hasTagFilter) return true;
        return sel.selectedTagIds.every(tagId => {
          const tag = data.availableTags.find(candidate => candidate.id === tagId);
          return hasAssetTag(asset.tags, tag ?? { id: tagId, name: tagId });
        });
      })
      .sort((a, b) => {
        const cmp = sel.sortBy === 'type'
          ? a.type.localeCompare(b.type)
          : a.name.localeCompare(b.name);
        return sel.sortOrder === 'asc' ? cmp : -cmp;
      });
  }, [data.assets, data.availableTags, sel.selectedFolderId, activeTab, search, sel.selectedTagIds, sel.sortBy, sel.sortOrder]);

  const displayedFolders = useMemo(
    () => data.folders.filter((folder) => folder.type === activeTab && folder.parentId === sel.selectedFolderId),
    [data.folders, activeTab, sel.selectedFolderId],
  );

  visibleIds.current = {
    assets: displayedAssets.map((asset) => asset.id),
    folders: displayedFolders.map((folder) => folder.id),
  };

  const crud = useAssetCrud(
    data.app, data.assetService, activeTab, selectedCollection,
    sel.selectedFolderId, data.folders, data.assets, data.collections,
    data.setFolders, data.setAssets, data.setCollections, setSelectedCollection,
    data.loadFoldersForActiveTab, data.loadAssetsForActiveTab,
    draggedItems, setDraggedItems, setDropTarget,
  );

  const tags = useTagsAndCollections(
    data.assetService, selectedCollection, data.availableTags,
    data.setAvailableTags, data.setAssets, data.collections,
    data.setCollections, setSelectedCollection, data.reloadGlobalTags,
  );

  const statblock = useStatblockLink(data.app);

  const { handleAssetContextMenu, handleFolderContextMenu, handleContentContextMenu } =
    useContextMenus({ data, sel, crud, tags, statblock, onClose });

  useAssetManagerEffects({
    isOpen, onClose, initialTab,
    modalRef, containerRef,
    setSearch, setActiveTab, setIsSidebarCollapsed, setSelectedCollection,
    data, sel, crud, tags, statblock,
  });

  const handleEditCollectionSettings = async (collectionName: string): Promise<void> => {
    if (!data.assetService) return;
    const id = await data.assetService.resolveCollectionId(collectionName);
    if (id) crud.setSettingsModalCollectionId(id);
  };

  if (!isOpen) return null;

  const anyModalOpen = crud.isTokenCreatorOpen || crud.isMapCreatorOpen;

  return (
    <>
      <AnimatePresence mode="wait">
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
            style={{ display: anyModalOpen ? 'none' : 'block' }}
            variants={backdropVariants}
            initial="hidden"
            animate="visible"
            exit="exit"
          />
          <motion.div
            className="atlas-asset-manager-container atlas-expanded"
            ref={containerRef}
            style={{ display: anyModalOpen ? 'none' : 'grid' }}
            variants={containerVariants}
            initial="hidden"
            animate="visible"
            exit="exit"
          >
            <Sidebar
              selectedTagIds={sel.selectedTagIds}
              onSelectTag={sel.handleTagSelect}
              tags={data.availableTags}
              assets={data.assets}
              collections={data.collections}
              selectedCollection={selectedCollection}
              onSelectCollection={setSelectedCollection}
              onManageTags={() => tags.setIsTagManagerOpen(true)}
              onEditCollectionSettings={(collectionName) => runInBackground(handleEditCollectionSettings(collectionName), 'Opening collection settings')}
              onExportCollection={() => { void crud.handleExportCollection(); }}
              onImportCollection={crud.handleImportCollection}
              isCollapsed={isSidebarCollapsed}
              onToggleCollapse={() => setIsSidebarCollapsed(!isSidebarCollapsed)}
            />
            <Header
              search={search}
              onSearch={setSearch}
              activeTab={activeTab}
              onTabChange={setActiveTab}
              assetCounts={data.assetCounts}
              onCreateTokens={() => { setTokenCreatorSource('images'); crud.setIsTokenCreatorOpen(true); }}
              onImportStatblocks={() => { setTokenCreatorSource('statblocks'); crud.setIsTokenCreatorOpen(true); }}
              onCreateMap={crud.handleCreateMap}
              onCreateCollection={crud.handleCreateCollection}
              onCreateFolder={crud.handleCreateFolder}
              onRefresh={() => { void crud.handleRefresh(); }}
              isSidebarCollapsed={isSidebarCollapsed}
              onToggleSidebar={() => setIsSidebarCollapsed(!isSidebarCollapsed)}
              sel={sel}
            />
            <div
              className="atlas-asset-manager-body"
              onDragOver={(e) => { if (draggedItems && sel.selectedFolderId === null) { e.preventDefault(); e.dataTransfer.dropEffect = 'move'; } }}
              onDrop={(e) => { if (draggedItems && sel.selectedFolderId === null) { e.preventDefault(); crud.handleDrop(null); } }}
            >
              <div className="atlas-asset-manager-main">
                <Content
                  activeTab={activeTab}
                  assets={displayedAssets}
                  folders={displayedFolders}
                  selectedAssetIds={sel.selectedAssetIds}
                  selectedFolderIds={sel.selectedFolderIds}
                  selectedFolderId={sel.selectedFolderId}
                  onAssetSelect={sel.handleAssetSelect}
                  onAssetContextMenu={handleAssetContextMenu}
                  onFolderSelect={sel.handleFolderSelect}
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
                  addToken={data.addToken}
                  setSelection={data.setSelection}
                  app={data.app}
                  assetService={data.assetService}
                  spawnCounts={sel.spawnCounts}
                  onSpawnCountChange={sel.handleSpawnCountChange}
                />
              </div>
            </div>
          </motion.div>
        </motion.div>
      </AnimatePresence>

      {!anyModalOpen && !crud.inputModalState?.isOpen && !crud.settingsModalCollectionId && !crud.isCreateSceneModalOpen && !crud.isMoveModalOpen && !tags.isTagManagerOpen && !tags.isEditTagsModalOpen && !statblock.linkingStatblockAsset && (
        settings?.shouldShowTutorial('assets') ? <Tutorial settings={settings} id="assets" steps={[
          { title: 'Your campaign library', body: 'Keep tokens, maps, scenes, and encounters together. Use the tabs to browse, and import your images to get started.', selector: '.atlas-asset-manager-tabs' },
          { title: 'Start with a collection', body: 'Create a collection for your campaign to keep its assets together. You can switch collections here at any time.', selector: '.atlas-collections' },
        ]} action={{ label: 'Create collection', onClick: crud.handleCreateCollection }} /> :
        settings?.getSetting('onboarding').tokenImported ? <Tutorial settings={settings} id="tokenStatblocks" steps={[
          { title: 'Give your tokens a statblock', body: 'Use Fantasy Statblocks? Right-click a token in this library and choose Link Statblock. Pick a note containing a Fantasy Statblocks statblock to connect its stats to the token.', selector: '.atlas-asset-manager-main' },
        ]} /> : null
      )}

      <ModalLayer
        tokenCreatorSource={tokenCreatorSource}
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
