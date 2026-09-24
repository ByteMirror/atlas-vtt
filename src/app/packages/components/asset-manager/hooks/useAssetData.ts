import type * as React from 'react';
import { useState, useCallback, useEffect, useMemo, useRef } from 'react';
import { TFolder, App as ObsidianApp } from 'obsidian';
import type { AnyAsset, CollectionOption, Folder, Tag, Tab } from '../types';
import { ATLAS_VTT_DIR } from '../types';
import { AssetService } from '../../../../services/AssetService';
import { AssetThumbnailService } from '../../../../services/AssetThumbnailService';
import { tagGroupOfTab, type TagsByGroup } from '../utils/assetTags';
import type { TagGroup } from '../../../../services/tagGroups';
import { formatServiceAsset, partitionByTab, tokenPreviewSources, type TabServiceAsset } from '../utils/assetFormatters';
import { useAtlasUI } from '../../../../react/root/AtlasUIContext';
import { useOptionalAtlasStore } from '../../../../react/ViewStoreContext';
import { runInBackground } from '../../../../utils/backgroundTask';
import type { AtlasView } from '../../../../atlas-view';
import type { ViewAtlasState } from '../../../../storeFactory';

export interface AssetData {
  folders: Folder[];
  assets: AnyAsset[];
  /** The tab `assets` were loaded for; lags `activeTab` while a tab switch loads. */
  assetsTab: Tab | null;
  /** Tags of the active tab's tag group. */
  availableTags: Tag[];
  tagsByGroup: TagsByGroup;
  collections: CollectionOption[];
  assetCounts: Record<Tab, number>;
  assetService: AssetService | null;
  // Setters (exposed so context menus can mutate state)
  setFolders: React.Dispatch<React.SetStateAction<Folder[]>>;
  setAssets: React.Dispatch<React.SetStateAction<AnyAsset[]>>;
  // Actions
  loadFoldersForActiveTab: () => Promise<void>;
  loadAssetsForActiveTab: () => Promise<void>;
  reloadGlobalTags: () => Promise<void>;
  reloadCollections: () => Promise<void>;
  // Store-provided
  app: ObsidianApp;
  view: AtlasView | null;
  addTokens: ViewAtlasState['addTokens'];
  setSelection: (ids: string[]) => void;
  mapPath: string | null;
}

// The global asset manager opens without a map view, so there is no store to spawn tokens into.
const addTokensWithoutMap = (): string[] => [];
const setSelectionWithoutMap = (): void => {};

export function useAssetData(
  activeTab: Tab,
  selectedCollection: string | null,
  isOpen: boolean
): AssetData {
  const { app, view } = useAtlasUI();
  const addTokens = useOptionalAtlasStore((s) => s.addTokens, addTokensWithoutMap);
  const setSelection = useOptionalAtlasStore((s) => s.setSelection, setSelectionWithoutMap);
  const mapPath = useOptionalAtlasStore((s) => s.mapPath, null);

  const [folders, setFolders] = useState<Folder[]>([]);
  const [assets, setAssets] = useState<AnyAsset[]>([]);
  const [assetsTab, setAssetsTab] = useState<Tab | null>(null);
  const [tagsByGroup, setTagsByGroup] = useState<TagsByGroup>({ tokens: [], maps: [] });
  const availableTags = tagsByGroup[tagGroupOfTab(activeTab)];
  const [collections, setCollections] = useState<CollectionOption[]>([]);
  const [assetService, setAssetService] = useState<AssetService | null>(null);
  const [assetCounts, setAssetCounts] = useState<Record<Tab, number>>({
    scenes: 0,
    maps: 0,
    encounters: 0,
    tokens: 0,
  });
  const thumbnails = useMemo(
    () => (assetService ? AssetThumbnailService.getInstance(app, assetService) : null),
    [app, assetService],
  );

  // ── Load folders ──────────────────────────────────────────────
  const loadFoldersForActiveTab = useCallback(async (): Promise<void> => {
    if (!app) return;
    const col = selectedCollection || 'default';
    try {
      const basePath = `${ATLAS_VTT_DIR}/collections/${col}/${activeTab}`;
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
      const previewSources = tokenPreviewSources(byTab.tokens);
      const tabBase = `${ATLAS_VTT_DIR}/collections/${col}/${activeTab}`;
      const tabAssets: TabServiceAsset[] = byTab[activeTab];
      setAssets(tabAssets.map((a) => formatServiceAsset(a, tabBase, app, previewSources)));
      setAssetsTab(activeTab);
      // Counts cover every tab so the tab bar never reflows when switching
      setAssetCounts({
        scenes: byTab.scenes.length,
        maps: byTab.maps.length,
        encounters: byTab.encounters.length,
        tokens: byTab.tokens.length,
      });
      thumbnails?.ensureThumbnails([...byTab.tokens, ...byTab.maps]);
    } catch (error) {
      console.error('[useAssetData] Error loading assets:', error);
      setAssetsTab(activeTab);
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
      const load = async (group: TagGroup): Promise<Tag[]> =>
        (await assetService.getCollectionTags(col, group)).map((t) => ({ id: t.id, name: t.name }));
      setTagsByGroup({ tokens: await load('tokens'), maps: await load('maps') });
    } catch (error) {
      console.error('[useAssetData] Error reloading tags:', error);
    }
  }, [assetService, selectedCollection]);

  // ── Collections ───────────────────────────────────────────────
  const reloadCollections = useCallback(async (): Promise<void> => {
    if (!assetService) return;
    const loaded = await assetService.getCollections();
    setCollections(loaded.map(({ id, uid, name }) => ({ id, uid, name })));
  }, [assetService]);

  // ── Initialize service ────────────────────────────────────────
  useEffect(() => {
    if (!app) return;
    const svc = AssetService.getInstance(app);
    const initialize = async (): Promise<void> => {
      await svc.initialize();
      setAssetService(svc);
    };
    runInBackground(initialize(), 'Initializing asset service');
  }, [app]);

  useEffect(() => {
    runInBackground(reloadCollections(), 'Loading collections');
  }, [reloadCollections]);

  // ── Reload tags on collection change ──────────────────────────
  useEffect(() => {
    if (assetService && isOpen) void reloadGlobalTags();
  }, [assetService, reloadGlobalTags, isOpen]);

  // ── Refresh from disk on open and on refresh events ───────────
  // Reading the index from disk takes a while, and the selection may change
  // meanwhile (an import selects its collection, then announces it). The
  // reload afterwards therefore always uses the current selection.
  const showLoaded = useCallback(async (): Promise<void> => {
    await reloadCollections();
    await loadAssetsForActiveTab();
  }, [reloadCollections, loadAssetsForActiveTab]);
  const latestShowLoaded = useRef(showLoaded);
  useEffect(() => { latestShowLoaded.current = showLoaded; }, [showLoaded]);

  const refreshFromDisk = useCallback(async (): Promise<void> => {
    if (!assetService) return;
    await assetService.refreshMetadata();
    await latestShowLoaded.current();
  }, [assetService]);

  useEffect(() => {
    if (isOpen) runInBackground(refreshFromDisk(), 'Refreshing asset metadata');
  }, [isOpen, refreshFromDisk]);

  useEffect(() => {
    if (!app) return;
    const refreshRef = app.workspace.on('atlas-vtt:refresh-assets', () => runInBackground(refreshFromDisk(), 'Refreshing asset metadata'));
    return () => { app.workspace.offref(refreshRef); };
  }, [app, refreshFromDisk]);

  // ── Load on tab / collection change ───────────────────────────
  useEffect(() => {
    if (!assetService || !app) return;
    void loadFoldersForActiveTab();
    void loadAssetsForActiveTab();
  }, [assetService, activeTab, app, selectedCollection, loadAssetsForActiveTab, loadFoldersForActiveTab]);

  return {
    folders, assets, assetsTab, availableTags, tagsByGroup, collections, assetCounts, assetService,
    setFolders, setAssets,
    loadFoldersForActiveTab, loadAssetsForActiveTab, reloadGlobalTags, reloadCollections,
    app, view, addTokens, setSelection, mapPath,
  };
}
