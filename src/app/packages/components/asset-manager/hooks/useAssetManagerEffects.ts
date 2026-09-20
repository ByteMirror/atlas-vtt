import { useEffect } from 'react';
import type { Tab } from '../types';
import { tabs } from '../types';
import type { AssetData } from './useAssetData';
import type { SelectionState } from './useSelectionHandlers';
import type { AssetCrudActions } from './useAssetCrud';
import type { TagsAndCollectionsState } from './useTagsAndCollections';
import type { StatblockLinkState } from './useStatblockLink';
import { isShortcutScopeActive } from '../../../../utils/activeLeafGuard';
import { matchesMapHotkey } from '../../../../keyboard/mapHotkeys';
import { SettingsService } from '../../../../services/SettingsService';

interface EffectDeps {
  isOpen: boolean;
  onClose: () => void;
  initialTab: Tab | undefined;
  modalRef: React.RefObject<HTMLDivElement | null>;
  containerRef: React.RefObject<HTMLDivElement | null>;
  setSearch: (s: string) => void;
  setActiveTab: (tab: Tab) => void;
  setIsSidebarCollapsed: (collapsed: boolean) => void;
  setSelectedCollection: (col: string | null) => void;
  data: AssetData;
  sel: SelectionState;
  crud: AssetCrudActions;
  tags: TagsAndCollectionsState;
  statblock: StatblockLinkState;
}

export function useAssetManagerEffects({
  isOpen, onClose, initialTab,
  modalRef, containerRef,
  setSearch, setActiveTab, setIsSidebarCollapsed, setSelectedCollection,
  data, sel, crud, tags, statblock,
}: EffectDeps): void {
  const isAnySubModalOpen =
    crud.isTokenCreatorOpen || crud.isMapCreatorOpen ||
    crud.isCreateSceneModalOpen || crud.inputModalState.isOpen ||
    crud.isMoveModalOpen || crud.settingsModalCollectionId !== null ||
    tags.isTagManagerOpen || tags.isEditTagsModalOpen ||
    statblock.linkingStatblockAsset !== null;

  useEffect(() => {
    if (!isOpen) return;
    setSearch('');
    setActiveTab(initialTab || 'tokens');
    // Reset persisted filters so reopening doesn't stay scoped to stale folder/tag state.
    sel.setSelectedAssetIds([]);
    sel.setSelectedFolderIds([]);
    sel.setSelectedFolderId(null);
    sel.setSelectedTagIds([]);
    sel.setSpawnCounts({});

    sel.navigationHistory.clear();
    sel.navigationHistory.push(null);

    if (data.assetService && data.mapPath) {
      const mapCol = data.assetService.getCollectionForMap(data.mapPath);
      if (mapCol) setSelectedCollection(mapCol);
    }
  }, [isOpen]);

  useEffect(() => {
    if (!isOpen) return;
    const check = (): void => { if (window.innerWidth < 768) setIsSidebarCollapsed(true); };
    check();
    window.addEventListener('resize', check);
    return () => window.removeEventListener('resize', check);
  }, [isOpen]);

  useEffect(() => {
    if (!isOpen || isAnySubModalOpen) return;
    modalRef.current?.focus();
    const handler = (e: KeyboardEvent): void => {
      if (document.querySelector('.atlas-onboarding-overlay')) return;
      if (!isShortcutScopeActive(modalRef.current)) return;
      // Map shortcuts are suspended while this modal is open, so it owns closing
      // via the asset-manager binding. Consume the event before it reaches the map.
      if (!e.defaultPrevented && matchesMapHotkey(e, 'assets', SettingsService.forApp(data.app))) {
        const target = e.target as Element | null;
        if (target?.closest?.('input, textarea, select, [contenteditable]:not([contenteditable="false"]), .cm-editor, [role="textbox"]')) return;
        if (document.querySelector('.modal-container, .prompt, .suggestion-container, .menu, .atlas-ctx-menu')) return;
        e.preventDefault();
        onClose();
        return;
      }
      if (e.key === 'Escape') {
        if (sel.selectedAssetIds.length > 0) {
          sel.setSelectedAssetIds([]);
          e.preventDefault();
          return;
        }
        onClose();
      }
      if ((e.metaKey || e.ctrlKey) && e.key >= '1' && e.key <= '4') {
        const idx = parseInt(e.key) - 1;
        if (idx < tabs.length) { setActiveTab(tabs[idx]!); e.preventDefault(); }
      }
    };
    document.addEventListener('keydown', handler);
    return () => document.removeEventListener('keydown', handler);
  }, [isOpen, onClose, sel.selectedAssetIds, isAnySubModalOpen, data.app]);

  useEffect(() => {
    if (!isOpen) return;
    const handler = (e: MouseEvent): void => {
      if (isAnySubModalOpen) return;
      const t = e.target as Element;
      if (
        t.closest('.atlas-onboarding-overlay') || t.closest('.menu') || t.closest('.atlas-ctx-menu') ||
        t.closest('.modal-container') || t.closest('.modal') ||
        t.closest('.atlas-text-dialog-backdrop') ||
        t.closest('.atlas-collection-settings-overlay')
      ) return;
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        onClose();
        sel.setSelectedAssetIds([]);
        sel.setSelectedFolderIds([]);
        sel.setSelectedTagIds([]);
        crud.setEditingToken(null);
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [isOpen, onClose, isAnySubModalOpen]);

  useEffect(() => {
    const handler = (event: CustomEvent): void => {
      if (!event.detail?.map) return;
      crud.openCreateSceneModalFromMap({
        backgroundPath: event.detail.backgroundPath ?? null,
        defaultName: event.detail.defaultName ?? event.detail.map.name,
      });
    };
    window.addEventListener('create-scene-from-map', handler as EventListener);
    return () => window.removeEventListener('create-scene-from-map', handler as EventListener);
  }, []);
}
