import React, { memo, useId } from 'react';
import { Map as MapIcon, Link } from 'lucide-react';
import type { AnyAsset } from '../types';
import type { AssetCardHandlers } from '../hooks/useAssetCardHandlers';
import { TokenPortrait } from '../../shared/TokenPortrait';
import { LabelTooltip, Tooltip, TooltipContent, TooltipTrigger } from '../../primitives/tooltip';

export interface AssetCardProps extends AssetCardHandlers {
  asset: AnyAsset;
  isSelected: boolean;
  isDragging: boolean;
  spawnCount: number;
}

/** Layout of up to three overlapping portraits inside an encounter card. */
function encounterPreviewStyle(index: number, total: number): React.CSSProperties {
  if (total <= 1) {
    return { width: '62%', height: '62%', top: '19%', left: '19%' };
  }
  if (total === 2) {
    return index === 0
      ? { width: '48%', height: '48%', top: '26%', left: '6%' }
      : { width: '48%', height: '48%', top: '26%', right: '6%' };
  }
  if (index === 0) return { width: '44%', height: '44%', top: '8%', left: '28%' };
  if (index === 1) return { width: '44%', height: '44%', top: '44%', left: '8%' };
  return { width: '44%', height: '44%', top: '44%', right: '8%' };
}

function Artwork({ asset }: { asset: AnyAsset }): React.JSX.Element {
  if (asset.type === 'encounters' && asset.tokenPreviewUrls.length > 0) {
    const overflow = Math.max(0, asset.tokens.length - asset.tokenPreviewUrls.length);
    return (
      <div className="atlas-encounter-preview">
        {asset.tokenPreviewUrls.map((url, index) => (
          <TokenPortrait
            key={`${asset.id}-encounter-preview-${index}`}
            style={encounterPreviewStyle(index, asset.tokenPreviewUrls.length)}
            src={url}
            alt={`${asset.name} token ${index + 1}`}
            lazy
          />
        ))}
        {overflow > 0 && <div className="atlas-encounter-preview-overflow">+{overflow}</div>}
      </div>
    );
  }
  if (asset.thumbnailUrl) {
    return asset.type === 'tokens'
      ? <TokenPortrait src={asset.thumbnailUrl} alt={asset.name} lazy />
      : <img src={asset.thumbnailUrl} alt={asset.name} draggable={false} loading="lazy" decoding="async" />;
  }
  return (
    <div className="atlas-asset-placeholder-icon">
      {asset.type === 'scenes' ? <MapIcon size={28} /> : asset.name.charAt(0).toUpperCase()}
    </div>
  );
}

/**
 * One tile of the asset grid. Memoized: the grid passes booleans and stable
 * handlers, so selecting or dragging one asset re-renders only the cards involved.
 */
export const AssetCard = memo(function AssetCard({
  asset, isSelected, isDragging, spawnCount,
  onSelect, onContextMenu, onOpen, onDragStart, onDragEnd, onSpawnCountChange, onOpenStatblock,
}: AssetCardProps): React.JSX.Element {
  const nameId = useId();
  const statblockPath = asset.type === 'tokens' ? asset.statblockPath : undefined;

  const handleDoubleClick = (event: React.MouseEvent): void => {
    event.preventDefault();
    event.stopPropagation();
    if (!event.shiftKey) onOpen(asset, spawnCount);
  };

  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <div
          className={`atlas-asset-card ${isSelected ? 'atlas-selected' : ''} ${isDragging ? 'atlas-dragging' : ''}`}
          data-type={asset.type}
          onClick={(event) => onSelect(asset.id, event)}
          onDoubleClick={handleDoubleClick}
          onContextMenu={(event) => { event.preventDefault(); event.stopPropagation(); onContextMenu(asset, event); }}
          role="button"
          tabIndex={0}
          aria-selected={isSelected}
          aria-labelledby={nameId}
          draggable
          onDragStart={(event) => onDragStart(asset.id, event)}
          onDragEnd={onDragEnd}
          onKeyDown={(event) => { if (event.key === 'Enter' || event.key === ' ') onSelect(asset.id, event); }}
        >
          <div className="atlas-asset-card-thumb">
            <Artwork asset={asset} />

            <div className="atlas-asset-card-checkbox" onClick={(event) => { event.stopPropagation(); onSelect(asset.id, event, true); }}>
              <LabelTooltip label={`Select ${asset.name}`}>
                <input type="checkbox" checked={isSelected} onChange={() => {}} />
              </LabelTooltip>
            </div>

            {statblockPath && spawnCount <= 1 && (
              <LabelTooltip label="Statblock linked – click to open">
                <div
                  className="atlas-asset-statblock-indicator"
                  onClick={(event) => { event.stopPropagation(); onOpenStatblock(statblockPath); }}
                >
                  <Link size={12} />
                </div>
              </LabelTooltip>
            )}

            {spawnCount > 1 && (
              <div className="atlas-asset-spawn-badge" onDoubleClick={(event) => event.stopPropagation()}>
                <LabelTooltip label="Decrease spawn count">
                  <button
                    type="button"
                    className="atlas-spawn-btn"
                    onClick={(event) => { event.stopPropagation(); onSpawnCountChange(asset.id, -1); }}
                  >−</button>
                </LabelTooltip>
                <span className="atlas-spawn-count">×{spawnCount}</span>
                <LabelTooltip label="Increase spawn count">
                  <button
                    type="button"
                    className="atlas-spawn-btn"
                    onClick={(event) => { event.stopPropagation(); onSpawnCountChange(asset.id, 1); }}
                  >+</button>
                </LabelTooltip>
                <LabelTooltip label={`Spawn ${spawnCount} tokens`}>
                  <button
                    type="button"
                    className="atlas-spawn-btn atlas-spawn-go"
                    onClick={(event) => { event.stopPropagation(); onOpen(asset, spawnCount); }}
                  >Go</button>
                </LabelTooltip>
              </div>
            )}
          </div>
          <span id={nameId} className="atlas-asset-card-name">{asset.name}</span>
        </div>
      </TooltipTrigger>
      <TooltipContent className="atlas-asset-card-tooltip" side="top" sideOffset={10}>
        {asset.name}
      </TooltipContent>
    </Tooltip>
  );
});
