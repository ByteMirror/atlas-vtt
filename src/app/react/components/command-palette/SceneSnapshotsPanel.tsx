import React from 'react';
import { Plus } from 'lucide-react';
import { useAtlasUI } from '../../root/AtlasUIContext';
import { SnapshotCard } from './SnapshotCard';
import { useSceneSnapshots } from './useSceneSnapshots';

interface SceneSnapshotsPanelProps {
  /** Called right before a snapshot replaces the map, so the palette can close. */
  onRestore: () => void;
}

/** The command palette page for the open scene's snapshots: a save tile, then the snapshots newest first. */
export function SceneSnapshotsPanel({ onRestore }: SceneSnapshotsPanelProps): React.ReactElement {
  const { app } = useAtlasUI();
  const { entries, isLoading, isBusy, save, restore, rename, remove } = useSceneSnapshots(onRestore);

  return (
    <div className="atlas-snapshots">
      <div className="atlas-snapshots-grid">
        <button type="button" className="atlas-snapshot-new" disabled={isBusy} onClick={() => void save()}>
          <Plus />
          <span>Save snapshot</span>
        </button>
        {entries.map((entry) => (
          <SnapshotCard
            key={entry.snapshot.id}
            entry={entry}
            thumbnailUrl={entry.thumbnail ? app.vault.getResourcePath(entry.thumbnail) : null}
            disabled={isBusy}
            onRestore={(target) => void restore(target)}
            onRename={(target) => void rename(target)}
            onDelete={(target) => void remove(target)}
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
