import React from 'react';
import { ImageOff, Pencil, Trash2 } from 'lucide-react';
import type { SceneSnapshotEntry } from '../../../snapshots/SceneSnapshotService';
import { formatRelativeTime } from '../../../utils/relativeTime';
import { LabelTooltip } from '../../../packages/components/primitives/tooltip';

interface SnapshotCardProps {
  entry: SceneSnapshotEntry;
  thumbnailUrl: string | null;
  disabled: boolean;
  onRestore: (entry: SceneSnapshotEntry) => void;
  onRename: (entry: SceneSnapshotEntry) => void;
  onDelete: (entry: SceneSnapshotEntry) => void;
}

const dateFormat = new Intl.DateTimeFormat(undefined, { dateStyle: 'medium', timeStyle: 'short' });

/** One snapshot: click restores it, the hover buttons rename or delete it. */
export function SnapshotCard({ entry, thumbnailUrl, disabled, onRestore, onRename, onDelete }: SnapshotCardProps): React.ReactElement {
  const { name, createdAt } = entry.snapshot;

  return (
    <div className="atlas-snapshot-card" role="group" aria-label={name}>
      <button
        type="button"
        className="atlas-snapshot-card__restore"
        disabled={disabled}
        onClick={() => onRestore(entry)}
        aria-label={`Restore ${name}`}
      >
        <span className="atlas-snapshot-card__thumb">
          {thumbnailUrl ? <img src={thumbnailUrl} alt="" draggable={false} /> : <ImageOff />}
        </span>
        <span className="atlas-snapshot-card__text">
          <span className="atlas-snapshot-card__name">{name}</span>
          <span className="atlas-snapshot-card__date" title={dateFormat.format(createdAt)}>
            {formatRelativeTime(createdAt)}
          </span>
        </span>
      </button>
      <div className="atlas-snapshot-card__actions">
        <LabelTooltip label="Rename">
          <button type="button" className="atlas-snapshot-card__action" disabled={disabled} onClick={() => onRename(entry)}>
            <Pencil />
          </button>
        </LabelTooltip>
        <LabelTooltip label="Delete">
          <button type="button" className="atlas-snapshot-card__action atlas-snapshot-card__action--danger" disabled={disabled} onClick={() => onDelete(entry)}>
            <Trash2 />
          </button>
        </LabelTooltip>
      </div>
    </div>
  );
}
