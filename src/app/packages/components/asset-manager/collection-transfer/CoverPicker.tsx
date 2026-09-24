import React, { useRef } from 'react';
import { Check, ImageOff, ImagePlus } from 'lucide-react';
import type { CoverCandidate, CoverChoice, CurrentCover } from '../../../../services/collectionBundle/collectionCover';

interface CoverPickerProps {
  value: CoverChoice;
  current?: CurrentCover | undefined;
  candidates: readonly CoverCandidate[];
  /** The image the user uploaded in this dialog, and its URL. */
  upload?: { image: Blob; url: string } | undefined;
  onUpload: (image: File) => void;
  onChange: (choice: CoverChoice) => void;
}

interface CardProps {
  label: string;
  selected?: boolean;
  /** Plain action cards (upload) are buttons, not options. */
  isOption?: boolean;
  variant?: 'art' | 'action';
  onSelect: () => void;
  children: React.ReactNode;
}

function Card({ label, selected = false, isOption = true, variant = 'art', onSelect, children }: CardProps): React.JSX.Element {
  return (
    <button
      type="button"
      className="atlas-transfer-cover-card"
      data-variant={variant}
      {...(isOption ? { role: 'radio', 'aria-checked': selected } : {})}
      aria-label={label}
      onClick={onSelect}
    >
      <span className="atlas-transfer-cover-card__art">{children}</span>
      <span className="atlas-transfer-cover-card__label">{label}</span>
      {selected && <span className="atlas-transfer-cover-card__badge" aria-hidden="true"><Check /></span>}
    </button>
  );
}

/** Side rail of large cover cards: upload an image, keep the current cover, use a map's or scene's artwork, or none. */
export function CoverPicker({ value, current, candidates, upload, onUpload, onChange }: CoverPickerProps): React.JSX.Element {
  const inputRef = useRef<HTMLInputElement>(null);
  const isArtwork = (path: string): boolean => value.kind === 'artwork' && value.path === path;
  return (
    <section className="atlas-transfer-covers" aria-label="Cover">
      <div className="atlas-transfer-covers__header">
        <span className="atlas-transfer-eyebrow">Cover</span>
        <span className="atlas-transfer-covers__hint">Shown when people import it</span>
      </div>
      <div className="atlas-transfer-covers__list" role="radiogroup" aria-label="Cover">
        <Card label="Upload image" variant="action" isOption={false} onSelect={() => inputRef.current?.click()}>
          <ImagePlus aria-hidden="true" />
        </Card>
        {upload && (
          <Card label="Uploaded image" selected={value.kind === 'upload'} onSelect={() => onChange({ kind: 'upload', image: upload.image })}>
            <img src={upload.url} alt="" draggable={false} />
          </Card>
        )}
        {current && (
          <Card label="Current cover" selected={value.kind === 'current'} onSelect={() => onChange({ kind: 'current' })}>
            <img src={current.url} alt="" draggable={false} decoding="async" />
          </Card>
        )}
        {candidates.map((candidate) => (
          <Card key={candidate.sourcePath} label={candidate.name} selected={isArtwork(candidate.sourcePath)} onSelect={() => onChange({ kind: 'artwork', path: candidate.sourcePath })}>
            <img src={candidate.previewUrl} alt="" draggable={false} loading="lazy" decoding="async" />
          </Card>
        ))}
        <Card label="No cover" variant="action" selected={value.kind === 'none'} onSelect={() => onChange({ kind: 'none' })}>
          <ImageOff aria-hidden="true" />
        </Card>
      </div>
      <input
        ref={inputRef}
        type="file"
        accept="image/*"
        className="atlas-hidden-file-input"
        aria-label="Upload a cover image"
        onChange={(event) => {
          const image = event.target.files?.[0];
          event.target.value = '';
          if (image) onUpload(image);
        }}
      />
    </section>
  );
}
