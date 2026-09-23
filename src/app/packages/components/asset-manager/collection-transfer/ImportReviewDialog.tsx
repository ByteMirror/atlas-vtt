import React, { useRef, useState } from 'react';
import type { ImportDecision } from '../../../../services/collectionBundle/collectionImport';
import type { ChangeStatus, Resolution } from '../../../../services/collectionBundle/importPlan';
import type { ImportReview } from '../../../../services/collectionBundle/importReview';
import { formatRelativeTime } from '../../../../utils/relativeTime';
import { Button } from '../../primitives/button';
import { CloseButton } from '../../primitives/CloseButton';
import { useDialogEscape } from '../../primitives/useDialogEscape';
import { ConflictList } from './ConflictList';

interface ImportReviewDialogProps {
  review: ImportReview;
  onConfirm: (decision: ImportDecision) => void;
  onCancel: () => void;
}

const COUNT_LABELS: ReadonlyArray<[ChangeStatus, string]> = [
  ['added', 'new'], ['updated', 'updated'], ['removed', 'removed'], ['kept', 'of your changes kept'],
];

function titleOf(review: ImportReview, restore: boolean): string {
  const local = `“${review.localName ?? review.collectionName}”`;
  switch (review.relation) {
    case 'new': return `Import “${review.collectionName}”`;
    case 'newer': return `Update ${local}`;
    case 'older': return `Older version of ${local}`;
    case 'same': return review.upToDate && !restore ? `${local} is up to date` : `Changed copy of ${local}`;
  }
}

const CONFIRM_LABELS: Record<ImportReview['relation'], string> = {
  new: 'Import', newer: 'Update', same: 'Apply changes', older: 'Install older version',
};

function versionLine(review: ImportReview): string {
  const version = review.relation === 'new' || review.installedVersion === undefined || review.installedVersion === review.version
    ? `v${review.version}`
    : `v${review.installedVersion} → v${review.version}`;
  const author = review.author ? ` by ${review.author}` : '';
  return `${version}${author} · exported ${formatRelativeTime(review.exportedAt)}${review.kind === 'share' ? ' · shared copy' : ''}`;
}

/** Shows what an import would do (new, updated, removed, conflicts) and collects the user's choices. */
export function ImportReviewDialog({ review, onConfirm, onCancel }: ImportReviewDialogProps): React.JSX.Element {
  const [name, setName] = useState(review.suggestedName ?? review.collectionName);
  const [resolutions, setResolutions] = useState<Map<string, Resolution>>(new Map());
  const [restore, setRestore] = useState(false);
  const dialogRef = useRef<HTMLDivElement>(null);
  useDialogEscape(dialogRef, onCancel);

  const title = titleOf(review, restore);
  const counts = COUNT_LABELS.filter(([status]) => review.counts[status] > 0).map(([status, label]) => `${review.counts[status]} ${label}`);
  const canConfirm = restore || !review.upToDate;
  const confirmLabel = restore ? 'Restore original' : CONFIRM_LABELS[review.relation];

  const confirm = (): void => {
    if (review.suggestedName !== undefined && !name.trim()) return;
    onConfirm({ name: review.suggestedName !== undefined ? name.trim() : undefined, resolutions, restore });
  };

  return (
    <div className="atlas-modal-overlay atlas-transfer-overlay" onClick={onCancel}>
      <div ref={dialogRef} className="atlas-modal atlas-transfer-dialog" role="dialog" aria-modal="true" aria-label={title} onClick={(event) => event.stopPropagation()}>
        <div className="atlas-modal-header">
          <h3>{title}</h3>
          <CloseButton onClick={onCancel} />
        </div>
        <div className="atlas-modal-body">
          <p className="atlas-transfer-text atlas-transfer-text--muted">{versionLine(review)}</p>
          {review.kind === 'share' && (
            <div className="atlas-transfer-callout" role="note">This is a copy someone shared, not a release by the author. It may contain their own changes.</div>
          )}
          {review.publisherWarning && (
            <div className="atlas-transfer-callout atlas-transfer-callout--warning" role="note">
              {review.publisherWarning === 'own-collection'
                ? 'You published this collection, but this file claims to be a release of it by someone else. Only continue if you trust where it came from.'
                : 'This file was released by a different publisher than the version you have. Only continue if you trust where it came from.'}
            </div>
          )}
          {review.relation === 'older' && (
            <div className="atlas-transfer-callout atlas-transfer-callout--warning" role="note">
              You have v{review.installedVersion}. This file holds the older v{review.version}; installing it brings back its content wherever you did not change anything.
            </div>
          )}
          {review.relation !== 'new' && !review.hasInstallRecord && (
            <div className="atlas-transfer-callout" role="note">
              This copy was imported with an earlier version of Atlas, so Atlas cannot tell your changes from the author&rsquo;s. Differences are listed below and keep your version unless you choose otherwise.
            </div>
          )}
          {review.suggestedName !== undefined && (
            <label className="atlas-transfer-field">
              <span>You already have a different collection named &ldquo;{review.collectionName}&rdquo;. Import this one as:</span>
              <input className="atlas-input" value={name} onChange={(event) => setName(event.target.value)} />
            </label>
          )}
          {review.releaseNotes && (
            <div className="atlas-transfer-notes-view">
              <strong>What&rsquo;s new</strong>
              <p>{review.releaseNotes}</p>
            </div>
          )}
          {review.relation === 'new'
            ? <p className="atlas-transfer-text">{review.assetCount} assets · {review.fileCount} files</p>
            : counts.length > 0 && <p className="atlas-transfer-text">{counts.join(' · ')}</p>}
          {review.upToDate && !restore && <p className="atlas-transfer-text">Everything from this version is already in your vault.</p>}
          {review.conflicts.length > 0 && !restore && (
            <ConflictList conflicts={review.conflicts} resolutions={resolutions} onChange={setResolutions} />
          )}
          {review.canRestore && (
            <label className="atlas-transfer-checkbox">
              <input type="checkbox" checked={restore} onChange={(event) => setRestore(event.target.checked)} />
              <span>Restore the original: also replace everything you changed or deleted in this collection</span>
            </label>
          )}
          {review.relation !== 'new' && (
            <p className="atlas-transfer-hint">Every file the import replaces or removes is backed up first.</p>
          )}
        </div>
        <div className="atlas-modal-footer">
          <Button variant="outline" size="sm" onClick={onCancel}>{canConfirm ? 'Cancel' : 'Close'}</Button>
          {canConfirm && (
            <Button variant={review.relation === 'older' || restore || review.publisherWarning ? 'destructive' : 'default'} size="sm" onClick={confirm}>
              {confirmLabel}
            </Button>
          )}
        </div>
      </div>
    </div>
  );
}
