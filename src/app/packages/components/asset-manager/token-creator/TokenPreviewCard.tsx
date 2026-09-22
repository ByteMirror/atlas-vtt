import { TokenRingToggle } from './TokenRingToggle';
import tokenRingImageUrl from '../../../../assets/token-ring.webp';
import React, { useCallback, useEffect, useId, useRef, useState } from 'react';
import { Check, Loader2, Trash2, ZoomIn, ZoomOut } from 'lucide-react';
import { cn } from '../../../../../utils/cn';
import { Button } from '../../primitives/button';
import { Slider } from '../../primitives/slider';
import { LabelTooltip } from '../../primitives/tooltip';
import { clampImagePosition } from './cropMath';
import type { ImageAspect } from './cropMath';
import { clampZoom, ZOOM_MAX, ZOOM_MIN, ZOOM_STEP } from './types';
import type { CreatorMode, ImagePosition, TokenPreview, TokenPreviewPatch } from './types';

interface TokenPreviewCardProps {
  preview: TokenPreview;
  mode: CreatorMode;
  index: number;
  onChange: (patch: TokenPreviewPatch) => void;
  onToggleSelected: () => void;
  onRemove: () => void;
}

const WHEEL_ZOOM_SENSITIVITY = 0.0025;
const ENTER_STAGGER_CAP = 12;

/** Natural size of the image behind a URL, for aspect-aware drag limits. */
function useImageAspect(url: string): ImageAspect | null {
  const [aspect, setAspect] = useState<ImageAspect | null>(null);
  useEffect(() => {
    let cancelled = false;
    const image = new Image();
    image.onload = () => { if (!cancelled) setAspect({ width: image.naturalWidth, height: image.naturalHeight }); };
    image.src = url;
    return () => { cancelled = true; };
  }, [url]);
  return aspect;
}

/** Tracks the rendered width of the art well so fractional offsets map to pixels. */
function useWellSize(ref: React.RefObject<HTMLDivElement | null>): number {
  const [size, setSize] = useState(0);
  useEffect(() => {
    const element = ref.current;
    if (!element) return;
    const observer = new ResizeObserver(([entry]) => { if (entry) setSize(entry.contentRect.width); });
    observer.observe(element);
    return () => observer.disconnect();
  }, [ref]);
  return size;
}

/**
 * One preview in the grid. Tokens get a crop editor (drag to reposition, wheel
 * or slider to zoom, double-click to reset) with the image beyond the circle
 * dimmed rather than hidden; maps show whole. Positions are fractions of the
 * well so the export can reproduce the preview exactly.
 */
export function TokenPreviewCard({ preview, mode, index, onChange, onToggleSelected, onRemove }: TokenPreviewCardProps): React.JSX.Element {
  const nameLabelId = useId();
  const artRef = useRef<HTMLDivElement>(null);
  const previewRef = useRef(preview);
  previewRef.current = preview;
  const onChangeRef = useRef(onChange);
  onChangeRef.current = onChange;

  const isCropEditable = mode === 'token' && preview.showRing !== false;
  const aspect = useImageAspect(preview.previewUrl);
  const wellSize = useWellSize(artRef);

  const clampPosition = useCallback(
    (position: ImagePosition, scale: number): ImagePosition => clampImagePosition(position, scale, aspect),
    [aspect],
  );

  useEffect(() => {
    if (!isCropEditable) return;
    const { imagePosition, imageScale } = previewRef.current;
    const clamped = clampPosition(imagePosition, imageScale);
    if (clamped.x !== imagePosition.x || clamped.y !== imagePosition.y) onChangeRef.current({ imagePosition: clamped });
  }, [isCropEditable, preview.imageScale, clampPosition]);

  useEffect(() => {
    const art = artRef.current;
    if (!art || !isCropEditable) return;
    const handleWheel = (e: WheelEvent): void => {
      e.preventDefault();
      const next = previewRef.current.imageScale * Math.exp(-e.deltaY * WHEEL_ZOOM_SENSITIVITY);
      onChangeRef.current({ imageScale: clampZoom(next) });
    };
    art.addEventListener('wheel', handleWheel, { passive: false });
    return () => art.removeEventListener('wheel', handleWheel);
  }, [isCropEditable]);

  const setScale = (scale: number): void => onChange({ imageScale: clampZoom(scale) });
  const resetCrop = (): void => onChange({ imageScale: 1, imagePosition: { x: 0, y: 0 } });

  const handlePointerDown = (e: React.PointerEvent<HTMLDivElement>): void => {
    if (e.button !== 0) return;
    e.stopPropagation();
    const target = e.currentTarget;
    const startPosition = preview.imagePosition;
    const size = target.getBoundingClientRect().width || 1;
    target.setPointerCapture(e.pointerId);
    target.classList.add('atlas-dragging');

    const handleMove = (move: PointerEvent): void => {
      const next = {
        x: startPosition.x + (move.clientX - e.clientX) / size,
        y: startPosition.y + (move.clientY - e.clientY) / size,
      };
      onChange({ imagePosition: clampPosition(next, previewRef.current.imageScale) });
    };
    const handleUp = (): void => {
      target.classList.remove('atlas-dragging');
      target.removeEventListener('pointermove', handleMove);
      target.removeEventListener('pointerup', handleUp);
      target.removeEventListener('pointercancel', handleUp);
    };
    target.addEventListener('pointermove', handleMove);
    target.addEventListener('pointerup', handleUp);
    target.addEventListener('pointercancel', handleUp);
  };

  const imageStyle: React.CSSProperties = isCropEditable
    ? {
        backgroundImage: `url(${preview.previewUrl})`,
        backgroundSize: `${preview.imageScale * 100}%`,
        backgroundPosition: `calc(50% + ${preview.imagePosition.x * wellSize}px) calc(50% + ${preview.imagePosition.y * wellSize}px)`,
      }
    : { backgroundImage: `url(${preview.previewUrl})`, backgroundSize: 'contain', backgroundPosition: 'center' };

  const zoomPercent = Math.round(preview.imageScale * 100);

  const art = (
    <div
      ref={artRef}
      className="atlas-token-card__art"
      onDoubleClick={isCropEditable ? resetCrop : undefined}
    >
      <div
        className="atlas-token-card__image"
        style={imageStyle}
        onPointerDown={isCropEditable ? handlePointerDown : undefined}
      />
      {isCropEditable && <><div className="atlas-token-card__mask" /><img className="atlas-token-card__ring" src={tokenRingImageUrl} alt="" /></>}

      <LabelTooltip label={`Select ${preview.name}`}>
        <button
          type="button"
          className={cn('atlas-token-card__check', preview.isSelected && 'atlas-checked')}
          role="checkbox"
          aria-checked={preview.isSelected}
          onClick={(e) => { e.stopPropagation(); onToggleSelected(); }}
        >
          <Check />
        </button>
      </LabelTooltip>
      <LabelTooltip label="Remove">
        <Button
          variant="ghost"
          size="icon"
          className="atlas-token-card__remove"
          onClick={(e) => { e.stopPropagation(); onRemove(); }}
        >
          <Trash2 />
        </Button>
      </LabelTooltip>

      {preview.isOptimizing && (
        <div className="atlas-token-card__busy">
          <Loader2 />
          <span>Optimizing</span>
        </div>
      )}
      {preview.optimizationResult && (
        <LabelTooltip label="Size reduction from optimization">
          <div className="atlas-token-card__badge">
            −{preview.optimizationResult.compressionRatio}%
          </div>
        </LabelTooltip>
      )}
    </div>
  );

  return (
    <div
      className={cn('atlas-token-card', `atlas-token-card--${mode}`, preview.isSelected && 'atlas-selected', !isCropEditable && 'atlas-token-card--unframed')}
      style={{ '--atlas-enter-index': Math.min(index, ENTER_STAGGER_CAP) } as React.CSSProperties}
    >
      {isCropEditable ? <LabelTooltip label="Drag to reposition · Scroll to zoom · Double-click to reset">{art}</LabelTooltip> : art}

      <span id={nameLabelId} hidden>{`${mode === 'map' ? 'Map' : 'Token'} name`}</span>
      <input
        type="text"
        value={preview.name}
        onChange={(e) => onChange({ name: e.target.value })}
        className="atlas-token-card__name"
        placeholder={`${mode === 'map' ? 'Map' : 'Token'} name`}
        spellCheck={false}
        aria-labelledby={nameLabelId}
      />

      {preview.tags && preview.tags.length > 0 && <div className="atlas-token-card__tags">{preview.tags.join(' · ')}</div>}
      {mode === 'token' && <TokenRingToggle label={`Toggle token ring for ${preview.name}`} value={preview.showRing !== false} onChange={showRing => onChange({ showRing })} />}
      {isCropEditable && (
        <div className="atlas-token-card__zoom">
          <LabelTooltip label="Zoom out">
            <Button variant="ghost" size="icon" className="atlas-token-card__zoom-btn" onClick={() => setScale(preview.imageScale - ZOOM_STEP)} disabled={preview.imageScale <= ZOOM_MIN}>
              <ZoomOut />
            </Button>
          </LabelTooltip>
          <LabelTooltip label="Zoom">
            <Slider
              value={[preview.imageScale]}
              min={ZOOM_MIN}
              max={ZOOM_MAX}
              step={0.01}
              onValueChange={(v) => setScale(v[0] ?? preview.imageScale)}
            />
          </LabelTooltip>
          <LabelTooltip label="Zoom in">
            <Button variant="ghost" size="icon" className="atlas-token-card__zoom-btn" onClick={() => setScale(preview.imageScale + ZOOM_STEP)} disabled={preview.imageScale >= ZOOM_MAX}>
              <ZoomIn />
            </Button>
          </LabelTooltip>
          <LabelTooltip label="Reset zoom to 100%">
            <button
              type="button"
              className="atlas-token-card__zoom-value"
              onClick={() => setScale(1)}
            >
              {zoomPercent}%
            </button>
          </LabelTooltip>
        </div>
      )}
    </div>
  );
}
