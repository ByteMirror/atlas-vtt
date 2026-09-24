import React, { useCallback, useState } from 'react';
import { Plus } from 'lucide-react';
import { openContextMenuGlobal } from '../../root/ContextMenuContext';
import type { SceneSnapshotEntry } from '../../../snapshots/SceneSnapshotService';
import { SnapshotCard } from './SnapshotCard';
import { useSceneSnapshots } from './useSceneSnapshots';

interface SceneSnapshotsPanelProps {
  /** Called right before a snapshot replaces the map, so the palette can close. */
  onRestore: () => void;
}

/**
 * The command palette page for the open scene's snapshots: a tile that saves
 * one under a default name, then the snapshots newest first.
 */
export function SceneSnapshotsPanel({ onRestore }: SceneSnapshotsPanelProps): React.ReactElement {
  const { entries, isLoading, isBusy, thumbnailUrl, save, restore, overwrite, rename, remove } = useSceneSnapshots(onRestore);
  const [renamingId, setRenamingId] = useState<string | null>(null);

  const finishRename = useCallback((entry: SceneSnapshotEntry, name: string | null): void => {
    setRenamingId(null);
    if (name !== null) void rename(entry, name);
  }, [rename]);

  const openMenu = useCallback((entry: SceneSnapshotEntry, event: React.MouseEvent): void => {
    event.preventDefault();
    openContextMenuGlobal([
      { type: 'item', label: 'Restore', icon: 'history', onClick: () => restore(entry) },
      { type: 'item', label: 'Overwrite with current map', icon: 'refresh-cw', onClick: () => overwrite(entry) },
      { type: 'item', label: 'Rename', icon: 'pencil', onClick: () => setRenamingId(entry.snapshot.id) },
      { type: 'separator' },
      { type: 'item', label: 'Delete', icon: 'trash-2', destructive: true, onClick: () => remove(entry) },
    ], { x: event.clientX, y: event.clientY });
  }, [overwrite, remove, restore]);

  return (
    <div className="atlas-snapshots">
      <div className="atlas-snapshots-grid">
        <button type="button" className="atlas-snapshot-new" disabled={isBusy} onClick={() => void save()}>
          <Plus />
          <span>New snapshot</span>
        </button>
        {entries.map((entry) => (
          <SnapshotCard
            key={entry.snapshot.id}
            entry={entry}
            thumbnailUrl={thumbnailUrl(entry)}
            disabled={isBusy}
            isRenaming={renamingId === entry.snapshot.id}
            onRestore={(target) => void restore(target)}
            onStartRename={(target) => setRenamingId(target.snapshot.id)}
            onFinishRename={finishRename}
            onContextMenu={openMenu}
          />
        ))}
      </div>
      {entries.length === 0 && !isLoading && (
        <p className="atlas-snapshots-hint">
          No snapshots yet. Save the map as it is now to reset it to this state later, for example before an encounter starts.
        </p>
      )}
    </div>
  );
}
