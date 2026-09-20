import React, { useState, useEffect } from 'react';
import { MoreVertical } from 'lucide-react';
import { App, Notice } from 'obsidian';
import { getActiveWorkspaceLeaf } from '../../utils/embeddedLeafFocus';
import { openContextMenuGlobal, type ContextMenuEntry } from '../root/ContextMenuContext';

interface ViewActionsMenuProps {
  app: App;
  filePath?: string | undefined;
}

export const ViewActionsMenu: React.FC<ViewActionsMenuProps> = ({ app, filePath }) => {
  const [isVisible, setIsVisible] = useState(false);

  useEffect(() => {
    // mount tracking (no-op)
  }, []);

  const showMenu = (e: React.MouseEvent): void => {
    e.preventDefault();
    e.stopPropagation();

    let activeLeaf = getActiveWorkspaceLeaf(app.workspace);

    if (filePath && activeLeaf) {
      const leaves = app.workspace.getLeavesOfType('atlas-vtt');
      const matchingLeaf = leaves.find(leaf => {
        const view = leaf.view as any;
        return view?.file?.path === filePath;
      });
      if (matchingLeaf) activeLeaf = matchingLeaf;
    }

    if (!activeLeaf) return;

    const entries: ContextMenuEntry[] = [
      { type: 'item', label: 'Split right', icon: 'separator-vertical', onClick: () => app.workspace.createLeafBySplit(activeLeaf, 'vertical') },
      { type: 'item', label: 'Split down', icon: 'separator-horizontal', onClick: () => app.workspace.createLeafBySplit(activeLeaf, 'horizontal') },
      { type: 'separator' },
      { type: 'item', label: 'Move to new window', icon: 'maximize', onClick: () => app.workspace.moveLeafToPopout(activeLeaf) },
      { type: 'separator' },
    ];

    if (filePath) {
      entries.push(
        {
          type: 'item', label: 'Reveal in file explorer', icon: 'folder-open',
          onClick: async () => {
            const file = app.vault.getAbstractFileByPath(filePath);
            if (file) await (app as any).showInFolder(file.path);
          },
        },
        {
          type: 'item', label: 'Copy file path', icon: 'copy',
          onClick: () => {
            navigator.clipboard.writeText(filePath).then(
              () => new Notice('File path copied to clipboard'),
              (error: unknown) => {
                console.error('[ViewActionsMenu] Copying the file path failed:', error);
                new Notice('Could not copy the file path');
              },
            );
          },
        },
        { type: 'separator' },
        {
          type: 'item', label: 'Rename...', icon: 'pencil',
          onClick: async () => {
            const file = app.vault.getAbstractFileByPath(filePath);
            if (file) {
              const fileManager = app.fileManager as any;
              if (typeof fileManager.promptForFileRename === 'function') {
                fileManager.promptForFileRename(file);
              }
            }
          },
        },
        {
          type: 'item', label: 'Delete', icon: 'trash', destructive: true,
          onClick: async () => {
            const file = app.vault.getAbstractFileByPath(filePath);
            if (file) await app.fileManager.trashFile(file);
          },
        },
      );
    }

    entries.push(
      { type: 'separator' },
      { type: 'item', label: 'Close', icon: 'x', onClick: () => activeLeaf.detach() },
    );

    const rect = (e.target as HTMLElement).getBoundingClientRect();
    openContextMenuGlobal(entries, { x: rect.right, y: rect.bottom });
  };

  return (
    <div
      className="atlas-view-actions"
      onMouseEnter={() => setIsVisible(true)}
      onMouseLeave={() => setIsVisible(false)}
    >
      <button
        className={`atlas-view-actions-btn clickable-icon view-action ${isVisible ? 'visible' : ''}`}
        onClick={showMenu}
        title="More options"
      >
        <MoreVertical size={16} />
      </button>
    </div>
  );
}
