import React, { useRef } from 'react';
import { Map as MapIcon, Link } from 'lucide-react';
import type {
  AnyAsset, TokenAsset, MapAsset, EncounterAsset,
} from '../types';
import {
  spawnTokenAsset,
  spawnEncounterTokens,
  type SpawnContext,
} from '../utils/tokenSpawnService';
import type { AssetService } from '../../../../services/AssetService';
import { Notice, TFile } from 'obsidian';
import { runInBackground } from '../../../../utils/backgroundTask';
import { TokenPortrait } from '../../shared/TokenPortrait';
import { Tooltip, TooltipContent, TooltipTrigger } from '../../primitives/tooltip';

export interface AssetCardProps {
  asset: AnyAsset;
  isSelected: boolean;
  onSelect: (assetId: string, event?: React.MouseEvent, toggle?: boolean) => void;
  onContextMenu: (asset: AnyAsset, event: React.MouseEvent) => void;
  onClose: () => void;
  draggedItems: { type: 'asset' | 'folder'; ids: string[] } | null;
  setDraggedItems: React.Dispatch<React.SetStateAction<{ type: 'asset' | 'folder'; ids: string[] } | null>>;
  selectedAssetIds: string[];
  view: any;
  addToken: (data: any) => string;
  setSelection: (ids: string[]) => void;
  app: any;
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
  const spawnCountRef = useRef(spawnCount);
  spawnCountRef.current = spawnCount;

  const resolveVaultImageUrl = (path?: string): string | null => {
    if (!path) return null;
    try {
      const file = app?.vault?.getAbstractFileByPath?.(path);
      if (file instanceof TFile) {
        return app.vault.getResourcePath(file);
      }
    } catch {
      // fall through to the raw path
    }
    return path;
  };

  const encounterTokens = asset.type === 'encounters'
    ? ((asset as EncounterAsset).tokens || [])
    : [];
  const encounterPreviewUrls = encounterTokens
    .map((token) => resolveVaultImageUrl(token.imagePath))
    .filter((url): url is string => Boolean(url))
    .slice(0, 3);
  const encounterOverflowCount = Math.max(0, encounterTokens.length - encounterPreviewUrls.length);

  const handleClick = (event: React.MouseEvent): void => {
    onSelect(asset.id, event);
  };

  const handleDoubleClick = async (event: React.MouseEvent): Promise<void> => {
    event.preventDefault();
    event.stopPropagation();
    if (event.shiftKey) return;

    const spawnCtx: SpawnContext = { app, view, addToken, setSelection, assetService };

    if (asset.type === 'maps') {
      try {
        const mapAsset = asset as MapAsset;
        const backgroundPath =
          (mapAsset as any).mapFilePath ?? (mapAsset as any).imagePath ?? (mapAsset as any).imageUrl ?? null;
        window.dispatchEvent(
          new CustomEvent('create-scene-from-map', {
            detail: { map: mapAsset, backgroundPath, defaultName: mapAsset.name },
          })
        );
      } catch (error) {
        console.error('[AssetCard] Error dispatching create-scene-from-map:', error);
      }
      return;
    }

    if (asset.type === 'tokens') {
      const count = spawnCountRef.current || 1;
      const ids = await spawnTokenAsset(spawnCtx, asset as TokenAsset, count);
      if (ids.length > 0) onClose();
      return;
    }

    if (asset.type === 'scenes') {
      if (assetService) {
        const serviceAsset = await assetService.getAssetById(asset.id);
        if (serviceAsset?.type === 'scene' && serviceAsset.data?.mapPath) {
          const file = app.vault.getAbstractFileByPath(serviceAsset.data.mapPath);
          if (file) {
            const leaf = app.workspace.getLeaf(false);
            await leaf.openFile(file);
            onClose();
          }
        }
      }
      return;
    }

    if (asset.type === 'encounters') {
      const encounterAsset = asset as EncounterAsset;
      const ids = await spawnEncounterTokens(spawnCtx, encounterAsset);
      const expected = (encounterAsset.tokens || []).length;
      if (ids.length < expected) {
        new Notice(`Spawned ${ids.length} of ${expected} tokens from "${encounterAsset.name}" (some had missing images)`);
      } else {
        new Notice(`Spawned ${ids.length} tokens from "${encounterAsset.name}"`);
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
  const statblockPath = isToken ? (asset as TokenAsset).statblockPath : undefined;

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
        <TokenPortrait src={asset.thumbnailUrl} alt={asset.name} />
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
          aria-label={asset.name}
          draggable
          onDragStart={(e) => {
            setDraggedItems({
              type: 'asset',
              ids: selectedAssetIds.includes(asset.id) ? selectedAssetIds : [asset.id],
            });
            e.dataTransfer.effectAllowed = 'move';
          }}
          onDragEnd={() => setDraggedItems(null)}
          onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') handleClick(e as any); }}
        >
          <div className="atlas-asset-card-thumb">
            {renderArtwork()}

            <div className="atlas-asset-card-checkbox" onClick={handleCheckboxClick}>
              <input type="checkbox" checked={isSelected} onChange={() => {}} aria-label={`Select ${asset.name}`} />
            </div>

            {statblockPath && spawnCount <= 1 && (
              <div
                className="atlas-asset-statblock-indicator"
                title="Statblock linked – click to open"
                onClick={(e) => {
                  e.stopPropagation();
                  if (app) app.workspace.openLinkText('', statblockPath, true);
                }}
              >
                <Link size={12} />
              </div>
            )}

            {spawnCount > 1 && (
              <div className="atlas-asset-spawn-badge" onDoubleClick={(e) => e.stopPropagation()}>
                <button
                  type="button"
                  className="atlas-spawn-btn"
                  onClick={(e) => { e.stopPropagation(); onSpawnCountChange(asset.id, -1); }}
                  aria-label="Decrease spawn count"
                >−</button>
                <span className="atlas-spawn-count">×{spawnCount}</span>
                <button
                  type="button"
                  className="atlas-spawn-btn"
                  onClick={(e) => { e.stopPropagation(); onSpawnCountChange(asset.id, 1); }}
                  aria-label="Increase spawn count"
                >+</button>
                <button
                  type="button"
                  className="atlas-spawn-btn atlas-spawn-go"
                  onClick={(e) => { e.stopPropagation(); void handleDoubleClick(e); }}
                  aria-label={`Spawn ${spawnCount} tokens`}
                  title={`Spawn ${spawnCount} tokens`}
                >Go</button>
              </div>
            )}
          </div>
          <span className="atlas-asset-card-name">{asset.name}</span>
        </div>
      </TooltipTrigger>
      <TooltipContent className="atlas-asset-card-tooltip" side="top" sideOffset={10}>
        {asset.name}
      </TooltipContent>
    </Tooltip>
  );
}
