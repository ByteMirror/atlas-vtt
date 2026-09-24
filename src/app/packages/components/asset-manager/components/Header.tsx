import React from 'react';
import {
  X, Plus, ChevronLeft, ChevronRight, FolderPlus, RefreshCw, PanelLeft,
  Map as MapIcon, FolderOpen,
} from 'lucide-react';
import { Button } from '../../primitives/button';
import { LabelTooltip } from '../../primitives/tooltip';
import type { Tab } from '../types';
import type { SelectionState } from '../hooks/useSelectionHandlers';
import { HeaderMenu } from './HeaderMenu';
import { HeaderSearch } from './HeaderSearch';
import { SortControls } from './SortControls';
import { TabSwitcher } from './TabSwitcher';
import { TokenIcon } from '../../../../react/components/TokenIcon';

export interface HeaderProps {
  search: string;
  onSearch: (value: string) => void;
  activeTab: Tab;
  onTabChange: (tab: Tab) => void;
  assetCounts: Record<Tab, number>;
  onCreateTokens?: () => void;
  onCreateMap?: () => void;
  onCreateCollection?: () => void;
  onCreateFolder: () => void;
  onRefresh: () => void;
  sidebarToggleLabel: string;
  onToggleSidebar: () => void;
  sel: Pick<
    SelectionState,
    'navigationHistory' | 'handleNavigateBack' | 'handleNavigateForward' |
    'selectedAssetIds' | 'selectedFolderIds' | 'handleClearSelection' |
    'sortBy' | 'sortOptions' | 'setSortBy' | 'sortOrder' | 'setSortOrder'
  >;
}

/**
 * One-row toolbar: navigation and selection on the left, asset type in the
 * centre, search / sort / folder / create on the right. As the header narrows,
 * the tabs, the sort and the search fold into menus and buttons (see `_header.scss`).
 */
export function Header({
  search,
  onSearch,
  activeTab,
  onTabChange,
  assetCounts,
  onCreateTokens,
  onCreateMap,
  onCreateCollection,
  onCreateFolder,
  onRefresh,
  sidebarToggleLabel,
  onToggleSidebar,
  sel,
}: HeaderProps): React.JSX.Element {
  const selectionCount = sel.selectedAssetIds.length + sel.selectedFolderIds.length;

  return (
    <header className="atlas-asset-manager-header">
      <div className="atlas-am-toolbar">
        <div className="atlas-am-toolbar-left">
          <LabelTooltip label={sidebarToggleLabel}>
            <Button
              variant="ghost"
              size="icon"
              className="atlas-am-icon-btn atlas-sidebar-toggle-btn"
              onClick={onToggleSidebar}
              aria-label={sidebarToggleLabel}
            >
              <PanelLeft />
            </Button>
          </LabelTooltip>
          <LabelTooltip label="Back">
            <Button
              variant="ghost"
              size="icon"
              className="atlas-am-icon-btn"
              onClick={sel.handleNavigateBack}
              disabled={!sel.navigationHistory.canGoBack()}
            >
              <ChevronLeft />
            </Button>
          </LabelTooltip>
          <LabelTooltip label="Forward">
            <Button
              variant="ghost"
              size="icon"
              className="atlas-am-icon-btn"
              onClick={sel.handleNavigateForward}
              disabled={!sel.navigationHistory.canGoForward()}
            >
              <ChevronRight />
            </Button>
          </LabelTooltip>

          {selectionCount > 0 && (
            <>
              <div className="atlas-am-toolbar-divider" />
              <div className="atlas-selection-info">
                <span>{selectionCount}<span className="atlas-selection-label"> selected</span></span>
                <LabelTooltip label="Clear selection">
                  <Button
                    variant="ghost"
                    size="icon"
                    className="atlas-clear-selection-btn"
                    onClick={sel.handleClearSelection}
                  >
                    <X />
                  </Button>
                </LabelTooltip>
              </div>
            </>
          )}
        </div>

        <div className="atlas-am-toolbar-center">
          <TabSwitcher activeTab={activeTab} onTabChange={onTabChange} assetCounts={assetCounts} />
        </div>

        <div className="atlas-am-toolbar-right">
          <HeaderSearch search={search} onSearch={onSearch} />
          <SortControls
            sortBy={sel.sortBy}
            sortOptions={sel.sortOptions}
            setSortBy={sel.setSortBy}
            sortOrder={sel.sortOrder}
            setSortOrder={sel.setSortOrder}
          />

          <div className="atlas-am-toolbar-divider" />

          <LabelTooltip label="New folder">
            <Button variant="ghost" size="icon" className="atlas-am-icon-btn" onClick={onCreateFolder}>
              <FolderPlus />
            </Button>
          </LabelTooltip>
          <LabelTooltip label="Refresh">
            <Button variant="ghost" size="icon" className="atlas-am-icon-btn" onClick={onRefresh}>
              <RefreshCw />
            </Button>
          </LabelTooltip>

          <HeaderMenu
            label="Create"
            triggerClassName="atlas-asset-manager-create-btn"
            triggerVariant="default"
            iconTrigger
            triggerContent={<Plus />}
            items={[
              { key: 'token', label: 'Create Token', icon: <TokenIcon />, onSelect: onCreateTokens },
              { key: 'map', label: 'Add Map', icon: <MapIcon />, onSelect: onCreateMap },
              { key: 'collection', label: 'Create Collection', icon: <FolderOpen />, separated: true, onSelect: onCreateCollection },
            ]}
          />
        </div>
      </div>
    </header>
  );
}
