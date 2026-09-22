import type * as React from 'react';
import { useState, useCallback, useEffect, useMemo } from 'react';
import { TFolder, App as ObsidianApp } from 'obsidian';
import type { AnyAsset, Folder, Tag, Tab } from '../types';
import { ATLAS_VTT_DIR } from '../types';
import { AssetService, CollectionMetadata } from '../../../../services/AssetService';
import { TokenThumbnailService } from '../../../../services/TokenThumbnailService';
import { formatServiceAsset, partitionByTab, tokenThumbnailPaths, type TabServiceAsset } from '../utils/assetFormatters';
import { useAtlasUI } from '../../../../react/root/AtlasUIContext';
import { useOptionalAtlasStore } from '../../../../react/ViewStoreContext';
import { runInBackground } from '../../../../utils/backgroundTask';
import type { AtlasView } from '../../../../atlas-view';
import type { ViewAtlasState } from '../../../../storeFactory';

export interface AssetData {
  folders: Folder[];
  assets: AnyAsset[];
  availableTags: Tag[];
  collections: string[];
  assetCounts: Record<Tab, number>;
  assetService: AssetService | null;
  // Setters (exposed so context menus can mutate state)
  setFolders: React.Dispatch<React.SetStateAction<Folder[]>>;
  setAssets: React.Dispatch<React.SetStateAction<AnyAsset[]>>;
  setAvailableTags: React.Dispatch<React.SetStateAction<Tag[]>>;
  setCollections: React.Dispatch<React.SetStateAction<string[]>>;
  // Actions
  loadFoldersForActiveTab: () => Promise<void>;
  loadAssetsForActiveTab: () => Promise<void>;
  reloadGlobalTags: () => Promise<void>;
  // Store-provided
  app: ObsidianApp;
  view: AtlasView | null;
  addToken: ViewAtlasState['addToken'];
  setSelection: (ids: string[]) => void;
  mapPath: string | null;
}

// The global asset manager opens without a map view, so there is no store to spawn tokens into.
const addTokenWithoutMap = (): string => '';
const setSelectionWithoutMap = (): void => {};

export function useAssetData(
  activeTab: Tab,
  selectedCollection: string | null,
  isOpen: boolean
): AssetData {
  const { app, view } = useAtlasUI();
  const addToken = useOptionalAtlasStore((s) => s.addToken, addTokenWithoutMap);
  const setSelection = useOptionalAtlasStore((s) => s.setSelection, setSelectionWithoutMap);
  const mapPath = useOptionalAtlasStore((s) => s.mapPath, null);

  const [folders, setFolders] = useState<Folder[]>([]);
  const [assets, setAssets] = useState<AnyAsset[]>([]);
  const [availableTags, setAvailableTags] = useState<Tag[]>([]);
  const [collections, setCollections] = useState<string[]>(['Default']);
  const [assetService, setAssetService] = useState<AssetService | null>(null);
  const [assetCounts, setAssetCounts] = useState<Record<Tab, number>>({
    scenes: 0,
    maps: 0,
    encounters: 0,
    tokens: 0,
  });
  const thumbnails = useMemo(
    () => (assetService ? TokenThumbnailService.getInstance(app, assetService) : null),
    [app, assetService],
  );

  // ── Load folders ──────────────────────────────────────────────
  const loadFoldersForActiveTab = useCallback(async (): Promise<void> => {
    if (!app) return;
    const col = selectedCollection || 'default';
    try {
      const basePath = `${ATLAS_VTT_DIR}/collections/${col.toLowerCase()}/${activeTab}`;
      const baseFolder = app.vault.getAbstractFileByPath(basePath);
      if (baseFolder instanceof TFolder) {
        const loaded: Folder[] = [];
        const recurse = (folder: TFolder, parentId: string | null = null): void => {
          folder.children.forEach((child) => {
            if (child instanceof TFolder) {
              const obj: Folder = {
                id: `folder-${child.path}`,
                name: child.name,
                type: activeTab,
                path: child.path.substring(basePath.length + 1),
                parentId,
              };
              loaded.push(obj);
              recurse(child, obj.id);
            }
          });
        };
        recurse(baseFolder);
        setFolders(loaded);
      } else {
        setFolders([]);
      }
    } catch (error) {
      console.error('[useAssetData] Error loading folders:', error);
      setFolders([]);
    }
  }, [app, activeTab, selectedCollection]);

  // ── Load assets ───────────────────────────────────────────────
  const loadAssetsForActiveTab = useCallback(async (): Promise<void> => {
    if (!assetService || !app) return;
    try {
      const col = selectedCollection || 'default';
      const byTab = partitionByTab(await assetService.getAssets(col));
      const thumbnailPaths = tokenThumbnailPaths(byTab.tokens);
      const tabBase = `${ATLAS_VTT_DIR}/collections/${col.toLowerCase()}/${activeTab}`;
      const tabAssets: TabServiceAsset[] = byTab[activeTab];
      setAssets(tabAssets.map((a) => formatServiceAsset(a, tabBase, app, thumbnailPaths)));
      // Counts cover every tab so the tab bar never reflows when switching
      setAssetCounts({
        scenes: byTab.scenes.length,
        maps: byTab.maps.length,
        encounters: byTab.encounters.length,
        tokens: byTab.tokens.length,
      });
      thumbnails?.ensureThumbnails(byTab.tokens);
    } catch (error) {
      console.error('[useAssetData] Error loading assets:', error);
    }
  }, [assetService, app, activeTab, selectedCollection, thumbnails]);

  // ── Show thumbnails as they are generated ─────────────────────
  useEffect(() => {
    if (!thumbnails) return;
    return thumbnails.onUpdated(() => { void loadAssetsForActiveTab(); });
  }, [thumbnails, loadAssetsForActiveTab]);

  // ── Tags ──────────────────────────────────────────────────────
  const reloadGlobalTags = useCallback(async (): Promise<void> => {
    if (!assetService) return;
    try {
      const col = selectedCollection || 'default';
      const tags = await assetService.getCollectionTags(col);
      setAvailableTags(tags.map((t) => ({ id: t.id, name: t.name })));
    } catch (error) {
      console.error('[useAssetData] Error reloading tags:', error);
    }
  }, [assetService, selectedCollection]);

  // ── Initialize service ────────────────────────────────────────
  useEffect(() => {
    if (!app) return;
    const svc = AssetService.getInstance(app);
    const initialize = async (): Promise<void> => {
      await svc.initialize();
      setAssetService(svc);
      try {
        const col = selectedCollection || 'default';
        const tags = await svc.getCollectionTags(col);
        setAvailableTags(tags.map((t) => ({ id: t.id, name: t.name })));
      } catch { /* ignore */ }
      try {
        const cols = await svc.getCollections();
        setCollections(cols.map((c: CollectionMetadata) => c.name));
      } catch { /* ignore */ }
    };
    runInBackground(initialize(), 'Initializing asset service');
  }, [app]);

  // ── Reload tags on collection change ──────────────────────────
  useEffect(() => {
    if (assetService && isOpen) void reloadGlobalTags();
  }, [selectedCollection, assetService, reloadGlobalTags, isOpen]);

  // ── Refresh on open ───────────────────────────────────────────
  useEffect(() => {
    if (isOpen && assetService) {
      runInBackground(assetService.refreshMetadata().then(() => loadAssetsForActiveTab()), 'Refreshing asset metadata');
    }
  }, [isOpen, assetService, loadAssetsForActiveTab]);

  // ── Listen for refresh events ─────────────────────────────────
  useEffect(() => {
    if (!app || !assetService) return;
    const handler = async (): Promise<void> => {
      await assetService.refreshMetadata();
      await loadAssetsForActiveTab();
    };
    const refreshRef = app.workspace.on('atlas-vtt:refresh-assets', handler);
    return () => { app.workspace.offref(refreshRef); };
  }, [app, assetService, loadAssetsForActiveTab]);

  // ── Load on tab / collection change ───────────────────────────
  useEffect(() => {
    if (!assetService || !app) return;
    void loadFoldersForActiveTab();
    void loadAssetsForActiveTab();
  }, [assetService, activeTab, app, selectedCollection, loadAssetsForActiveTab, loadFoldersForActiveTab]);

  return {
    folders, assets, availableTags, collections, assetCounts, assetService,
    setFolders, setAssets, setAvailableTags, setCollections,
    loadFoldersForActiveTab, loadAssetsForActiveTab, reloadGlobalTags,
    app, view, addToken, setSelection, mapPath,
  };
}
