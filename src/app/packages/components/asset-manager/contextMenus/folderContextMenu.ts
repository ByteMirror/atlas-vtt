import type * as React from 'react';
import type { ContextMenuEntry } from '../../../../react/components/context-menu/AtlasContextMenu';
import type { AnyAsset, Folder } from '../types';
import { confirmAction } from '../../../../ui/confirmDialog';

export interface FolderContextMenuDeps {
  folders: Folder[];
  assets: AnyAsset[];
  setInputModalState: (state: any) => void;
  setFolders: React.Dispatch<React.SetStateAction<Folder[]>>;
  setAssets: React.Dispatch<React.SetStateAction<AnyAsset[]>>;
  setSelectedFolderIds: React.Dispatch<React.SetStateAction<string[]>>;
  handleFolderDoubleClick: (folderId: string) => void;
  deleteFolderFromVault: (folder: Folder) => Promise<void>;
}

export function buildFolderContextMenuEntries(
  folder: Folder,
  deps: FolderContextMenuDeps
): ContextMenuEntry[] {
  const entries: ContextMenuEntry[] = [];

  // Open / Navigate
  entries.push({
    type: 'item',
    label: 'Open',
    icon: 'folder-open',
    onClick: () => deps.handleFolderDoubleClick(folder.id),
  });

  entries.push({ type: 'separator' });

  // Rename
  entries.push({
    type: 'item',
    label: 'Rename',
    icon: 'edit',
    onClick: () => {
      deps.setInputModalState({
        isOpen: true,
        title: `Rename folder "${folder.name}"`,
        placeholder: 'Enter new folder name',
        defaultValue: folder.name,
        onConfirm: (newName: string) => {
          if (newName.trim() !== folder.name) {
            deps.setFolders((prev) =>
              prev.map((f) =>
                f.id === folder.id
                  ? { ...f, name: newName.trim(), path: newName.trim() }
                  : f
              )
            );
          }
        },
        validation: (value: string) => {
          const trimmed = value.trim();
          if (!trimmed) return 'Folder name cannot be empty';
          const siblings = deps.folders.filter(
            (f) => f.parentId === folder.parentId && f.id !== folder.id
          );
          if (siblings.some((f) => f.name === trimmed)) {
            return `A folder named "${trimmed}" already exists in this location`;
          }
          return null;
        },
      });
    },
  });

  // New Subfolder
  entries.push({
    type: 'item',
    label: 'New Subfolder',
    icon: 'folder-plus',
    onClick: () => {
      deps.setInputModalState({
        isOpen: true,
        title: 'Create New Subfolder',
        placeholder: 'Enter subfolder name',
        onConfirm: (subfolderName: string) => {
          const newFolder: Folder = {
            id: `folder-${Date.now()}`,
            name: subfolderName.trim(),
            type: folder.type,
            path: `${folder.path}/${subfolderName.trim()}`,
            parentId: folder.id,
          };
          deps.setFolders((prev) => [...prev, newFolder]);
        },
        validation: (value: string) => {
          const trimmed = value.trim();
          if (!trimmed) return 'Subfolder name cannot be empty';
          const children = deps.folders.filter((f) => f.parentId === folder.id);
          if (children.some((f) => f.name === trimmed)) {
            return `A subfolder named "${trimmed}" already exists`;
          }
          return null;
        },
      });
    },
  });

  entries.push({ type: 'separator' });

  // Move contents
  const otherFolders = deps.folders.filter(
    (f) => f.type === folder.type && f.id !== folder.id
  );
  if (otherFolders.length > 0) {
    entries.push({
      type: 'item',
      label: 'Move Contents to Root',
      icon: 'folder-input',
      onClick: () => {
        deps.setAssets((prev) =>
          prev.map((a) => (a.folderId === folder.id ? { ...a, folderId: null } : a))
        );
      },
    });

    otherFolders.slice(0, 5).forEach((target) => {
      entries.push({
        type: 'item',
        label: `Move Contents to "${target.name}"`,
        icon: 'folder-input',
        onClick: () => {
          deps.setAssets((prev) =>
            prev.map((a) => (a.folderId === folder.id ? { ...a, folderId: target.id } : a))
          );
        },
      });
    });
  }

  entries.push({ type: 'separator' });

  // Delete
  entries.push({
    type: 'item',
    label: 'Delete Folder',
    icon: 'trash',
    destructive: true,
    onClick: async () => {
      const assetsInFolder = deps.assets.filter((a) => a.folderId === folder.id);
      const message = [`Are you sure you want to delete the folder "${folder.name}"?`];
      if (assetsInFolder.length > 0) {
        message.push(`This folder contains ${assetsInFolder.length} asset${assetsInFolder.length !== 1 ? 's' : ''}. They will be moved to the parent folder.`);
      }
      const confirmed = await confirmAction({ title: 'Delete folder', message, confirmLabel: 'Delete', destructive: true });
      if (!confirmed) return;

      deps.setAssets((prev) =>
        prev.map((a) =>
          a.folderId === folder.id ? { ...a, folderId: folder.parentId || null } : a
        )
      );
      deps.setFolders((prev) => prev.filter((f) => f.id !== folder.id));
      deps.setSelectedFolderIds((prev) => prev.filter((id) => id !== folder.id));
      await deps.deleteFolderFromVault(folder);
    },
  });

  return entries;
}
