import React, { useState } from 'react';
import type { ImportDecision } from '../../../../services/collectionBundle/collectionImport';
import type { ChangeStatus, Resolution } from '../../../../services/collectionBundle/importPlan';
import type { ImportReview } from '../../../../services/collectionBundle/importReview';
import { plural } from '../../../../utils/plural';
import { formatRelativeTime } from '../../../../utils/relativeTime';
import { Button } from '../../primitives/button';
import { CollectionHero } from './CollectionHero';
import { ConflictList } from './ConflictList';
import { ContentsList } from './ContentsList';
import { TransferDialog } from './TransferDialog';
import { useObjectUrl } from './useObjectUrl';

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

/** Short label over the collection's name. */
function eyebrowOf(review: ImportReview, restore: boolean): string {
  if (review.relation === 'same') return review.upToDate && !restore ? 'Up to date' : 'Changed copy';
  return { new: 'Import collection', newer: 'Update', older: 'Older version' }[review.relation];
}

const CONFIRM_LABELS: Record<ImportReview['relation'], string> = {
  new: 'Import', newer: 'Update', same: 'Apply changes', older: 'Install older version',
};

function versionLabel(review: ImportReview): string {
  return review.relation === 'new' || review.installedVersion === undefined || review.installedVersion === review.version
    ? `v${review.version}`
    : `v${review.installedVersion} → v${review.version}`;
}

/**
 * Shows the collection the way its author exported it (cover, version, notes
 * and contents) and what the import would do (new, updated, removed,
 * conflicts), and collects the user's choices.
 */
export function ImportReviewDialog({ review, onConfirm, onCancel }: ImportReviewDialogProps): React.JSX.Element {
  const [name, setName] = useState(review.suggestedName ?? review.collectionName);
  const [resolutions, setResolutions] = useState<Map<string, Resolution>>(new Map());
  const [restore, setRestore] = useState(false);
  const coverUrl = useObjectUrl(review.cover);

  const title = titleOf(review, restore);
  const counts = COUNT_LABELS.filter(([status]) => review.counts[status] > 0).map(([status, label]) => `${review.counts[status]} ${label}`);
  const canConfirm = restore || !review.upToDate;
  const itemCount = review.contents.reduce((count, group) => count + group.items.length, 0);
  const confirmLabel = restore ? 'Restore original' : CONFIRM_LABELS[review.relation];

  const confirm = (): void => {
    if (review.suggestedName !== undefined && !name.trim()) return;
    onConfirm({ name: review.suggestedName !== undefined ? name.trim() : undefined, resolutions, restore });
  };

  return (
    <TransferDialog
      label={title}
      onClose={onCancel}
      ambientUrl={coverUrl}
      hero={(
        <CollectionHero
          eyebrow={eyebrowOf(review, restore)}
          imageUrl={coverUrl}
          name={review.collectionName}
          version={versionLabel(review)}
          details={[review.author ? `by ${review.author}` : '', `exported ${formatRelativeTime(review.exportedAt)}`]}
          description={review.description}
        />
      )}
      summary={`${plural(itemCount, 'item')} · ${plural(review.fileCount, 'file')}`}
      actions={(
        <>
          <Button variant="outline" onClick={onCancel}>{canConfirm ? 'Cancel' : 'Close'}</Button>
          {canConfirm && (
            <Button variant={review.relation === 'older' || restore || review.publisherWarning ? 'destructive' : 'default'} className="atlas-transfer-confirm" onClick={confirm}>
              {confirmLabel}
            </Button>
          )}
        </>
      )}
    >
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
      {review.skippedAssets.length > 0 && (
        <div className="atlas-transfer-callout atlas-transfer-callout--warning" role="note">
          <strong>{plural(review.skippedAssets.length, 'asset')} will be left out because {review.skippedAssets.length === 1 ? 'it refers' : 'they refer'} to files outside Atlas&rsquo;s folder:</strong>
          <ul>
            {review.skippedAssets.slice(0, 5).map((asset) => <li key={`${asset.name}:${asset.path}`}>{asset.name} ({asset.path})</li>)}
            {review.skippedAssets.length > 5 && <li>and {review.skippedAssets.length - 5} more</li>}
          </ul>
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
        <section className="atlas-transfer-section" aria-label="Release notes">
          <h4 className="atlas-transfer-section__title">{review.relation === 'new' ? 'Release notes' : 'What’s new'}</h4>
          <p className="atlas-transfer-notes-view">{review.releaseNotes}</p>
        </section>
      )}
      {review.relation !== 'new' && counts.length > 0 && <p className="atlas-transfer-text">{counts.join(' · ')}</p>}
      {review.upToDate && !restore && <p className="atlas-transfer-text">Everything from this version is already in your vault.</p>}
      <ContentsList groups={review.contents} />
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
    </TransferDialog>
  );
}
