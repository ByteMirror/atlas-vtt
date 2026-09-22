import React from 'react';
import { Folder } from 'lucide-react';
import type { Folder as FolderType, SelectionEvent } from '../types';

export interface FolderGridItemProps {
  folder: FolderType;
  isSelected: boolean;
  isDropTarget: boolean;
  /** Whether a drag is in progress that could be dropped onto this folder. */
  canReceiveDrop: boolean;
  onSelection: (folderId: string, event?: SelectionEvent) => void;
  onOpen: (folderId: string) => void;
  onContextMenu: (folder: FolderType, event: React.MouseEvent) => void;
  onDragStart: (folderId: string, event: React.DragEvent) => void;
  onDragEnd: () => void;
  onDragOverTarget: (folderId: string | null) => void;
  onDrop: (folderId: string) => void;
}

/** One folder row of the content area; a drop target for assets and other folders. */
export function FolderGridItem({
  folder, isSelected, isDropTarget, canReceiveDrop,
  onSelection, onOpen, onContextMenu, onDragStart, onDragEnd, onDragOverTarget, onDrop,
}: FolderGridItemProps): React.JSX.Element {
  const keyHandler = (event: React.KeyboardEvent): void => {
    if (event.key !== 'Enter' && event.key !== ' ') return;
    if (event.shiftKey) onSelection(folder.id, event);
    else onOpen(folder.id);
  };

  return (
    <div
      className={`atlas-folder-grid-item ${isSelected ? 'atlas-selected' : ''} ${isDropTarget ? 'atlas-drop-target' : ''}`}
      onClick={(event) => onSelection(folder.id, event)}
      onDoubleClick={() => onOpen(folder.id)}
      onContextMenu={(event) => { event.preventDefault(); event.stopPropagation(); onContextMenu(folder, event); }}
      role="button"
      tabIndex={0}
      aria-selected={isSelected}
      onKeyDown={keyHandler}
      draggable
      onDragStart={(event) => onDragStart(folder.id, event)}
      onDragEnd={onDragEnd}
      onDragOver={(event) => {
        event.preventDefault();
        event.dataTransfer.dropEffect = 'move';
        if (canReceiveDrop) onDragOverTarget(folder.id);
      }}
      onDragLeave={() => onDragOverTarget(null)}
      onDrop={(event) => {
        event.preventDefault();
        event.stopPropagation();
        if (canReceiveDrop) onDrop(folder.id);
        onDragOverTarget(null);
      }}
    >
      <Folder className="atlas-folder-icon" />
      <span className="atlas-folder-name">{folder.name}</span>
    </div>
  );
}
