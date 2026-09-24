import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { ChevronDown, PackageOpen } from 'lucide-react';
import type { App } from 'obsidian';
import type {
  Tab, AnyAsset, Folder as FolderType, SelectionEvent,
} from '../types';
import { getTabDisplayName } from '../types';
import { AssetCard } from './AssetCard';
import { FolderGridItem } from './FolderGridItem';
import { VirtualAssetGrid } from './VirtualAssetGrid';
import { fadeVariants } from './gridMotion';
import { useOpenAsset } from '../hooks/useOpenAsset';
import { useAssetCardHandlers, type DraggedItems } from '../hooks/useAssetCardHandlers';
import type { AssetService } from '../../../../services/AssetService';
import type { AtlasView } from '../../../../atlas-view';
import type { ViewAtlasState } from '../../../../storeFactory';
import { useSpawnCountTyping } from '../hooks/useSpawnCountTyping';
import { useScrollbarGutter } from '../../primitives/useScrollbarGutter';

export interface ContentPaneProps {
  activeTab: Tab;
  /** The assets of the open folder, filtered and sorted. */
  assets: AnyAsset[];
  /** The subfolders of the open folder. */
  folders: FolderType[];
  selectedAssetIds: string[];
  selectedFolderIds: string[];
  onAssetSelect: (assetId: string, event?: SelectionEvent, toggle?: boolean) => void;
  onAssetContextMenu: (asset: AnyAsset, event: React.MouseEvent) => void;
  onFolderSelection: (folderId: string, event?: SelectionEvent) => void;
  onFolderContextMenu: (folder: FolderType, event: React.MouseEvent) => void;
  onFolderDoubleClick: (folderId: string) => void;
  onContentContextMenu: (event: React.MouseEvent) => void;
  onClearSelection: () => void;
  onClose: () => void;
  collapsedSections: { folders: boolean; assets: boolean };
  setCollapsedSections: React.Dispatch<React.SetStateAction<{ folders: boolean; assets: boolean }>>;
  draggedItems: DraggedItems | null;
  setDraggedItems: React.Dispatch<React.SetStateAction<DraggedItems | null>>;
  dropTarget: string | null;
  setDropTarget: React.Dispatch<React.SetStateAction<string | null>>;
  onDrop: (targetFolderId: string | null) => void;
  view: AtlasView | null;
  addTokens: ViewAtlasState['addTokens'];
  setSelection: (ids: string[]) => void;
  app: App;
  assetService: AssetService | null;
  spawnCounts: Record<string, number>;
  onSpawnCountChange: (assetId: string, count: number) => void;
}

interface SectionHeaderProps {
  title: string;
  count: number;
  collapsed: boolean;
  onToggle: () => void;
}

function SectionHeader({ title, count, collapsed, onToggle }: SectionHeaderProps): React.JSX.Element {
  return (
    <div
      className="atlas-section-header"
      onClick={onToggle}
      role="button"
      aria-expanded={!collapsed}
      tabIndex={0}
      onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') onToggle(); }}
    >
      <ChevronDown className={`atlas-chevron ${collapsed ? 'atlas-collapsed' : ''}`} />
      <h3>{title}</h3>
      <span className="atlas-section-count">{count}</span>
    </div>
  );
}

const NO_IDS: ReadonlySet<string> = new Set();

/** The scrolling content of one folder: its subfolders and assets, or the empty state. */
export function ContentPane(props: ContentPaneProps): React.JSX.Element {
  const {
    activeTab, assets, folders, selectedAssetIds, selectedFolderIds,
    onFolderSelection, onFolderContextMenu, onFolderDoubleClick, onContentContextMenu, onClearSelection,
    collapsedSections, setCollapsedSections, draggedItems, setDraggedItems, dropTarget, setDropTarget, onDrop,
    spawnCounts,
  } = props;
  // Each pane scrolls on its own, so the pane leaving during a folder change keeps its position.
  const [scrollElement, setScrollElement] = useState<HTMLDivElement | null>(null);
  // The grid only animates in when it appears inside a pane already on screen.
  const paneShown = useRef(false);
  useEffect(() => { paneShown.current = true; }, []);

  const openAsset = useOpenAsset({
    app: props.app, view: props.view, addTokens: props.addTokens, setSelection: props.setSelection,
    assetService: props.assetService, onClose: props.onClose,
  });
  const cardHandlers = useAssetCardHandlers({
    app: props.app, openAsset, selectedAssetIds, setDraggedItems,
    onAssetSelect: props.onAssetSelect, onAssetContextMenu: props.onAssetContextMenu,
    onSpawnCountChange: props.onSpawnCountChange,
  });
  useSpawnCountTyping(scrollElement, props.onSpawnCountChange);
  useScrollbarGutter(scrollElement);

  const selectedIds = useMemo(() => new Set(selectedAssetIds), [selectedAssetIds]);
  const draggingIds = useMemo(
    () => (draggedItems?.type === 'asset' ? new Set(draggedItems.ids) : NO_IDS),
    [draggedItems],
  );

  const renderCard = useCallback((asset: AnyAsset): React.ReactNode => (
    <AssetCard
      key={asset.id}
      asset={asset}
      isSelected={selectedIds.has(asset.id)}
      isDragging={draggingIds.has(asset.id)}
      spawnCount={spawnCounts[asset.id] || 1}
      {...cardHandlers}
    />
  ), [selectedIds, draggingIds, spawnCounts, cardHandlers]);

  const clearIfBackground = (e: React.MouseEvent): void => {
    if (e.target === e.currentTarget) onClearSelection();
  };

  const startFolderDrag = (folderId: string, event: React.DragEvent): void => {
    setDraggedItems({ type: 'folder', ids: selectedFolderIds.includes(folderId) ? selectedFolderIds : [folderId] });
    event.dataTransfer.effectAllowed = 'move';
  };
  const endDrag = (): void => { setDraggedItems(null); setDropTarget(null); };

  const isEmpty = assets.length === 0 && folders.length === 0;

  return (
    <div
      ref={setScrollElement}
      className="atlas-asset-manager-content"
      onContextMenu={onContentContextMenu}
      onClick={clearIfBackground}
    >
      <AnimatePresence mode="wait" initial={false}>
        {isEmpty ? (
          <motion.div key="empty" className="atlas-empty-state" variants={fadeVariants} initial="hidden" animate="visible" exit="exit">
            <PackageOpen className="atlas-empty-icon" />
            <h3>No {getTabDisplayName(activeTab).toLowerCase()} yet</h3>
            <p>Use the + button to add some, or adjust your search and tag filters.</p>
          </motion.div>
        ) : (
          <motion.div
            key="sections"
            className="atlas-content-sections"
            variants={fadeVariants}
            initial="hidden"
            animate="visible"
            exit="exit"
            onClick={clearIfBackground}
          >
            {folders.length > 0 && (
              <section className="atlas-content-section">
                <SectionHeader
                  title="Folders"
                  count={folders.length}
                  collapsed={collapsedSections.folders}
                  onToggle={() => setCollapsedSections((prev) => ({ ...prev, folders: !prev.folders }))}
                />
                {!collapsedSections.folders && (
                  <div className="atlas-folder-grid" onClick={clearIfBackground}>
                    {folders.map((folder) => (
                      <FolderGridItem
                        key={`folder-${folder.id}`}
                        folder={folder}
                        isSelected={selectedFolderIds.includes(folder.id)}
                        isDropTarget={dropTarget === folder.id}
                        canReceiveDrop={draggedItems !== null && !draggedItems.ids.includes(folder.id)}
                        onSelection={onFolderSelection}
                        onOpen={onFolderDoubleClick}
                        onContextMenu={onFolderContextMenu}
                        onDragStart={startFolderDrag}
                        onDragEnd={endDrag}
                        onDragOverTarget={setDropTarget}
                        onDrop={onDrop}
                      />
                    ))}
                  </div>
                )}
              </section>
            )}

            {assets.length > 0 && (
              <section className="atlas-content-section">
                <SectionHeader
                  title={getTabDisplayName(activeTab)}
                  count={assets.length}
                  collapsed={collapsedSections.assets}
                  onToggle={() => setCollapsedSections((prev) => ({ ...prev, assets: !prev.assets }))}
                />
                {!collapsedSections.assets && (
                  <VirtualAssetGrid
                    assets={assets}
                    scrollElement={scrollElement}
                    renderCard={renderCard}
                    onBackgroundClick={clearIfBackground}
                    appear={paneShown.current}
                  />
                )}
              </section>
            )}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
