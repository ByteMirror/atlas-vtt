import React, { useId, useRef } from 'react';
import { Check, ImageOff, ImagePlus } from 'lucide-react';
import type { CoverCandidate, CoverChoice, CurrentCover } from '../../../../services/collectionBundle/collectionCover';
import { LabelTooltip } from '../../primitives/tooltip';

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
  /** Tooltip, when it should say more than the label; otherwise it shows the full, possibly truncated, label. */
  hint?: string;
  selected?: boolean;
  /** Plain action cards (upload) are buttons, not options. */
  isOption?: boolean;
  variant?: 'art' | 'action';
  onSelect: () => void;
  children: React.ReactNode;
}

function Card({ label, hint, selected = false, isOption = true, variant = 'art', onSelect, children }: CardProps): React.JSX.Element {
  return (
    <LabelTooltip label={hint ?? label} side="left" describe>
      <button
        type="button"
        className="atlas-transfer-cover-card"
        data-variant={variant}
        {...(isOption ? { role: 'radio', 'aria-checked': selected } : {})}
        onClick={onSelect}
      >
        <span className="atlas-transfer-cover-card__art">{children}</span>
        <span className="atlas-transfer-cover-card__label">{label}</span>
        {selected && <span className="atlas-transfer-cover-card__badge" aria-hidden="true"><Check /></span>}
      </button>
    </LabelTooltip>
  );
}

/** Side rail of large cover cards: upload an image, keep the current cover, use a map's or scene's artwork, or none. */
export function CoverPicker({ value, current, candidates, upload, onUpload, onChange }: CoverPickerProps): React.JSX.Element {
  const inputRef = useRef<HTMLInputElement>(null);
  const titleId = useId();
  const isArtwork = (path: string): boolean => value.kind === 'artwork' && value.path === path;
  return (
    <section className="atlas-transfer-covers" aria-labelledby={titleId}>
      <div className="atlas-transfer-covers__header">
        <span id={titleId} className="atlas-transfer-eyebrow">Cover</span>
        <span className="atlas-transfer-covers__hint">Shown when people import it</span>
      </div>
      <div className="atlas-transfer-covers__list" role="radiogroup" aria-labelledby={titleId}>
        <Card label="Upload image" hint="Use an image of your own as the cover" variant="action" isOption={false} onSelect={() => inputRef.current?.click()}>
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
        <Card label="No cover" hint="Export without a cover image" variant="action" selected={value.kind === 'none'} onSelect={() => onChange({ kind: 'none' })}>
          <ImageOff aria-hidden="true" />
        </Card>
      </div>
      <input
        ref={inputRef}
        type="file"
        accept="image/*"
        className="atlas-hidden-file-input"
        tabIndex={-1}
        onChange={(event) => {
          const image = event.target.files?.[0];
          event.target.value = '';
          if (image) onUpload(image);
        }}
      />
    </section>
  );
}
