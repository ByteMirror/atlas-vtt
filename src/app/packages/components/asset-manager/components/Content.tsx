import React from 'react';
import { Folder, ChevronDown, PackageOpen } from 'lucide-react';
import type { App } from 'obsidian';
import type {
  Tab, AnyAsset, Folder as FolderType, SelectionEvent,
} from '../types';
import { getTabDisplayName } from '../types';
import { AssetCard } from './AssetCard';
import { TooltipProvider } from '../../primitives/tooltip';
import type { AssetService } from '../../../../services/AssetService';
import type { AtlasView } from '../../../../atlas-view';
import type { ViewAtlasState } from '../../../../storeFactory';

export interface ContentProps {
  activeTab: Tab;
  assets: AnyAsset[];
  folders: FolderType[];
  selectedAssetIds: string[];
  selectedFolderIds: string[];
  selectedFolderId: string | null;
  onAssetSelect: (assetId: string, event?: SelectionEvent, toggle?: boolean) => void;
  onAssetContextMenu: (asset: AnyAsset, event: React.MouseEvent) => void;
  onFolderSelect: (folderId: string | null) => void;
  onFolderSelection: (folderId: string, event?: SelectionEvent) => void;
  onFolderContextMenu: (folder: FolderType, event: React.MouseEvent) => void;
  onFolderDoubleClick: (folderId: string) => void;
  onContentContextMenu: (event: React.MouseEvent) => void;
  onClearSelection: () => void;
  onClose: () => void;
  collapsedSections: { folders: boolean; assets: boolean };
  setCollapsedSections: React.Dispatch<React.SetStateAction<{ folders: boolean; assets: boolean }>>;
  draggedItems: { type: 'asset' | 'folder'; ids: string[] } | null;
  setDraggedItems: React.Dispatch<React.SetStateAction<{ type: 'asset' | 'folder'; ids: string[] } | null>>;
  dropTarget: string | null;
  setDropTarget: React.Dispatch<React.SetStateAction<string | null>>;
  onDrop: (targetFolderId: string | null) => void;
  view: AtlasView | null;
  addToken: ViewAtlasState['addToken'];
  setSelection: (ids: string[]) => void;
  app: App;
  assetService: AssetService | null;
  spawnCounts: Record<string, number>;
  onSpawnCountChange: (assetId: string, delta: number) => void;
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

export function Content({
  activeTab,
  assets,
  folders,
  selectedAssetIds,
  selectedFolderIds,
  selectedFolderId,
  onAssetSelect,
  onAssetContextMenu,
  onFolderSelection,
  onFolderContextMenu,
  onFolderDoubleClick,
  onContentContextMenu,
  onClearSelection,
  onClose,
  collapsedSections,
  setCollapsedSections,
  draggedItems,
  setDraggedItems,
  dropTarget,
  setDropTarget,
  onDrop,
  view,
  addToken,
  setSelection,
  app,
  assetService,
  spawnCounts,
  onSpawnCountChange,
}: ContentProps): React.JSX.Element {
  const filteredAssets = assets.filter((a) => a.type === activeTab);
  const filteredFolders = folders.filter(
    (f) => f.type === activeTab && f.parentId === selectedFolderId
  );

  const clearIfBackground = (e: React.MouseEvent): void => {
    if (e.target === e.currentTarget) onClearSelection();
  };

  if (filteredAssets.length === 0 && filteredFolders.length === 0) {
    return (
      <div className="atlas-asset-manager-content atlas-asset-manager-empty" onContextMenu={onContentContextMenu}>
        <div className="atlas-empty-state">
          <PackageOpen className="atlas-empty-icon" />
          <h3>No {getTabDisplayName(activeTab).toLowerCase()} yet</h3>
          <p>Use the + button to add some, or adjust your search and tag filters.</p>
        </div>
      </div>
    );
  }

  const renderFolder = (folder: FolderType): React.JSX.Element => {
    const isSelected = selectedFolderIds.includes(folder.id);
    const isDrop = dropTarget === folder.id;

    const dragProps = {
      draggable: true,
      onDragStart: (e: React.DragEvent) => {
        setDraggedItems({
          type: 'folder' as const,
          ids: selectedFolderIds.includes(folder.id) ? selectedFolderIds : [folder.id],
        });
        e.dataTransfer.effectAllowed = 'move';
      },
      onDragEnd: () => { setDraggedItems(null); setDropTarget(null); },
      onDragOver: (e: React.DragEvent) => {
        e.preventDefault();
        e.dataTransfer.dropEffect = 'move';
        if (draggedItems && !draggedItems.ids.includes(folder.id)) setDropTarget(folder.id);
      },
      onDragLeave: () => setDropTarget(null),
      onDrop: (e: React.DragEvent) => {
        e.preventDefault();
        e.stopPropagation();
        if (draggedItems && !draggedItems.ids.includes(folder.id)) onDrop(folder.id);
        setDropTarget(null);
      },
    };

    const keyHandler = (e: React.KeyboardEvent): void => {
      if (e.key === 'Enter' || e.key === ' ') {
        if (e.shiftKey) onFolderSelection(folder.id, e);
        else onFolderDoubleClick(folder.id);
      }
    };

    return (
      <div
        key={`folder-${folder.id}`}
        className={`atlas-folder-grid-item ${isSelected ? 'atlas-selected' : ''} ${isDrop ? 'atlas-drop-target' : ''}`}
        onClick={(e) => onFolderSelection(folder.id, e)}
        onDoubleClick={() => onFolderDoubleClick(folder.id)}
        onContextMenu={(e) => { e.preventDefault(); e.stopPropagation(); onFolderContextMenu(folder, e); }}
        role="button"
        tabIndex={0}
        aria-selected={isSelected}
        onKeyDown={keyHandler}
        {...dragProps}
      >
        <Folder className="atlas-folder-icon" />
        <span className="atlas-folder-name">{folder.name}</span>
      </div>
    );
  };

  return (
    <TooltipProvider delayDuration={800} skipDelayDuration={0}>
      <div
        className="atlas-asset-manager-content"
        onContextMenu={onContentContextMenu}
        onClick={clearIfBackground}
      >
        {filteredFolders.length > 0 && (
          <section className="atlas-content-section">
            <SectionHeader
              title="Folders"
              count={filteredFolders.length}
              collapsed={collapsedSections.folders}
              onToggle={() => setCollapsedSections((prev) => ({ ...prev, folders: !prev.folders }))}
            />
            {!collapsedSections.folders && (
              <div className="atlas-folder-grid" onClick={clearIfBackground}>
                {filteredFolders.map(renderFolder)}
              </div>
            )}
          </section>
        )}

        {filteredAssets.length > 0 && (
          <section className="atlas-content-section">
            <SectionHeader
              title={getTabDisplayName(activeTab)}
              count={filteredAssets.length}
              collapsed={collapsedSections.assets}
              onToggle={() => setCollapsedSections((prev) => ({ ...prev, assets: !prev.assets }))}
            />
            {!collapsedSections.assets && (
              <div className="atlas-asset-grid" onClick={clearIfBackground}>
                {filteredAssets.map((asset) => (
                  <AssetCard
                    key={asset.id}
                    asset={asset}
                    isSelected={selectedAssetIds.includes(asset.id)}
                    onSelect={onAssetSelect}
                    onContextMenu={onAssetContextMenu}
                    onClose={onClose}
                    draggedItems={draggedItems}
                    setDraggedItems={setDraggedItems}
                    selectedAssetIds={selectedAssetIds}
                    view={view}
                    addToken={addToken}
                    setSelection={setSelection}
                    app={app}
                    assetService={assetService}
                    spawnCount={spawnCounts[asset.id] || 1}
                    onSpawnCountChange={onSpawnCountChange}
                  />
                ))}
              </div>
            )}
          </section>
        )}
      </div>
    </TooltipProvider>
  );
}
