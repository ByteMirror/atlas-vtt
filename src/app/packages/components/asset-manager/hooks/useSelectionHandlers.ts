import type * as React from 'react';
import { useState, useEffect } from 'react';
import type { AnyAsset, Folder, Tab, SortOption, SortOrder, SelectionEvent } from '../types';
import { NavigationHistory } from '../NavigationHistory';

export interface SelectionState {
  selectedAssetIds: string[];
  selectedFolderIds: string[];
  selectedFolderId: string | null;
  selectedTagIds: string[];
  spawnCounts: Record<string, number>;
  navigationHistory: NavigationHistory;
  sortBy: SortOption;
  sortOrder: SortOrder;
  // Setters
  setSelectedAssetIds: React.Dispatch<React.SetStateAction<string[]>>;
  setSelectedFolderIds: React.Dispatch<React.SetStateAction<string[]>>;
  setSelectedFolderId: React.Dispatch<React.SetStateAction<string | null>>;
  setSelectedTagIds: React.Dispatch<React.SetStateAction<string[]>>;
  setSpawnCounts: React.Dispatch<React.SetStateAction<Record<string, number>>>;
  setSortBy: React.Dispatch<React.SetStateAction<SortOption>>;
  setSortOrder: React.Dispatch<React.SetStateAction<SortOrder>>;
  // Handlers
  handleAssetSelect: (assetId: string, event?: SelectionEvent, toggle?: boolean) => void;
  handleFolderSelect: (folderId: string | null) => void;
  handleFolderSelection: (folderId: string, event?: SelectionEvent) => void;
  handleFolderDoubleClick: (folderId: string) => void;
  handleNavigateBack: () => void;
  handleNavigateForward: () => void;
  handleNavigateToFolder: (folderId: string | null) => void;
  handleTagSelect: (tagId: string) => void;
  handleClearSelection: () => void;
  handleSpawnCountChange: (assetId: string, delta: number) => void;
  getFolderPath: (folderId: string) => Folder[];
}

export function useSelectionHandlers(
  displayedAssets: AnyAsset[],
  displayedFolders: Folder[],
  folders: Folder[],
  activeTab: Tab,
  isOpen: boolean
): SelectionState {
  const [selectedAssetIds, setSelectedAssetIds] = useState<string[]>([]);
  const [selectedFolderIds, setSelectedFolderIds] = useState<string[]>([]);
  const [selectedFolderId, setSelectedFolderId] = useState<string | null>(null);
  const [selectedTagIds, setSelectedTagIds] = useState<string[]>([]);
  const [spawnCounts, setSpawnCounts] = useState<Record<string, number>>({});
  const [sortBy, setSortBy] = useState<SortOption>('name');
  const [sortOrder, setSortOrder] = useState<SortOrder>('asc');
  const [navigationHistory] = useState(() => new NavigationHistory());

  // ── Clear on tab change ───────────────────────────────────────
  useEffect(() => {
    setSelectedAssetIds([]);
    setSelectedFolderIds([]);
    setSelectedFolderId(null);
    setSelectedTagIds([]);
  }, [activeTab]);

  // ── Handlers ──────────────────────────────────────────────────

  const handleAssetSelect = (assetId: string, event?: SelectionEvent, toggle = false): void => {
    const isShiftKey = event?.shiftKey;

    if (!isShiftKey && !toggle) {
      setSpawnCounts({});
      setSelectedAssetIds([assetId]);
      return;
    }

    if (!isShiftKey) {
      setSpawnCounts(({ [assetId]: _removed, ...rest }) => rest);
    }

    setSelectedAssetIds((prev) => {
      if (isShiftKey && prev.length > 0) {
        if (prev.includes(assetId)) {
          setSpawnCounts((p) => ({ ...p, [assetId]: (p[assetId] || 1) + 1 }));
          return prev;
        }
        const allIds = displayedAssets.map((a) => a.id);
        const lastIdx = allIds.indexOf(prev[prev.length - 1]!);
        const curIdx = allIds.indexOf(assetId);
        if (lastIdx !== -1 && curIdx !== -1) {
          const [lo, hi] = lastIdx < curIdx ? [lastIdx, curIdx] : [curIdx, lastIdx];
          return [...new Set([...prev, ...allIds.slice(lo, hi + 1)])];
        }
      }

      if (toggle) {
        return prev.includes(assetId) ? prev.filter((id) => id !== assetId) : [...prev, assetId];
      }

      return [assetId];
    });
  };

  const handleFolderSelect = (folderId: string | null): void => {
    setSelectedFolderId(folderId);
    setSelectedAssetIds([]);
    setSelectedFolderIds([]);
  };

  const handleFolderSelection = (folderId: string, event?: SelectionEvent): void => {
    setSelectedFolderIds((prev) => {
      const isShift = event?.shiftKey;
      const isCheckbox = event && (event.target as HTMLElement).tagName === 'INPUT';

      if (isShift && prev.length > 0) {
        if (prev.includes(folderId)) return prev.filter((id) => id !== folderId);
        const allIds = displayedFolders.map((f) => f.id);
        const lastIdx = allIds.indexOf(prev[prev.length - 1]!);
        const curIdx = allIds.indexOf(folderId);
        if (lastIdx !== -1 && curIdx !== -1) {
          const [lo, hi] = lastIdx < curIdx ? [lastIdx, curIdx] : [curIdx, lastIdx];
          return [...new Set([...prev, ...allIds.slice(lo, hi + 1)])];
        }
      }

      if (isCheckbox) {
        return prev.includes(folderId) ? prev.filter((id) => id !== folderId) : [...prev, folderId];
      }

      if (!isShift) return [folderId];
      return [folderId];
    });
  };

  const handleNavigateToFolder = (folderId: string | null): void => {
    if (folderId !== selectedFolderId) {
      setSelectedFolderId(folderId);
      navigationHistory.push(folderId);
      setSelectedAssetIds([]);
      setSelectedFolderIds([]);
    }
  };

  const handleFolderDoubleClick = (folderId: string): void => {
    handleNavigateToFolder(folderId);
  };

  const handleNavigateBack = (): void => {
    const prev = navigationHistory.back();
    if (prev !== undefined) {
      setSelectedFolderId(prev);
      setSelectedAssetIds([]);
      setSelectedFolderIds([]);
    }
  };

  const handleNavigateForward = (): void => {
    const next = navigationHistory.forward();
    if (next !== undefined) {
      setSelectedFolderId(next);
      setSelectedAssetIds([]);
      setSelectedFolderIds([]);
    }
  };

  const handleTagSelect = (tagId: string): void => {
    setSelectedTagIds((prev) =>
      prev.includes(tagId) ? prev.filter((id) => id !== tagId) : [...prev, tagId]
    );
  };

  const handleClearSelection = (): void => {
    setSelectedAssetIds([]);
    setSelectedFolderIds([]);
    setSpawnCounts({});
  };

  const handleSpawnCountChange = (assetId: string, delta: number): void => {
    setSpawnCounts((prev) => {
      const next = Math.max(1, (prev[assetId] || 1) + delta);
      if (next === 1) {
        const { [assetId]: _, ...rest } = prev;
        return rest;
      }
      return { ...prev, [assetId]: next };
    });
  };

  const getFolderPath = (folderId: string): Folder[] => {
    const path: Folder[] = [];
    let cur: string | null = folderId;
    let depth = 0;
    while (cur && depth < 10) {
      const f = folders.find((x) => x.id === cur);
      if (f) { path.unshift(f); cur = f.parentId || null; }
      else break;
      depth++;
    }
    return path;
  };

  // ── Select-all shortcut ───────────────────────────────────────
  useEffect(() => {
    if (!isOpen) return;
    const handler = (event: KeyboardEvent): void => {
      if ((event.metaKey || event.ctrlKey) && event.key === 'a') {
        event.preventDefault();
        const allA = displayedAssets.map((a) => a.id);
        const allF = displayedFolders.map((f) => f.id);
        const total = selectedAssetIds.length + selectedFolderIds.length;
        if (total === allA.length + allF.length) {
          setSelectedAssetIds([]);
          setSelectedFolderIds([]);
        } else {
          setSelectedAssetIds(allA);
          setSelectedFolderIds(allF);
        }
      }
    };
    document.addEventListener('keydown', handler);
    return () => document.removeEventListener('keydown', handler);
  }, [isOpen, displayedAssets, displayedFolders, selectedAssetIds.length, selectedFolderIds.length]);

  return {
    selectedAssetIds, selectedFolderIds, selectedFolderId, selectedTagIds,
    spawnCounts, navigationHistory, sortBy, sortOrder,
    setSelectedAssetIds, setSelectedFolderIds, setSelectedFolderId, setSelectedTagIds,
    setSpawnCounts, setSortBy, setSortOrder,
    handleAssetSelect, handleFolderSelect, handleFolderSelection,
    handleFolderDoubleClick, handleNavigateBack, handleNavigateForward,
    handleNavigateToFolder, handleTagSelect, handleClearSelection, handleSpawnCountChange,
    getFolderPath,
  };
}
