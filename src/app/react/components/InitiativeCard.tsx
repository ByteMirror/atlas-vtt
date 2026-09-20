import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { GripVertical, Skull, User, Bot } from 'lucide-react';
import type { InitiativeEntry } from '../../types/initiativeTypes';
import { useAtlasUI } from '../root/AtlasUIContext';
import { useAtlasStore } from '../ViewStoreContext';
import { zoomToTokenWithHighlight } from '../../pixi/utils/tokenHighlight';

interface InitiativeCardProps {
  entry: InitiativeEntry;
  index: number;
  isHoveredForPreview: boolean;
  onDragStart: (index: number) => void;
  onDragOver: (index: number) => void;
  onDragEnd: () => void;
  onContextMenu: (e: React.MouseEvent, entry: InitiativeEntry, cardElement: HTMLElement) => void;
  onHover: (entry: InitiativeEntry | null, cardElement?: HTMLElement) => void;
}

/**
 * Individual initiative tracker card
 * Displays token avatar, name, initiative value, HP bar, and optional stress bar
 */
export const InitiativeCard: React.FC<InitiativeCardProps> = ({
  entry,
  index,
  isHoveredForPreview,
  onDragStart,
  onDragOver,
  onDragEnd,
  onContextMenu,
  onHover,
}) => {
  const { app, view } = useAtlasUI();
  const tokens = useAtlasStore((s) => s.objects?.tokens) || {};
  const tokenSettings = useAtlasStore((s) => s.tokenSettings);
  const [dropPosition, setDropPosition] = useState<'above' | 'below' | null>(null);
  const cardRef = useRef<HTMLDivElement>(null);
  const isPointerInsideRef = useRef(false);
  const isModifierKeyDownRef = useRef(false);

  // Instance badge: show when 2+ tokens share the same imagePath
  const instanceBadge = useMemo((): number | null => {
    if (!(tokenSettings?.showInstanceBadges ?? true)) return null;
    const token = tokens[entry.tokenId];
    if (!token?.instanceNumber) return null;
    const sameImageCount = Object.values(tokens).filter(
      (t) => t.imagePath === token.imagePath,
    ).length;
    return sameImageCount >= 2 ? token.instanceNumber : null;
  }, [tokens, entry.tokenId, tokenSettings?.showInstanceBadges]);

  // Calculate HP percentage and color
  const hpPercentage = entry.hp.max > 0
    ? Math.max(0, Math.min(100, (entry.hp.current / entry.hp.max) * 100))
    : 0;

  // Match thresholds from hp-bar.tsx: >=70% ok, 30-69% warn, <30% crit
  const getHPColorClass = (): string => {
    if (hpPercentage >= 70) return 'initiative-card__hp-fill--healthy';
    if (hpPercentage >= 30) return 'initiative-card__hp-fill--injured';
    return 'initiative-card__hp-fill--critical';
  };

  // Get image URL from vault path
  const getImageUrl = useCallback((imagePath: string): string => {
    if (!imagePath || !app) return '';

    // Handle already-resolved URLs
    if (imagePath.startsWith('http') || imagePath.startsWith('data:') || imagePath.startsWith('blob:')) {
      return imagePath;
    }

    // Resolve vault path to resource URL
    try {
      return app.vault.adapter.getResourcePath(imagePath);
    } catch {
      return '';
    }
  }, [app]);

  const triggerPreviewIfEligible = useCallback((): void => {
    if (!isModifierKeyDownRef.current || !entry.statblockPath || !cardRef.current || isHoveredForPreview) {
      return;
    }

    onHover(entry, cardRef.current);
  }, [entry, isHoveredForPreview, onHover]);

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent): void => {
      if (event.key !== 'Meta' && event.key !== 'Control') {
        return;
      }

      isModifierKeyDownRef.current = true;

      if (isPointerInsideRef.current) {
        triggerPreviewIfEligible();
      }
    };

    const handleKeyUp = (event: KeyboardEvent): void => {
      if (event.key !== 'Meta' && event.key !== 'Control') {
        return;
      }

      isModifierKeyDownRef.current = false;
    };

    const handleWindowBlur = (): void => {
      isModifierKeyDownRef.current = false;
    };

    window.addEventListener('keydown', handleKeyDown);
    window.addEventListener('keyup', handleKeyUp);
    window.addEventListener('blur', handleWindowBlur);

    return () => {
      window.removeEventListener('keydown', handleKeyDown);
      window.removeEventListener('keyup', handleKeyUp);
      window.removeEventListener('blur', handleWindowBlur);
    };
  }, [triggerPreviewIfEligible]);

  // Handle drag start
  const handleDragStart = (e: React.DragEvent): void => {
    e.dataTransfer.effectAllowed = 'move';
    e.dataTransfer.setData('text/plain', String(index));
    onDragStart(index);
  };

  // Handle drag over
  const handleDragOver = (e: React.DragEvent): void => {
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';

    // Determine if dropping above or below
    const rect = cardRef.current?.getBoundingClientRect();
    if (rect) {
      const midY = rect.top + rect.height / 2;
      setDropPosition(e.clientY < midY ? 'above' : 'below');
    }

    onDragOver(index);
  };

  // Handle drag leave
  const handleDragLeave = (): void => {
    setDropPosition(null);
  };

  // Handle drop
  const handleDrop = (e: React.DragEvent): void => {
    e.preventDefault();
    setDropPosition(null);
    onDragEnd();
  };

  // Handle context menu
  const handleContextMenu = (e: React.MouseEvent): void => {
    e.preventDefault();
    if (cardRef.current) {
      onContextMenu(e, entry, cardRef.current);
    }
  };

  // Handle hover for statblock preview (CMD+hover)
  // Preview stays open while CMD is held - only closes on CMD release
  const handleMouseEnter = (e: React.MouseEvent): void => {
    isPointerInsideRef.current = true;
    isModifierKeyDownRef.current = e.metaKey || e.ctrlKey || isModifierKeyDownRef.current;
    triggerPreviewIfEligible();
  };

  const handleMouseMove = (e: React.MouseEvent): void => {
    isModifierKeyDownRef.current = e.metaKey || e.ctrlKey || isModifierKeyDownRef.current;
    triggerPreviewIfEligible();
  };

  // Don't close on mouse leave - CMD release handles closing
  const handleMouseLeave = (): void => {
    isPointerInsideRef.current = false;
  };

  // Handle click to zoom to token
  const handleClick = useCallback((): void => {
    const token = tokens[entry.tokenId];
    if (!token || !view) return;

    zoomToTokenWithHighlight(view, entry.tokenId, { x: token.x, y: token.y });
  }, [entry.tokenId, tokens, view]);

  // Build class names
  const cardClasses = [
    'initiative-card',
    entry.isActive && 'initiative-card--active',
    entry.isDefeated && 'initiative-card--defeated',
    isHoveredForPreview && 'initiative-card--preview-hover',
    dropPosition === 'above' && 'initiative-card--drop-above',
    dropPosition === 'below' && 'initiative-card--drop-below',
  ].filter(Boolean).join(' ');

  return (
    <div
      ref={cardRef}
      className={cardClasses}
      draggable
      onClick={handleClick}
      onDragStart={handleDragStart}
      onDragOver={handleDragOver}
      onDragLeave={handleDragLeave}
      onDrop={handleDrop}
      onContextMenu={handleContextMenu}
      onMouseEnter={handleMouseEnter}
      onMouseMove={handleMouseMove}
      onMouseLeave={handleMouseLeave}
      role="listitem"
      aria-roledescription="initiative card"
    >
      {/* Drag Handle */}
      <div className="initiative-card__drag-handle">
        <GripVertical />
      </div>

      {/* Avatar with optional instance badge */}
      <div className="initiative-card__avatar-wrapper">
        <div className="initiative-card__avatar">
          {entry.imagePath ? (
            <img
              src={getImageUrl(entry.imagePath)}
              alt={entry.name}
              onError={(e) => {
                e.currentTarget.hide();
              }}
            />
          ) : (
            entry.isNPC ? <Bot /> : <User />
          )}

          {/* Defeated overlay */}
          {entry.isDefeated && (
            <div className="initiative-card__defeated-overlay">
              <Skull />
            </div>
          )}
        </div>

        {instanceBadge != null && (
          <span className="initiative-card__instance-badge">{instanceBadge}</span>
        )}
      </div>

      {/* Initiative number */}
      <span className="initiative-card__initiative">
        {entry.initiative}
      </span>

      {/* HP Bar */}
      <div className="initiative-card__hp-bar">
        <div
          className={`initiative-card__hp-fill ${getHPColorClass()}`}
          style={{ width: `${hpPercentage}%` }}
        />
      </div>
    </div>
  );
};
