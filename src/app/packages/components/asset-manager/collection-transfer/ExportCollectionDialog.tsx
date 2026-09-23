import React, { useRef, useState } from 'react';
import type { ExportChoice, ExportPreview } from '../../../../services/collectionBundle/collectionExport';
import { formatFileSize } from '../../../../utils/imageOptimizer';
import { Button } from '../../primitives/button';
import { CloseButton } from '../../primitives/CloseButton';
import { SegmentedControl } from '../../primitives/SegmentedControl';
import { useDialogEscape } from '../../primitives/useDialogEscape';

interface ExportCollectionDialogProps {
  preview: ExportPreview;
  /** Resolves with a message to show when the choice cannot be exported. */
  onExport: (choice: ExportChoice) => Promise<string | null>;
  onCancel: () => void;
}

type ForeignMode = 'share' | 'fork';

const MISSING_SHOWN = 5;

/** Asks how to export a collection: a new release by its publisher, or a copy or fork by anyone else. */
export function ExportCollectionDialog({ preview, onExport, onCancel }: ExportCollectionDialogProps): React.JSX.Element {
  const { collection, isPublisher } = preview;
  const [mode, setMode] = useState<ForeignMode>('share');
  const [version, setVersion] = useState(String(preview.suggestedVersion));
  const [author, setAuthor] = useState(collection.author ?? '');
  const [notes, setNotes] = useState('');
  const [forkName, setForkName] = useState(`${collection.name} (my edition)`);
  const [error, setError] = useState<string | null>(null);
  const dialogRef = useRef<HTMLDivElement>(null);
  useDialogEscape(dialogRef, onCancel);
  const isRelease = isPublisher || mode === 'fork';
  const versionNumber = Number(version);

  const choice = (): ExportChoice | string => {
    if (!isPublisher && mode === 'share') return { kind: 'share' };
    if (!isPublisher) return forkName.trim() ? { kind: 'fork', name: forkName, author, notes } : 'Enter a name for your collection.';
    if (!Number.isInteger(versionNumber) || versionNumber < preview.minimumVersion) {
      return `The version must be a whole number of at least ${preview.minimumVersion}.`;
    }
    return { kind: 'release', version: versionNumber, author, notes };
  };

  const submit = async (): Promise<void> => {
    const next = choice();
    setError(typeof next === 'string' ? next : await onExport(next));
  };

  const sameVersion = isPublisher && versionNumber === collection.version && collection.releasedAt !== undefined;
  const confirmLabel = isPublisher ? `Export v${Number.isInteger(versionNumber) ? versionNumber : '…'}` : mode === 'share' ? 'Share copy' : 'Publish';

  return (
    <div className="atlas-modal-overlay atlas-transfer-overlay" onClick={onCancel}>
      <div ref={dialogRef} className="atlas-modal atlas-transfer-dialog" role="dialog" aria-modal="true" aria-label={`Export ${collection.name}`} onClick={(event) => event.stopPropagation()}>
        <div className="atlas-modal-header">
          <h3>Export &ldquo;{collection.name}&rdquo;</h3>
          <CloseButton onClick={onCancel} />
        </div>
        <div className="atlas-modal-body">
          {!isPublisher && (
            <>
              <p className="atlas-transfer-text">
                You installed this collection{collection.author ? ` from ${collection.author}` : ''}. Only its author releases new versions.
              </p>
              <SegmentedControl
                ariaLabel="Export as"
                value={mode}
                options={[{ value: 'share', label: 'Share my copy' }, { value: 'fork', label: 'Publish as my own' }]}
                onChange={setMode}
              />
              <p className="atlas-transfer-text atlas-transfer-text--muted">
                {mode === 'share'
                  ? `Shares v${collection.version} including your changes. People who have it installed see it as a changed copy of that version.`
                  : 'Your copy becomes a new collection under the name below. It stops receiving updates from the original, and you publish its versions.'}
              </p>
            </>
          )}
          {isPublisher && (
            <label className="atlas-transfer-field">
              <span>Version</span>
              <input className="atlas-input" type="number" min={preview.minimumVersion} step={1} value={version} onChange={(event) => setVersion(event.target.value)} />
              <span className="atlas-transfer-hint">
                {sameVersion
                  ? `Same as your last release. People who installed v${collection.version} will see a changed copy of it.`
                  : `People who installed an earlier version can update to this one.`}
              </span>
            </label>
          )}
          {!isPublisher && mode === 'fork' && (
            <label className="atlas-transfer-field">
              <span>Name</span>
              <input className="atlas-input" value={forkName} onChange={(event) => setForkName(event.target.value)} />
            </label>
          )}
          {isRelease && (
            <>
              <label className="atlas-transfer-field">
                <span>Author</span>
                <input className="atlas-input" value={author} placeholder="Shown to people who install it" onChange={(event) => setAuthor(event.target.value)} />
              </label>
              <label className="atlas-transfer-field">
                <span>Release notes</span>
                <textarea className="atlas-input atlas-transfer-notes" value={notes} placeholder="What is new in this version" onChange={(event) => setNotes(event.target.value)} />
              </label>
            </>
          )}
          <p className="atlas-transfer-text atlas-transfer-text--muted">
            {preview.assets.length} assets · {preview.files.length} files · {formatFileSize(preview.totalBytes)}
          </p>
          {preview.missing.length > 0 && (
            <div className="atlas-transfer-callout atlas-transfer-callout--warning" role="note">
              <strong>{preview.missing.length} referenced {preview.missing.length === 1 ? 'file is' : 'files are'} missing and will not be included:</strong>
              <ul>
                {preview.missing.slice(0, MISSING_SHOWN).map((missing) => (
                  <li key={missing.path}>{missing.path.slice(missing.path.lastIndexOf('/') + 1)} ({missing.assetName})</li>
                ))}
                {preview.missing.length > MISSING_SHOWN && <li>and {preview.missing.length - MISSING_SHOWN} more</li>}
              </ul>
            </div>
          )}
          {error && <div className="atlas-input-error" role="alert">{error}</div>}
        </div>
        <div className="atlas-modal-footer">
          <Button variant="outline" size="sm" onClick={onCancel}>Cancel</Button>
          <Button variant="default" size="sm" onClick={() => { void submit(); }}>{confirmLabel}</Button>
        </div>
      </div>
    </div>
  );
}
