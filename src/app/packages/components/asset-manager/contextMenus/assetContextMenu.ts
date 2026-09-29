import type * as React from 'react';
import { App as ObsidianApp } from 'obsidian';
import type { ContextMenuEntry } from '../../../../react/components/context-menu/AtlasContextMenu';
import type {
  AnyAsset,
  CollectionOption,
  Folder,
  InputModalState,
  Tag as TagType,
} from '../types';
import {
  spawnEncounterTokens,
  spawnSelectedTokens,
  spawnTokenAsset,
  type SpawnContext,
} from '../utils/tokenSpawnService';
import { SPAWN_MULTIPLE_COUNTS } from '../utils/spawnCount';
import type { AssetService } from '../../../../services/AssetService';
import { renameScene } from '../../../../services/sceneRename';
import { TagSearchModal } from '../TagSearchModal';
import { runInBackground } from '../../../../utils/backgroundTask';
import { confirmAction } from '../../../../ui/confirmDialog';
import type { AtlasView } from '../../../../atlas-view';
import type { ViewAtlasState } from '../../../../storeFactory';
import { applyTokenDeleteImpact, describeTokenDeleteImpact, findTokenDeleteImpact } from '../utils/tokenDeleteImpact';
import { tokenSizeSubmenu } from '../../../../react/components/context-menu/tokenSizeMenu';
import type { TransferMode } from '../../../../services/assetTransfer/transferPlan';
import { t } from '../../../../i18n';

export interface AssetContextMenuDeps {
  app: ObsidianApp;
  view: AtlasView | null;
  addTokens: ViewAtlasState['addTokens'];
  setSelection: (ids: string[]) => void;
  assetService: AssetService | null;
  onClose: () => void;
  // State setters
  setEditingToken: (asset: AnyAsset | null) => void;
  setIsTokenCreatorOpen: (open: boolean) => void;
  setIsMoveModalOpen: (open: boolean) => void;
  setInputModalState: (state: InputModalState) => void;
  setAssets: React.Dispatch<React.SetStateAction<AnyAsset[]>>;
  setSelectedAssetIds: React.Dispatch<React.SetStateAction<string[]>>;
  loadAssetsForActiveTab: () => Promise<void>;
  handleCreateTag: (tag: string) => Promise<TagType | null>;
  setAssetTags: (asset: AnyAsset, tags: string[]) => Promise<void>;
  handleSaveAsEncounter: (tokenAssets: AnyAsset[]) => Promise<void>;
  openStatblockLinkModal: (asset: AnyAsset) => void;
  unlinkStatblock: (asset: AnyAsset) => Promise<void>;
  deleteAssetFromVault: (asset: { id: string; name: string }) => Promise<boolean>;
  transferToCollection: (assets: AnyAsset[], target: CollectionOption, mode: TransferMode) => void;
  // Data
  selectedAssetIds: string[];
  assets: AnyAsset[];
  folders: Folder[];
  availableTags: TagType[];
  /** Collections the assets can be moved or copied to. */
  transferTargets: CollectionOption[];
}

export function buildAssetContextMenuEntries(
  asset: AnyAsset,
  selectedAssets: AnyAsset[],
  deps: AssetContextMenuDeps
): ContextMenuEntry[] {
  const entries: ContextMenuEntry[] = [];
  const spawnCtx: SpawnContext = {
    app: deps.app,
    view: deps.view,
    addTokens: deps.addTokens,
    setSelection: deps.setSelection,
    assetService: deps.assetService,
  };

  // ── Spawn Encounter ───────────────────────────────────────────
  if (asset.type === 'encounters') {
    entries.push({
      type: 'item',
      label: t('am.menu.spawnEncounter'),
      icon: 'target',
      onClick: async () => {
        const ids = await spawnEncounterTokens(spawnCtx, asset);
        if (ids.length > 0) deps.onClose();
      },
    });
  }

  // ── Spawn Token(s) on Map ─────────────────────────────────────
  if (asset.type === 'tokens') {
    const spawnCount = selectedAssets.filter((a) => a.type === 'tokens').length;
    entries.push({
      type: 'item',
      label: spawnCount > 1 ? t('am.menu.spawnTokens', { count: spawnCount }) : t('am.menu.spawn'),
      icon: 'map-pin',
      onClick: async () => {
        const ids = await spawnSelectedTokens(spawnCtx, selectedAssets);
        if (ids.length > 0) deps.onClose();
      },
    });
    if (spawnCount <= 1) {
      entries.push({
        type: 'submenu',
        label: t('am.menu.spawnMultiple'),
        icon: 'copy-plus',
        children: SPAWN_MULTIPLE_COUNTS.map((count) => ({
          type: 'item' as const,
          label: t('am.menu.nTokens', { count }),
          onClick: async (): Promise<void> => {
            const ids = await spawnTokenAsset(spawnCtx, asset, count);
            if (ids.length > 0) deps.onClose();
          },
        })),
      });
    }
  }

  // ── Save as Encounter (multi-select tokens) ───────────────────
  if (asset.type === 'tokens' && selectedAssets.length > 1) {
    const tokenAssets = selectedAssets.filter((a) => a.type === 'tokens');
    entries.push({
      type: 'item',
      label: t('am.menu.saveAsEncounter', { count: tokenAssets.length }),
      icon: 'target',
      onClick: () => deps.handleSaveAsEncounter(tokenAssets),
    });
  }

  // ── Edit / Rename ─────────────────────────────────────────────
  if (asset.type === 'tokens') {
    entries.push({
      type: 'item',
      label: t('am.menu.editToken'),
      icon: 'edit',
      onClick: () => {
        deps.setEditingToken(asset);
        deps.setIsTokenCreatorOpen(true);
      },
    });
  } else {
    const label =
      asset.type === 'encounters' ? t('am.menu.renameEncounter')
      : asset.type === 'maps' ? t('am.menu.renameMap')
      : asset.type === 'scenes' ? t('am.menu.renameScene')
      : t('common.rename');

    entries.push({
      type: 'item',
      label,
      icon: 'edit',
      onClick: () => {
        deps.setInputModalState({
          isOpen: true,
          title: t('am.menu.renameTitle', { name: asset.name }),
          placeholder: t('am.menu.newName'),
          defaultValue: asset.name,
          onConfirm: (newName: string) => {
            if (newName.trim() === asset.name) return;
            if (asset.type === 'scenes') {
              const { assetService } = deps;
              if (!assetService) return;
              runInBackground(
                renameScene(deps.app, assetService, asset.id, newName).then(() => deps.loadAssetsForActiveTab()),
                `Renaming scene ${asset.id}`,
                t('am.menu.renameSceneFailed')
              );
              return;
            }
            deps.setAssets((prev) =>
              prev.map((a) => (a.id === asset.id ? { ...a, name: newName.trim() } : a))
            );
            if (deps.assetService) {
              runInBackground(
                deps.assetService.updateAsset(asset.id, { name: newName.trim() }),
                `Renaming asset ${asset.id}`
              );
            }
          },
        });
      },
    });
  }

  // ── Default size (all selected tokens) ────────────────────────
  if (asset.type === 'tokens') {
    const tokenIds = selectedAssets.filter((a) => a.type === 'tokens').map((a) => a.id);
    entries.push(tokenSizeSubmenu(asset.size, (size) => {
      deps.setAssets((prev) => prev.map((a) => (tokenIds.includes(a.id) ? { ...a, size } : a)));
      const service = deps.assetService;
      if (!service) return;
      for (const id of tokenIds) {
        runInBackground(service.updateAsset(id, { size }), `Updating size of asset ${id}`);
      }
    }));
  }

  // ── Statblock link (single token) ─────────────────────────────
  if (asset.type === 'tokens' && selectedAssets.length === 1) {
    const hasStatblock = Boolean(asset.statblockPath);
    entries.push({
      type: 'item',
      label: hasStatblock ? t('am.menu.changeStatblock') : t('am.menu.linkStatblock'),
      icon: 'file-text',
      onClick: () => deps.openStatblockLinkModal(asset),
    });
    if (hasStatblock) {
      entries.push({
        type: 'item',
        label: t('am.menu.unlinkStatblock'),
        icon: 'unlink',
        onClick: () => deps.unlinkStatblock(asset),
      });
    }
  }


  // ── Move to Folder ────────────────────────────────────────────
  if (deps.folders.filter((f) => f.type === asset.type).length > 0) {
    entries.push({
      type: 'item',
      label: t('am.menu.moveToFolder'),
      icon: 'folder',
      onClick: () => deps.setIsMoveModalOpen(true),
    });
  }

  // ── Move / Copy to another collection ─────────────────────────
  if (deps.transferTargets.length > 0) {
    const collectionSubmenu = (label: string, icon: string, mode: TransferMode): ContextMenuEntry => ({
      type: 'submenu',
      label,
      icon,
      children: deps.transferTargets.map((target) => ({
        type: 'item' as const,
        label: target.name,
        onClick: () => deps.transferToCollection(selectedAssets, target, mode),
      })),
    });
    entries.push(
      collectionSubmenu(t('am.menu.moveToCollection'), 'folder-input', 'move'),
      collectionSubmenu(t('am.menu.copyToCollection'), 'copy', 'copy'),
    );
  }


  // ── Tags ──────────────────────────────────────────────────────
  entries.push({
    type: 'item',
    label: t('am.menu.tags'),
    icon: 'tag',
    onClick: () => {
      const assetsToTag = deps.selectedAssetIds.includes(asset.id)
        ? deps.assets.filter((a) => deps.selectedAssetIds.includes(a.id))
        : [asset];

      const modal = new TagSearchModal(deps.app, {
        selectedAssets: assetsToTag,
        availableTags: deps.availableTags,
        allAssets: deps.assets,
        onToggleTag: (tagId: string, modalSelectedAssets: AnyAsset[]) => {
          for (const sa of modalSelectedAssets) {
            const currentTags = sa.tags || [];
            const newTags = currentTags.includes(tagId)
              ? currentTags.filter((t) => t !== tagId)
              : [...currentTags, tagId];
            void deps.setAssetTags(sa, newTags);
          }
        },
        onCreateTag: (tagName: string, modalSelectedAssets: AnyAsset[]) => {
          const applyNewTag = async (): Promise<void> => {
            const tag = await deps.handleCreateTag(tagName);
            if (!tag) return;
            await Promise.all(modalSelectedAssets
              .filter((sa) => !(sa.tags || []).includes(tag.id))
              .map((sa) => deps.setAssetTags(sa, [...(sa.tags || []), tag.id])));
          };
          runInBackground(applyNewTag(), `Creating tag ${tagName}`);
        },
      });
      modal.open();
    },
  });


  // ── Delete ────────────────────────────────────────────────────
  const deleteCount = selectedAssets.length;
  entries.push({
    type: 'item',
    label: deleteCount > 1 ? t('am.menu.deleteItems', { count: deleteCount }) : t('common.delete'),
    icon: 'trash',
    destructive: true,
    onClick: async () => {
      const msg = deleteCount > 1
        ? t('am.menu.confirmDeleteMany', { count: deleteCount })
        : t('am.menu.confirmDelete', { name: asset.name });
      const impact = deps.assetService
        ? await findTokenDeleteImpact(deps.app, deps.assetService, selectedAssets)
        : null;
      const confirmed = await confirmAction({
        title: deleteCount > 1 ? t('am.menu.deleteItemsTitle') : t('am.menu.deleteItemTitle'),
        message: [msg, ...(impact ? describeTokenDeleteImpact(impact) : [])],
        confirmLabel: t('common.delete'),
        destructive: true,
      });
      if (!confirmed) return;

      if (impact) await applyTokenDeleteImpact(deps.app, impact);
      for (const a of selectedAssets) {
        const ok = await deps.deleteAssetFromVault(a);
        if (ok) {
          deps.setAssets((prev) => prev.filter((x) => x.id !== a.id));
          deps.setSelectedAssetIds((prev) => prev.filter((id) => id !== a.id));
        }
      }
      await deps.loadAssetsForActiveTab();
    },
  });

  return entries;
}
