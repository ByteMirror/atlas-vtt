import type * as React from 'react';
import { useState } from 'react';
import { TFolder, TFile, App as ObsidianApp } from 'obsidian';
import type { AnyAsset, TokenAsset, Folder, Tab, InputModalState } from '../types';
import { ATLAS_VTT_DIR } from '../types';
import { saveEncounter, type EncounterTokenDraft } from '../../../../encounters/encounterSaveService';
import type { AssetService, CollectionMetadata } from '../../../../services/AssetService';
import { showAtlasToast } from '../../../../react/components/AtlasToast';
import { ensureFolder } from '../../../../plugin/vaultFolders';

/** Background and name carried over when a scene is created from a map asset. */
export interface CreateScenePrefill {
  backgroundPath: string | null;
  defaultName: string;
}

export interface AssetCrudActions {
  // Modal state
  isTokenCreatorOpen: boolean;
  isMapCreatorOpen: boolean;
  editingToken: AnyAsset | null;
  isCreateSceneModalOpen: boolean;
  createScenePrefill: CreateScenePrefill | null;
  isCreateFolderModalOpen: boolean;
  isMoveModalOpen: boolean;
  moveTargetFolderId: string | null;
  moveFolderSearch: string;
  moveFolderListOpen: boolean;
  targetFolderName: string;
  settingsModalCollectionId: string | null;
  inputModalState: InputModalState;
  // Setters
  setIsTokenCreatorOpen: (open: boolean) => void;
  setIsMapCreatorOpen: (open: boolean) => void;
  setEditingToken: (asset: AnyAsset | null) => void;
  setIsCreateSceneModalOpen: (open: boolean) => void;
  openCreateSceneModalFromMap: (prefill: CreateScenePrefill) => void;
  setIsCreateFolderModalOpen: (open: boolean) => void;
  setIsMoveModalOpen: (open: boolean) => void;
  setMoveTargetFolderId: (id: string | null) => void;
  setMoveFolderSearch: (s: string) => void;
  setMoveFolderListOpen: (open: boolean) => void;
  setTargetFolderName: (name: string) => void;
  setSettingsModalCollectionId: (id: string | null) => void;
  setInputModalState: (state: InputModalState) => void;
  // Handlers
  handleCreateFolder: () => void;
  handleCreateMap: () => void;
  handleCreateCollection: () => void;
  handleRefresh: () => Promise<void>;
  createFolderInVault: (folderName: string) => Promise<void>;
  deleteAssetFromVault: (asset: { id: string; name: string }) => Promise<boolean>;
  deleteFolderFromVault: (folder: Folder) => Promise<void>;
  moveAssetsToFolder: (assetIds: string[], targetFolderId: string | null) => Promise<void>;
  handleDrop: (targetFolderId: string | null) => void;
  handleSaveAsEncounter: (tokenAssets: AnyAsset[]) => Promise<void>;
  handleExportCollection: () => Promise<void>;
  handleImportCollection: () => void;
}

export function useAssetCrud(
  app: ObsidianApp,
  assetService: AssetService | null,
  activeTab: Tab,
  selectedCollection: string | null,
  selectedFolderId: string | null,
  folders: Folder[],
  assets: AnyAsset[],
  collections: string[],
  setFolders: React.Dispatch<React.SetStateAction<Folder[]>>,
  setAssets: React.Dispatch<React.SetStateAction<AnyAsset[]>>,
  setCollections: React.Dispatch<React.SetStateAction<string[]>>,
  setSelectedCollection: (c: string | null) => void,
  loadFoldersForActiveTab: () => Promise<void>,
  loadAssetsForActiveTab: () => Promise<void>,
  draggedItems: { type: 'asset' | 'folder'; ids: string[] } | null,
  setDraggedItems: React.Dispatch<React.SetStateAction<{ type: 'asset' | 'folder'; ids: string[] } | null>>,
  setDropTarget: React.Dispatch<React.SetStateAction<string | null>>
): AssetCrudActions {

  const [isTokenCreatorOpen, setIsTokenCreatorOpen] = useState(false);
  const [isMapCreatorOpen, setIsMapCreatorOpen] = useState(false);
  const [editingToken, setEditingToken] = useState<AnyAsset | null>(null);
  const [isCreateSceneModalOpen, setIsCreateSceneModalOpen] = useState(false);
  const [createScenePrefill, setCreateScenePrefill] = useState<CreateScenePrefill | null>(null);
  const [isCreateFolderModalOpen, setIsCreateFolderModalOpen] = useState(false);
  const [isMoveModalOpen, setIsMoveModalOpen] = useState(false);
  const [moveTargetFolderId, setMoveTargetFolderId] = useState<string | null>(null);
  const [moveFolderSearch, setMoveFolderSearch] = useState('');
  const [moveFolderListOpen, setMoveFolderListOpen] = useState(false);
  const [targetFolderName, setTargetFolderName] = useState('');
  const [settingsModalCollectionId, setSettingsModalCollectionId] = useState<string | null>(null);
  const [inputModalState, setInputModalState] = useState<InputModalState>({
    isOpen: false,
    title: '',
    onConfirm: () => {},
  });

  const handleCreateFolder = (): void => setIsCreateFolderModalOpen(true);
  const handleCreateMap = (): void => setIsMapCreatorOpen(true);
  const openCreateSceneModalFromMap = (prefill: CreateScenePrefill): void => {
    setCreateScenePrefill(prefill);
    setIsCreateSceneModalOpen(true);
  };

  const handleRefresh = async (): Promise<void> => {
    if (assetService && app) await loadAssetsForActiveTab();
  };

  const createFolderInVault = async (folderName: string): Promise<void> => {
    if (!folderName.trim() || !app) return;
    try {
      let path = `atlas-vtt/collections/${selectedCollection || 'default'}/${activeTab}`;
      if (selectedFolderId) {
        const parent = folders.find((f) => f.id === selectedFolderId);
        if (parent) path = `${path}/${parent.path}`;
      }
      path = `${path}/${folderName.trim()}`;

      await ensureFolder(app, path);

      const newFolder: Folder = {
        id: `folder-${path}`,
        name: folderName.trim(),
        type: activeTab,
        path: path.substring(`${ATLAS_VTT_DIR}/collections/${(selectedCollection || 'default').toLowerCase()}/${activeTab}/`.length),
        parentId: selectedFolderId,
      };
      setFolders((prev) => [...prev, newFolder]);
      setIsCreateFolderModalOpen(false);
      setTargetFolderName('');
      void loadAssetsForActiveTab();
    } catch (error) {
      console.error('[useAssetCrud] Error creating folder:', error);
    }
  };

  const deleteAssetFromVault = async (asset: { id: string; name: string }): Promise<boolean> => {
    if (!assetService) return false;
    try {
      await assetService.deleteAsset(asset.id);
      return true;
    } catch (error) {
      console.error('[useAssetCrud] Error deleting asset:', error);
      showAtlasToast(`Failed to delete asset "${asset.name}": ${error instanceof Error ? error.message : String(error)}`);
      return false;
    }
  };

  const deleteFolderFromVault = async (folder: Folder): Promise<void> => {
    if (!app) return;
    try {
      let folderPath = `atlas-vtt/collections/${selectedCollection || 'default'}/${folder.type}`;
      const buildFullPath = (f: Folder): string => {
        if (f.parentId) {
          const parent = folders.find((p) => p.id === f.parentId);
          if (parent) return `${buildFullPath(parent)}/${f.name}`;
        }
        return f.name;
      };
      if (folder.parentId) {
        const parent = folders.find((p) => p.id === folder.parentId);
        if (parent) folderPath = `${folderPath}/${buildFullPath(parent)}`;
      }
      folderPath = `${folderPath}/${folder.name}`;

      const folderFile = app.vault.getAbstractFileByPath(folderPath);
      if (folderFile instanceof TFolder && folderFile.children.length === 0) {
        await app.fileManager.trashFile(folderFile);
      }
    } catch (error) {
      console.error('[useAssetCrud] Error deleting folder:', error);
    }
  };

  const moveAssetsToFolder = async (assetIds: string[], targetFolderId: string | null): Promise<void> => {
    if (!app || !assetService) return;
    const col = selectedCollection || 'default';
    const tabBase = `${ATLAS_VTT_DIR}/collections/${col.toLowerCase()}/${activeTab}`;
    const targetDir = targetFolderId ? targetFolderId.replace('folder-', '') : tabBase;
    const movedPathById: Record<string, { path: string; field: 'imagePath' | 'filePath' }> = {};

    for (const id of assetIds) {
      const asset = assets.find((a) => a.id === id);
      if (!asset) continue;
      const pathField: 'imagePath' | 'filePath' | null =
        activeTab === 'tokens'
          ? 'imagePath'
          : activeTab === 'encounters'
            ? 'filePath'
            : null;
      if (!pathField) continue;

      const sourcePath = (() => {
        if (pathField === 'imagePath') {
          return (asset as any).imagePath as string | undefined;
        }
        return (
          (asset.filePath) ??
          `${tabBase}/${asset.id}.json`
        );
      })();
      if (!sourcePath) continue;

      const fileName = sourcePath.substring(sourcePath.lastIndexOf('/') + 1);
      const newPath = `${targetDir}/${fileName}`;
      if (newPath === sourcePath) continue;

      try {
        const file = app.vault.getAbstractFileByPath(sourcePath);
        if (!(file instanceof TFile)) continue;
        await app.vault.rename(file, newPath);
        movedPathById[id] = { path: newPath, field: pathField };
        await assetService.updateAsset(id, { [pathField]: newPath } as any);
      } catch (error) {
        console.error(`[useAssetCrud] Failed to move asset ${id}:`, error);
      }
    }

    const movedIds = new Set(Object.keys(movedPathById));
    setAssets((prev) =>
      prev.map((a) => {
        if (!movedIds.has(a.id)) return a;
        const moved = movedPathById[a.id]!;
        return { ...a, folderId: targetFolderId, [moved.field]: moved.path } as any;
      })
    );
  };

  const handleDrop = (targetFolderId: string | null): void => {
    if (!draggedItems) return;
    if (draggedItems.type === 'asset') {
      void moveAssetsToFolder(draggedItems.ids, targetFolderId);
    } else {
      setFolders((prev) =>
        prev.map((f) =>
          draggedItems.ids.includes(f.id) ? { ...f, parentId: targetFolderId } : f
        )
      );
    }
    setDraggedItems(null);
    setDropTarget(null);
  };

  const createCollection = async (name: string): Promise<void> => {
    if (!assetService) return;
    try {
      const created = await assetService.createCollection(name);
      const updated = await assetService.getCollections();
      setCollections(updated.map((c: CollectionMetadata) => c.name));
      setSelectedCollection(name);
      await loadFoldersForActiveTab();
      await loadAssetsForActiveTab();
      setSettingsModalCollectionId(created.id);
    } catch (error) {
      console.error('[useAssetCrud] Failed to create collection:', error);
      showAtlasToast('Could not create the collection');
    }
  };

  const handleCreateCollection = (): void => {
    setInputModalState({
      isOpen: true,
      title: 'Create New Collection',
      placeholder: 'Enter collection name',
      onConfirm: (name: string) => { void createCollection(name.trim()); },
      validation: (value: string) => {
        const trimmed = value.trim();
        if (!trimmed) return 'Collection name cannot be empty';
        if (collections.includes(trimmed)) return `Collection "${trimmed}" already exists`;
        return null;
      },
    });
  };

  const handleSaveAsEncounter = async (tokenAssets: AnyAsset[]): Promise<void> => {
    if (!assetService || !app) return;
    const drafts = tokenAssets.map((t): EncounterTokenDraft => {
      const token = t as TokenAsset;
      const draft: EncounterTokenDraft = { id: t.id, name: t.name, imagePath: token.imagePath || '', size: token.size || 1 };
      if (token.statblockPath) draft.statblockPath = token.statblockPath;
      return draft;
    });
    const saved = await saveEncounter(app, assetService, drafts);
    if (saved && activeTab === 'encounters') await loadAssetsForActiveTab();
  };

  const handleExportCollection = async (): Promise<void> => {
    if (!assetService || !selectedCollection) return;
    try {
      const cols = await assetService.getCollections();
      const match = cols.find((c: CollectionMetadata) => c.name === selectedCollection || c.id === selectedCollection);
      if (!match) return;
      const blob = await assetService.exportCollection(match.id);
      const url = URL.createObjectURL(blob);
      const a = createEl('a');
      a.href = url;
      a.download = `${match.name}.atlas-collection.zip`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
      showAtlasToast(`Exported "${match.name}"`);
    } catch (error) {
      console.error('[useAssetCrud] Export failed:', error);
      showAtlasToast('Export failed');
    }
  };

  const handleImportCollection = (): void => {
    const input = document.body.createEl('input', {
      type: 'file',
      cls: 'atlas-hidden-file-input',
      attr: { accept: '.zip' },
    });

    const importSelected = async (): Promise<void> => {
      const file = input.files?.[0];
      input.remove();
      if (!file || !assetService) return;
      try {
        await assetService.importCollection(file);
        const updated = await assetService.getCollections();
        setCollections(updated.map((c: CollectionMetadata) => c.name));
        await loadFoldersForActiveTab();
        await loadAssetsForActiveTab();
      } catch (error) {
        console.error('[useAssetCrud] Import failed:', error);
        showAtlasToast('Import failed');
      }
    };
    input.addEventListener('change', () => { void importSelected(); });
    input.addEventListener('cancel', () => input.remove());
    input.click();
  };

  return {
    isTokenCreatorOpen, isMapCreatorOpen, editingToken,
    isCreateSceneModalOpen, createScenePrefill,
    isCreateFolderModalOpen, isMoveModalOpen,
    moveTargetFolderId, moveFolderSearch, moveFolderListOpen,
    targetFolderName, settingsModalCollectionId, inputModalState,
    setIsTokenCreatorOpen, setIsMapCreatorOpen, setEditingToken,
    setIsCreateSceneModalOpen, openCreateSceneModalFromMap,
    setIsCreateFolderModalOpen, setIsMoveModalOpen,
    setMoveTargetFolderId, setMoveFolderSearch, setMoveFolderListOpen,
    setTargetFolderName, setSettingsModalCollectionId, setInputModalState,
    handleCreateFolder, handleCreateMap,
    handleCreateCollection, handleRefresh,
    createFolderInVault, deleteAssetFromVault, deleteFolderFromVault,
    moveAssetsToFolder, handleDrop, handleSaveAsEncounter,
    handleExportCollection, handleImportCollection,
  };
}
