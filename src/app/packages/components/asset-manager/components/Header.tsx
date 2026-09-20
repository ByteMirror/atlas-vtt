import React, { useState, useRef, useEffect } from 'react';
import {
  Search, X, Plus, ChevronLeft, ChevronRight, FolderPlus, RefreshCw,
  ArrowUp, ArrowDown, PanelLeft,
  Gamepad2, Map as MapIcon, FolderOpen,
} from 'lucide-react';
import { Button } from '../../primitives/button';
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
        <Button
          variant="ghost"
          size="icon"
          className="atlas-am-icon-btn atlas-sidebar-toggle-btn"
          onClick={onToggleSidebar}
          title={isSidebarCollapsed ? 'Show sidebar' : 'Hide sidebar'}
          aria-label={isSidebarCollapsed ? 'Show sidebar' : 'Hide sidebar'}
        >
          <PanelLeft className={`atlas-toggle-icon ${isSidebarCollapsed ? 'atlas-rotated' : ''}`} />
        </Button>
        <Button
          variant="ghost"
          size="icon"
          className="atlas-am-icon-btn"
          onClick={sel.handleNavigateBack}
          disabled={!canGoBack}
          title="Back"
          aria-label="Back"
        >
          <ChevronLeft />
        </Button>
        <Button
          variant="ghost"
          size="icon"
          className="atlas-am-icon-btn"
          onClick={sel.handleNavigateForward}
          disabled={!canGoForward}
          title="Forward"
          aria-label="Forward"
        >
          <ChevronRight />
        </Button>

        {selectionCount > 0 ? (
          <>
            <div className="atlas-am-toolbar-divider" />
            <div className="atlas-selection-info">
              <span>{selectionCount} selected</span>
              <Button
                variant="ghost"
                size="icon"
                className="atlas-clear-selection-btn"
                onClick={sel.handleClearSelection}
                title="Clear selection"
                aria-label="Clear selection"
              >
                <X />
              </Button>
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
        <nav className="atlas-asset-manager-tabs" aria-label="Asset type">
          {tabs.map((tab, index) => (
            <button
              key={tab}
              type="button"
              className={`atlas-tab-button ${activeTab === tab ? 'atlas-active' : ''}`}
              onClick={() => onTabChange(tab)}
              title={`${getTabDisplayName(tab)} (⌘${index + 1})`}
              aria-current={activeTab === tab ? 'page' : undefined}
            >
              <span>{getTabDisplayName(tab)}</span>
              <span className="atlas-tab-count">{assetCounts[tab]}</span>
            </button>
          ))}
        </nav>
      </div>

      <div className="atlas-am-toolbar-right">
        <div className="atlas-asset-manager-search">
          <Search />
          <input
            type="text"
            value={search}
            placeholder="Search…"
            onChange={(e) => onSearch(e.target.value)}
            aria-label="Search assets"
          />
          {search && (
            <Button
              variant="ghost"
              size="icon"
              className="atlas-am-icon-btn"
              onClick={() => onSearch('')}
              aria-label="Clear search"
            >
              <X />
            </Button>
          )}
        </div>

        <Button
          variant="ghost"
          className="atlas-am-sort"
          onClick={cycleSort}
          title="Sort by (click to change)"
          aria-label={`Sort by ${SORT_LABELS[sel.sortBy]}`}
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
        <Button
          variant="ghost"
          size="icon"
          className="atlas-am-icon-btn"
          onClick={() => sel.setSortOrder(sel.sortOrder === 'asc' ? 'desc' : 'asc')}
          title={sel.sortOrder === 'asc' ? 'Ascending' : 'Descending'}
          aria-label="Toggle sort order"
        >
          {sel.sortOrder === 'asc' ? <ArrowUp /> : <ArrowDown />}
        </Button>

        <div className="atlas-am-toolbar-divider" />

        <Button
          variant="ghost"
          size="icon"
          className="atlas-am-icon-btn"
          onClick={onCreateFolder}
          title="New folder"
          aria-label="New folder"
        >
          <FolderPlus />
        </Button>
        <Button
          variant="ghost"
          size="icon"
          className="atlas-am-icon-btn"
          onClick={onRefresh}
          title="Refresh"
          aria-label="Refresh"
        >
          <RefreshCw />
        </Button>

        <div className="atlas-asset-manager-create-dropdown" ref={createRef}>
          <Button
            variant="default"
            size="icon"
            className={`atlas-asset-manager-create-btn ${isCreateOpen ? 'atlas-active' : ''}`}
            onClick={() => setIsCreateOpen(!isCreateOpen)}
            aria-label="Create"
            aria-expanded={isCreateOpen}
            title="Create"
          >
            <Plus />
          </Button>

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
