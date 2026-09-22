import React, { useId, useRef } from 'react';
import { Map as MapIcon, Link } from 'lucide-react';
import type { AnyAsset, SelectionEvent } from '../types';
import {
  spawnTokenAsset,
  spawnEncounterTokens,
  type SpawnContext,
} from '../utils/tokenSpawnService';
import type { AssetService } from '../../../../services/AssetService';
import { Notice, TFile, type App } from 'obsidian';
import { runInBackground } from '../../../../utils/backgroundTask';
import { TokenPortrait } from '../../shared/TokenPortrait';
import { LabelTooltip, Tooltip, TooltipContent, TooltipTrigger } from '../../primitives/tooltip';
import type { AtlasView } from '../../../../atlas-view';
import type { ViewAtlasState } from '../../../../storeFactory';

export interface AssetCardProps {
  asset: AnyAsset;
  isSelected: boolean;
  onSelect: (assetId: string, event?: SelectionEvent, toggle?: boolean) => void;
  onContextMenu: (asset: AnyAsset, event: React.MouseEvent) => void;
  onClose: () => void;
  draggedItems: { type: 'asset' | 'folder'; ids: string[] } | null;
  setDraggedItems: React.Dispatch<React.SetStateAction<{ type: 'asset' | 'folder'; ids: string[] } | null>>;
  selectedAssetIds: string[];
  view: AtlasView | null;
  addToken: ViewAtlasState['addToken'];
  setSelection: (ids: string[]) => void;
  app: App;
  assetService: AssetService | null;
  spawnCount: number;
  onSpawnCountChange: (assetId: string, delta: number) => void;
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

export function AssetCard({
  asset,
  isSelected,
  onSelect,
  onContextMenu,
  onClose,
  draggedItems,
  setDraggedItems,
  selectedAssetIds,
  view,
  addToken,
  setSelection,
  app,
  assetService,
  spawnCount,
  onSpawnCountChange,
}: AssetCardProps): React.JSX.Element {
  const nameId = useId();
  const spawnCountRef = useRef(spawnCount);
  spawnCountRef.current = spawnCount;

  const resolveVaultImageUrl = (path?: string): string | null => {
    if (!path) return null;
    try {
      const file = app.vault.getAbstractFileByPath(path);
      if (file instanceof TFile) {
        return app.vault.getResourcePath(file);
      }
    } catch {
      // fall through to the raw path
    }
    return path;
  };

  const encounterTokens = asset.type === 'encounters'
    ? (asset.tokens || [])
    : [];
  const encounterPreviewUrls = encounterTokens
    .map((token) => resolveVaultImageUrl(token.imagePath))
    .filter((url): url is string => Boolean(url))
    .slice(0, 3);
  const encounterOverflowCount = Math.max(0, encounterTokens.length - encounterPreviewUrls.length);

  const handleClick = (event: SelectionEvent): void => {
    onSelect(asset.id, event);
  };

  const handleDoubleClick = async (event: React.MouseEvent): Promise<void> => {
    event.preventDefault();
    event.stopPropagation();
    if (event.shiftKey || event.ctrlKey || event.metaKey) return;

    const spawnCtx: SpawnContext = { app, view, addToken, setSelection, assetService };

    if (asset.type === 'maps') {
      window.dispatchEvent(
        new CustomEvent('create-scene-from-map', {
          detail: { backgroundPath: asset.mapFilePath, defaultName: asset.name },
        })
      );
      return;
    }

    if (asset.type === 'tokens') {
      const count = spawnCountRef.current || 1;
      const ids = await spawnTokenAsset(spawnCtx, asset, count);
      if (ids.length > 0) onClose();
      return;
    }

    if (asset.type === 'scenes') {
      if (assetService) {
        const serviceAsset = await assetService.getAssetById(asset.id);
        if (serviceAsset?.type === 'scene' && serviceAsset.data?.mapPath) {
          const file = app.vault.getAbstractFileByPath(serviceAsset.data.mapPath);
          if (file instanceof TFile) {
            const leaf = app.workspace.getLeaf(false);
            await leaf.openFile(file);
            onClose();
          }
        }
      }
      return;
    }

    if (asset.type === 'encounters') {
      const ids = await spawnEncounterTokens(spawnCtx, asset);
      const expected = (asset.tokens || []).length;
      if (ids.length < expected) {
        new Notice(`Spawned ${ids.length} of ${expected} tokens from "${asset.name}" (some had missing images)`);
      } else {
        new Notice(`Spawned ${ids.length} tokens from "${asset.name}"`);
      }
    }
  };

  const handleRightClick = (event: React.MouseEvent): void => {
    event.preventDefault();
    event.stopPropagation();
    onContextMenu(asset, event);
  };

  const handleCheckboxClick = (event: React.MouseEvent): void => {
    event.stopPropagation();
    onSelect(asset.id, event, true);
  };

  const isDragging = draggedItems?.type === 'asset' && draggedItems.ids.includes(asset.id);
  const isToken = asset.type === 'tokens';
  const statblockPath = isToken ? asset.statblockPath : undefined;

  const renderArtwork = (): React.ReactNode => {
    if (asset.type === 'encounters' && encounterPreviewUrls.length > 0) {
      return (
        <div className="atlas-encounter-preview">
          {encounterPreviewUrls.map((url, index) => (
            <TokenPortrait
              key={`${asset.id}-encounter-preview-${index}`}
              style={encounterPreviewStyle(index, encounterPreviewUrls.length)}
              src={url}
              alt={`${asset.name} token ${index + 1}`}
            />
          ))}
          {encounterOverflowCount > 0 && (
            <div className="atlas-encounter-preview-overflow">+{encounterOverflowCount}</div>
          )}
        </div>
      );
    }
    if (asset.thumbnailUrl) {
      return isToken ? (
        <TokenPortrait showRing={isToken ? asset.showRing : undefined} src={asset.thumbnailUrl} alt={asset.name} />
      ) : (
        <img src={asset.thumbnailUrl} alt={asset.name} draggable={false} />
      );
    }
    return (
      <div className="atlas-asset-placeholder-icon">
        {asset.type === 'scenes' ? <MapIcon size={28} /> : asset.name.charAt(0).toUpperCase()}
      </div>
    );
  };

  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <div
          className={`atlas-asset-card ${isSelected ? 'atlas-selected' : ''} ${isDragging ? 'atlas-dragging' : ''}`}
          data-type={asset.type}
          onClick={handleClick}
          onDoubleClick={(event) => runInBackground(handleDoubleClick(event), `Opening asset ${asset.name}`, 'Could not open the asset')}
          onContextMenu={handleRightClick}
          role="button"
          tabIndex={0}
          aria-selected={isSelected}
          aria-labelledby={nameId}
          draggable
          onDragStart={(e) => {
            setDraggedItems({
              type: 'asset',
              ids: selectedAssetIds.includes(asset.id) ? selectedAssetIds : [asset.id],
            });
            e.dataTransfer.effectAllowed = 'move';
          }}
          onDragEnd={() => setDraggedItems(null)}
          onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') handleClick(e); }}
        >
          <div className="atlas-asset-card-thumb">
            {renderArtwork()}

            <div className="atlas-asset-card-checkbox" onClick={handleCheckboxClick}>
              <LabelTooltip label={`Select ${asset.name}`}>
                <input type="checkbox" checked={isSelected} onChange={() => {}} />
              </LabelTooltip>
            </div>

            {statblockPath && spawnCount <= 1 && (
              <LabelTooltip label="Statblock linked – click to open">
                <div
                  className="atlas-asset-statblock-indicator"
                  onClick={(e) => {
                    e.stopPropagation();
                    void app.workspace.openLinkText('', statblockPath, true);
                  }}
                >
                  <Link size={12} />
                </div>
              </LabelTooltip>
            )}

            {spawnCount > 1 && (
              <div className="atlas-asset-spawn-badge" onDoubleClick={(e) => e.stopPropagation()}>
                <LabelTooltip label="Decrease spawn count">
                  <button
                    type="button"
                    className="atlas-spawn-btn"
                    onClick={(e) => { e.stopPropagation(); onSpawnCountChange(asset.id, -1); }}
                  >−</button>
                </LabelTooltip>
                <span className="atlas-spawn-count">×{spawnCount}</span>
                <LabelTooltip label="Increase spawn count">
                  <button
                    type="button"
                    className="atlas-spawn-btn"
                    onClick={(e) => { e.stopPropagation(); onSpawnCountChange(asset.id, 1); }}
                  >+</button>
                </LabelTooltip>
                <LabelTooltip label={`Spawn ${spawnCount} tokens`}>
                  <button
                    type="button"
                    className="atlas-spawn-btn atlas-spawn-go"
                    onClick={(e) => { e.stopPropagation(); void handleDoubleClick(e); }}
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
}
