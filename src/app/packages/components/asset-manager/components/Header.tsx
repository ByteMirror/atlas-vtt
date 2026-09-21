import React, { useState, useRef, useEffect, useId } from 'react';
import {
  Search, X, Plus, ChevronLeft, ChevronRight, FolderPlus, RefreshCw,
  ArrowUp, ArrowDown, PanelLeft,
  Gamepad2, Map as MapIcon, FolderOpen,
} from 'lucide-react';
import { Button } from '../../primitives/button';
import { LabelTooltip } from '../../primitives/tooltip';
import type { Tab, SortOption } from '../types';
import { tabs, getTabDisplayName } from '../types';
import type { SelectionState } from '../hooks/useSelectionHandlers';
import { Breadcrumb } from './Breadcrumb';

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
  isSidebarCollapsed: boolean;
  onToggleSidebar: () => void;
  sel: Pick<
    SelectionState,
    'navigationHistory' | 'handleNavigateBack' | 'handleNavigateForward' |
    'selectedAssetIds' | 'selectedFolderIds' | 'handleClearSelection' |
    'selectedFolderId' | 'getFolderPath' | 'handleNavigateToFolder' |
    'sortBy' | 'setSortBy' | 'sortOrder' | 'setSortOrder'
  >;
}

const SORT_ORDER: SortOption[] = ['name', 'date', 'type'];
const SORT_LABELS: Record<SortOption, string> = {
  name: 'Name',
  date: 'Date modified',
  type: 'Type',
};

interface CreateOption {
  label: string;
  icon: React.ReactNode;
  onSelect: (() => void) | undefined;
}

/**
 * Single-row toolbar: navigation and breadcrumb on the left, tabs in the
 * centre, search / sort / folder / create on the right.
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
  isSidebarCollapsed,
  onToggleSidebar,
  sel,
}: HeaderProps): React.JSX.Element {
  const [isCreateOpen, setIsCreateOpen] = useState(false);
  const createRef = useRef<HTMLDivElement>(null);
  const tabsLabelId = useId();
  const searchLabelId = useId();

  useEffect(() => {
    if (!isCreateOpen) return;
    const handleClickOutside = (event: MouseEvent): void => {
      if (createRef.current && !createRef.current.contains(event.target as Node)) {
        setIsCreateOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [isCreateOpen]);

  const selectionCount = sel.selectedAssetIds.length + sel.selectedFolderIds.length;
  const canGoBack = sel.navigationHistory.canGoBack();
  const canGoForward = sel.navigationHistory.canGoForward();

  const createOptions: CreateOption[] = [
    { label: 'Create Token', icon: <Gamepad2 />, onSelect: onCreateTokens },
    { label: 'Add Map', icon: <MapIcon />, onSelect: onCreateMap },
  ];

  const cycleSort = (): void => {
    const next = SORT_ORDER[(SORT_ORDER.indexOf(sel.sortBy) + 1) % SORT_ORDER.length]!;
    sel.setSortBy(next);
  };

  const runCreate = (action: (() => void) | undefined): void => {
    action?.();
    setIsCreateOpen(false);
  };

  return (
    <header className="atlas-asset-manager-header">
      <div className="atlas-am-toolbar-left">
        <LabelTooltip label={isSidebarCollapsed ? 'Show sidebar' : 'Hide sidebar'}>
          <Button
            variant="ghost"
            size="icon"
            className="atlas-am-icon-btn atlas-sidebar-toggle-btn"
            onClick={onToggleSidebar}
          >
            <PanelLeft className={`atlas-toggle-icon ${isSidebarCollapsed ? 'atlas-rotated' : ''}`} />
          </Button>
        </LabelTooltip>
        <LabelTooltip label="Back">
          <Button
            variant="ghost"
            size="icon"
            className="atlas-am-icon-btn"
            onClick={sel.handleNavigateBack}
            disabled={!canGoBack}
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
            disabled={!canGoForward}
          >
            <ChevronRight />
          </Button>
        </LabelTooltip>

        {selectionCount > 0 ? (
          <>
            <div className="atlas-am-toolbar-divider" />
            <div className="atlas-selection-info">
              <span>{selectionCount} selected</span>
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
        ) : sel.selectedFolderId ? (
          <>
            <div className="atlas-am-toolbar-divider" />
            <Breadcrumb
              activeTab={activeTab}
              selectedFolderId={sel.selectedFolderId}
              getFolderPath={sel.getFolderPath}
              onNavigateToFolder={sel.handleNavigateToFolder}
            />
          </>
        ) : null}
      </div>

      <div className="atlas-am-toolbar-center">
        <nav className="atlas-asset-manager-tabs" aria-labelledby={tabsLabelId}>
          <span id={tabsLabelId} hidden>Asset type</span>
          {tabs.map((tab, index) => (
            <LabelTooltip key={tab} label={`${getTabDisplayName(tab)} (⌘${index + 1})`}>
              <button
                type="button"
                className={`atlas-tab-button ${activeTab === tab ? 'atlas-active' : ''}`}
                onClick={() => onTabChange(tab)}
                aria-current={activeTab === tab ? 'page' : undefined}
              >
                <span>{getTabDisplayName(tab)}</span>
                <span className="atlas-tab-count">{assetCounts[tab]}</span>
              </button>
            </LabelTooltip>
          ))}
        </nav>
      </div>

      <div className="atlas-am-toolbar-right">
        <div className="atlas-asset-manager-search">
          <Search />
          <span id={searchLabelId} hidden>Search assets</span>
          <input
            type="text"
            value={search}
            placeholder="Search…"
            onChange={(e) => onSearch(e.target.value)}
            aria-labelledby={searchLabelId}
          />
          {search && (
            <LabelTooltip label="Clear search">
              <Button
                variant="ghost"
                size="icon"
                className="atlas-am-icon-btn"
                onClick={() => onSearch('')}
              >
                <X />
              </Button>
            </LabelTooltip>
          )}
        </div>

        <LabelTooltip label={`Sort by ${SORT_LABELS[sel.sortBy]} (click to change)`}>
          <Button
            variant="ghost"
            className="atlas-am-sort"
            onClick={cycleSort}
          >
            {/* Every label is rendered in the same cell so the button is always as wide as the longest one */}
            <span className="atlas-am-sort-stack">
              {SORT_ORDER.map((option) => (
                <span key={option} aria-hidden={option !== sel.sortBy} className={option === sel.sortBy ? 'atlas-current' : ''}>
                  {SORT_LABELS[option]}
                </span>
              ))}
            </span>
          </Button>
        </LabelTooltip>
        <LabelTooltip label={sel.sortOrder === 'asc' ? 'Ascending' : 'Descending'}>
          <Button
            variant="ghost"
            size="icon"
            className="atlas-am-icon-btn"
            onClick={() => sel.setSortOrder(sel.sortOrder === 'asc' ? 'desc' : 'asc')}
          >
            {sel.sortOrder === 'asc' ? <ArrowUp /> : <ArrowDown />}
          </Button>
        </LabelTooltip>

        <div className="atlas-am-toolbar-divider" />

        <LabelTooltip label="New folder">
          <Button
            variant="ghost"
            size="icon"
            className="atlas-am-icon-btn"
            onClick={onCreateFolder}
          >
            <FolderPlus />
          </Button>
        </LabelTooltip>
        <LabelTooltip label="Refresh">
          <Button
            variant="ghost"
            size="icon"
            className="atlas-am-icon-btn"
            onClick={onRefresh}
          >
            <RefreshCw />
          </Button>
        </LabelTooltip>

        <div className="atlas-asset-manager-create-dropdown" ref={createRef}>
          <LabelTooltip label="Create">
            <Button
              variant="default"
              size="icon"
              className={`atlas-asset-manager-create-btn ${isCreateOpen ? 'atlas-active' : ''}`}
              onClick={() => setIsCreateOpen(!isCreateOpen)}
              aria-expanded={isCreateOpen}
            >
              <Plus />
            </Button>
          </LabelTooltip>

          {isCreateOpen && (
            <div className="atlas-asset-manager-create-dropdown-content" role="menu">
              {createOptions.map((option) => (
                <button
                  key={option.label}
                  type="button"
                  role="menuitem"
                  className="atlas-asset-manager-create-option"
                  onClick={() => runCreate(option.onSelect)}
                >
                  {option.icon}
                  <span>{option.label}</span>
                </button>
              ))}
              <div className="atlas-asset-manager-create-divider" />
              <button
                type="button"
                role="menuitem"
                className="atlas-asset-manager-create-option"
                onClick={() => runCreate(onCreateCollection)}
              >
                <FolderOpen />
                <span>Create Collection</span>
              </button>
            </div>
          )}
        </div>
      </div>
    </header>
  );
}
