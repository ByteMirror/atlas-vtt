import { TokenRingToggle } from './TokenRingToggle';
import React, { useId, useState } from 'react';
import { Check, Minus, MoveHorizontal, Plus, Trash2, X } from 'lucide-react';
import { Button } from '../../primitives/button';
import { Slider } from '../../primitives/slider';
import { LabelTooltip } from '../../primitives/tooltip';
import { CollectionSelect } from './CollectionSelect';
import { TagPicker } from './TagPicker';
import { UploadDropzone } from './UploadDropzone';
import { clampZoom, ZOOM_MAX, ZOOM_MIN, ZOOM_STEP } from './types';
import type { CollectionMetadata } from '../../../../services/AssetService';
import type { CreatorMode } from './types';
import type { TokenPreviewsApi } from './useTokenPreviews';

interface TokenCreatorRailProps {
  mode: CreatorMode;
  source: 'images' | 'statblocks';
  onSourceChange: (source: 'images' | 'statblocks') => void;
  sourceDisabled: boolean;
  isEditing: boolean;
  isDragging: boolean;
  previews: TokenPreviewsApi;
  onFiles: (files: File[]) => void;
  collection: string;
  collections: CollectionMetadata[];
  onCollectionChange: (collection: string) => void;
  availableTags: string[];
  selectedTags: string[];
  onToggleTag: (tag: string) => void;
  onCreateTag: (tag: string) => Promise<string>;
  tagsDisabled: boolean;
}

/** Left column of the creator: intake, selection, metadata and batch tools. */
export function TokenCreatorRail(props: TokenCreatorRailProps): React.JSX.Element {
  const { mode, isEditing, isDragging, previews, onFiles, collection, collections, onCollectionChange, availableTags, selectedTags, onToggleTag } = props;
  const [batchScale, setBatchScale] = useState(1);
  const zoomLabelId = useId();

  const count = previews.previews.length;
  const selectedCount = previews.selectedIds.length;

  const applyBatchScale = (scale: number): void => {
    const next = clampZoom(scale);
    setBatchScale(next);
    previews.updateSelected({ imageScale: next });
  };

  return (
    <aside className="atlas-token-creator__rail" inert={props.sourceDisabled}>
      {mode === 'token' && !isEditing && <section className="atlas-token-creator__section">
        <div className="atlas-token-creator__section-title">Image source</div>
        <Button variant={props.source === 'images' ? 'secondary' : 'outline'} disabled={props.sourceDisabled} onClick={() => props.onSourceChange('images')}>Import previews</Button>
        <Button variant={props.source === 'statblocks' ? 'secondary' : 'outline'} disabled={props.sourceDisabled} onClick={() => props.onSourceChange('statblocks')}>Fantasy Statblocks</Button>
      </section>}
      {props.source === 'statblocks' && mode === 'token' && !isEditing ? <p>Add creatures from your vault to the same preview cards as uploaded images.</p> : <>
      {mode === 'token' && <TokenRingToggle label="Atlas ring for all" mixed={previews.previews.some(p => p.showRing !== false) && previews.previews.some(p => p.showRing === false)} value={count ? previews.previews.every(p => p.showRing !== false) : previews.defaultRing} onChange={previews.setAllRings} />}

      <section className="atlas-token-creator__section">
        <div className="atlas-token-creator__section-title">{isEditing ? 'Replace image' : 'Upload images'}</div>
        <UploadDropzone
          title={isEditing ? 'Choose a new image' : 'Drop images anywhere'}
          hint={isEditing ? 'The current image will be replaced' : `or click to browse for ${mode} images`}
          multiple={!isEditing}
          isDragging={isDragging}
          onFiles={onFiles}
        />
      </section>

      {count > 0 && !isEditing && (
        <section className="atlas-token-creator__section">
          <div className="atlas-token-creator__section-title">
            <span>Selection <span className="atlas-token-creator__count">{selectedCount} of {count}</span></span>
          </div>
          <div className="atlas-token-creator__row">
            <Button variant="outline" size="sm" onClick={previews.selectAll} disabled={selectedCount === count}>
              <Check />
              <span>All</span>
            </Button>
            <Button variant="outline" size="sm" onClick={previews.deselectAll} disabled={selectedCount === 0}>
              <X />
              <span>None</span>
            </Button>
            <LabelTooltip label="Remove selected">
              <Button variant="outline" size="sm" className="atlas-token-creator__danger" onClick={previews.removeSelected} disabled={selectedCount === 0}>
                <Trash2 />
                <span>Remove</span>
              </Button>
            </LabelTooltip>
          </div>
        </section>
      )}

      <div className="atlas-token-creator__divider" />

      <section className="atlas-token-creator__section">
        <div className="atlas-token-creator__section-title">Collection</div>
        <CollectionSelect value={collection} options={collections} onChange={onCollectionChange} />
      </section>

      <p className="atlas-token-creator__empty-note">Tags apply to {selectedCount} selected {selectedCount === 1 ? 'preview' : 'previews'}.</p>
      <TagPicker available={availableTags} selected={selectedTags} onToggle={onToggleTag} onCreate={props.onCreateTag} disabled={props.tagsDisabled} />

      {mode === 'token' && selectedCount > 0 && (
        <section className="atlas-token-creator__section">
          <div className="atlas-token-creator__section-title">
            <span>Batch <span className="atlas-token-creator__count">{selectedCount} selected</span></span>
          </div>
          <div className="atlas-token-creator__label-row">
            <span id={zoomLabelId}>Zoom</span>
            <span>{Math.round(batchScale * 100)}%</span>
          </div>
          <div className="atlas-token-creator__slider-row">
            <LabelTooltip label="Zoom out selected">
              <Button variant="ghost" size="icon" className="atlas-collection-header-btn" onClick={() => applyBatchScale(batchScale - ZOOM_STEP)} disabled={batchScale <= ZOOM_MIN}>
                <Minus />
              </Button>
            </LabelTooltip>
            <Slider
              value={[batchScale]}
              min={ZOOM_MIN}
              max={ZOOM_MAX}
              step={0.01}
              onValueChange={(v) => applyBatchScale(v[0] ?? batchScale)}
              aria-labelledby={zoomLabelId}
            />
            <LabelTooltip label="Zoom in selected">
              <Button variant="ghost" size="icon" className="atlas-collection-header-btn" onClick={() => applyBatchScale(batchScale + ZOOM_STEP)} disabled={batchScale >= ZOOM_MAX}>
                <Plus />
              </Button>
            </LabelTooltip>
          </div>
          <Button variant="outline" size="sm" onClick={() => previews.updateSelected({ imageScale: 1, imagePosition: { x: 0, y: 0 } })}>
            <MoveHorizontal />
            <span>Reset crop</span>
          </Button>
        </section>
      )}
      </>}
    </aside>
  );
}
