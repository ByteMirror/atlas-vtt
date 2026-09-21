import React, { useState, useCallback, useMemo, useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';
import { openContextMenuGlobal, type ContextMenuEntry } from '../root/ContextMenuContext';
import {
  Dices,
  Swords,
  Square,
  ChevronUp,
  ChevronDown,
} from 'lucide-react';
import { useAtlasStore } from '../ViewStoreContext';
import { useAtlasUI } from '../root/AtlasUIContext';
import { isActiveAtlasLeaf } from '../../utils/activeLeafGuard';
import { InitiativeCard } from './InitiativeCard';
import { StatblockHoverPreview, useStatblockHoverPreview } from './StatblockHoverPreview';
import type { InitiativeEntry } from '../../types/initiativeTypes';
import type { Character } from '../../types';
import type { ViewAtlasState } from '../../storeFactory';
import './initiative-tracker.scss';

/**
 * Compact popup for editing initiative value
 * Positioned like statblock preview, anchored to the card
 */
interface EditInitiativePopupProps {
  entry: InitiativeEntry;
  anchorRect: DOMRect;
  value: string;
  onChange: (value: string) => void;
  onConfirm: () => void;
  onCancel: () => void;
}

function EditInitiativePopup({
  entry,
  anchorRect,
  value,
  onChange,
  onConfirm,
  onCancel,
}: EditInitiativePopupProps): React.ReactElement {
  const inputRef = useRef<HTMLInputElement>(null);
  const popupRef = useRef<HTMLDivElement>(null);
  const padding = 16;

  // Focus input on mount
  useEffect(() => {
    window.setTimeout(() => {
      inputRef.current?.focus();
      inputRef.current?.select();
    }, 50);
  }, []);

  // Handle keyboard
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent): void => {
      if (!isActiveAtlasLeaf()) return;
      if (e.key === 'Enter') {
        e.preventDefault();
        onConfirm();
      } else if (e.key === 'Escape') {
        e.preventDefault();
        onCancel();
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [onConfirm, onCancel]);

  // Calculate position (to the left of anchor, centered vertically)
  const viewportWidth = window.innerWidth;
  const viewportHeight = window.innerHeight;
  const anchorCenterY = anchorRect.top + anchorRect.height / 2;
  const popupHeight = 44; // Approximate height of the compact popup

  let top = anchorCenterY - popupHeight / 2;
  top = Math.max(padding, Math.min(viewportHeight - popupHeight - padding, top));

  const right = viewportWidth - anchorRect.left + padding;

  return (
    <>
      {/* Backdrop to close on click outside */}
      <div
        className="initiative-edit-backdrop"
        onClick={onCancel}
      />
      <div
        ref={popupRef}
        className="initiative-edit-popup"
        style={{
          position: 'fixed',
          top,
          right,
        }}
        onClick={(e) => e.stopPropagation()}
      >
        <input
          ref={inputRef}
          type="number"
          className="initiative-edit-popup__input"
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder="0"
        />
        <span className="initiative-edit-popup__hint">Enter to save · Esc to cancel</span>
      </div>
    </>
  );
}

type NewInitiativeEntry = Parameters<ViewAtlasState['addToInitiative']>[0];
type Vitals = { current: number; max: number };

/** Characters store HP either as a single number or as current/max. */
function readHp(character: Character): Vitals | null {
  if (!character.hp) return null;
  return typeof character.hp === 'object'
    ? { current: character.hp.current, max: character.hp.max }
    : { current: character.hp, max: character.hp };
}

function readStress(character: Character): Vitals | undefined {
  if (character.stress === undefined) return undefined;
  return typeof character.stress === 'object'
    ? { current: character.stress.current, max: character.stress.max }
    : { current: character.stress, max: character.maxStress ?? 10 };
}

/**
 * Initiative Tracker Panel
 * Modern minimal design with floating cards - auto-syncs with map tokens
 */
export const InitiativeTracker: React.FC = () => {
  const { app } = useAtlasUI();

  // Store state
  const isOpen = useAtlasStore((s) => s.initiativeTrackerOpen);
  const initiative = useAtlasStore((s) => s.initiative);
  const tokens = useAtlasStore((s) => s.objects?.tokens) || {};

  // Store actions
  const addToInitiative = useAtlasStore((s) => s.addToInitiative);
  const removeFromInitiative = useAtlasStore((s) => s.removeFromInitiative);
  const rollAllInitiative = useAtlasStore((s) => s.rollAllInitiative);
  const rollEntryInitiative = useAtlasStore((s) => s.rollEntryInitiative);
  const nextTurn = useAtlasStore((s) => s.nextTurn);
  const previousTurn = useAtlasStore((s) => s.previousTurn);
  const reorderInitiative = useAtlasStore((s) => s.reorderInitiative);
  const moveToFront = useAtlasStore((s) => s.moveToFront);
  const moveToBack = useAtlasStore((s) => s.moveToBack);
  const startCombat = useAtlasStore((s) => s.startCombat);
  const endCombat = useAtlasStore((s) => s.endCombat);
  const updateInitiativeEntry = useAtlasStore((s) => s.updateInitiativeEntry);

  // Local state
  const [dragFromIndex, setDragFromIndex] = useState<number | null>(null);
  const [dragOverIndex, setDragOverIndex] = useState<number | null>(null);
  const [hotkeyPressed, setHotkeyPressed] = useState<'prev' | 'next' | null>(null);
  const [editingEntry, setEditingEntry] = useState<InitiativeEntry | null>(null);
  const [editAnchorRect, setEditAnchorRect] = useState<DOMRect | null>(null);
  const [editValue, setEditValue] = useState<string>('');

  // Refs for turn navigation buttons
  const prevBtnRef = useRef<HTMLButtonElement>(null);
  const nextBtnRef = useRef<HTMLButtonElement>(null);

  // Use shared statblock hover preview hook
  const [previewState, previewActions] = useStatblockHoverPreview<InitiativeEntry>({ app });

  // Listen for hotkey events to provide visual feedback
  useEffect(() => {
    const handleHotkey = (e: CustomEvent<'prev' | 'next'>): void => {
      setHotkeyPressed(e.detail);
      // Clear after animation duration
      window.setTimeout(() => setHotkeyPressed(null), 150);
    };

    window.addEventListener('atlas-initiative-hotkey', handleHotkey as EventListener);
    return () => window.removeEventListener('atlas-initiative-hotkey', handleHotkey as EventListener);
  }, []);

  // Auto-sync: Add all map tokens to initiative automatically
  useEffect(() => {
    const tokenIds = Object.keys(tokens);
    const existingTokenIds = new Set(initiative.entries.map(e => e.tokenId));
    const removedSet = new Set(initiative.removedTokenIds ?? []);

    tokenIds.forEach((tokenId) => {
      if (existingTokenIds.has(tokenId)) return;
      // Skip tokens explicitly removed by the user
      if (removedSet.has(tokenId)) return;

      const token = tokens[tokenId];
      if (!token) return;

      const character = token.kind === 'character' ? token : null;
      const hp = (character && readHp(character)) ?? { current: 10, max: 10 };
      const stress = character ? readStress(character) : undefined;

      const entry: NewInitiativeEntry = {
        tokenId,
        name: character ? character.name : 'Token',
        initiative: 0,
        initiativeModifier: 0,
        hp,
        imagePath: token.imagePath,
        isDefeated: hp.current <= 0,
        isNPC: !character?.playerLinked,
        ...(stress ? { stress } : {}),
        ...(character?.statblockPath ? { statblockPath: character.statblockPath } : {}),
      };

      addToInitiative(entry);
    });

    // Also remove entries for tokens that no longer exist
    initiative.entries.forEach((entry) => {
      if (!tokens[entry.tokenId]) {
        removeFromInitiative(entry.id);
      }
    });
  // Deliberately not keyed on `initiative`: re-sync only when map tokens change, not on entry edits.
  }, [tokens, addToInitiative, removeFromInitiative]);

  // Sync HP/stress changes from tokens to initiative entries
  useEffect(() => {
    initiative.entries.forEach((entry) => {
      const token = tokens[entry.tokenId];
      if (!token) return;

      const updates: Partial<InitiativeEntry> = {};

      if (entry.imagePath !== token.imagePath) {
        updates.imagePath = token.imagePath;
      }

      if (token.kind === 'character') {
        if (entry.name !== token.name) {
          updates.name = token.name;
        }

        const tokenHp = readHp(token);
        if (tokenHp && (entry.hp.current !== tokenHp.current || entry.hp.max !== tokenHp.max)) {
          updates.hp = tokenHp;
          updates.isDefeated = tokenHp.current <= 0;
        }

        const stressUpdate = readStress(token);
        const existingStress = entry.stress;
        const stressChanged = stressUpdate
          ? !existingStress
            || existingStress.current !== stressUpdate.current
            || existingStress.max !== stressUpdate.max
          : existingStress !== undefined;

        if (stressChanged) {
          updates.stress = stressUpdate;
        }

        const tokenStatblockPath = token.statblockPath?.trim() ? token.statblockPath : undefined;

        if (entry.statblockPath !== tokenStatblockPath) {
          updates.statblockPath = tokenStatblockPath;
        }
      }

      if (Object.keys(updates).length > 0) {
        updateInitiativeEntry(entry.id, updates);
      }
    });
  }, [tokens, initiative.entries, updateInitiativeEntry]);

  // Sorted entries by order
  const sortedEntries = useMemo(() => {
    return [...initiative.entries].sort((a, b) => a.order - b.order);
  }, [initiative.entries]);

  // Drag and drop handlers
  const handleDragStart = useCallback((index: number): void => {
    setDragFromIndex(index);
  }, []);

  const handleDragOver = useCallback((index: number): void => {
    setDragOverIndex(index);
  }, []);

  const handleDragEnd = useCallback((): void => {
    if (dragFromIndex !== null && dragOverIndex !== null && dragFromIndex !== dragOverIndex) {
      reorderInitiative(dragFromIndex, dragOverIndex);
    }
    setDragFromIndex(null);
    setDragOverIndex(null);
  }, [dragFromIndex, dragOverIndex, reorderInitiative]);

  // Context menu handler
  const handleContextMenu = useCallback(
    (e: React.MouseEvent, entry: InitiativeEntry, cardElement: HTMLElement): void => {
      const entries: ContextMenuEntry[] = [
        { type: 'item', label: 'Roll Initiative', icon: 'dice', onClick: () => rollEntryInitiative(entry.id) },
        { type: 'separator' },
        { type: 'item', label: 'Move to Front', icon: 'arrow-up-to-line', onClick: () => moveToFront(entry.id) },
        { type: 'item', label: 'Move to Back', icon: 'arrow-down-to-line', onClick: () => moveToBack(entry.id) },
        { type: 'separator' },
        {
          type: 'item', label: 'Edit Initiative', icon: 'pencil',
          onClick: () => {
            setEditingEntry(entry);
            setEditAnchorRect(cardElement.getBoundingClientRect());
            setEditValue(String(entry.initiative));
          },
        },
        { type: 'separator' },
        { type: 'item', label: 'Remove from Initiative', icon: 'trash-2', destructive: true, onClick: () => removeFromInitiative(entry.id) },
      ];

      openContextMenuGlobal(entries, { x: e.clientX, y: e.clientY });
    },
    [rollEntryInitiative, moveToFront, moveToBack, updateInitiativeEntry, removeFromInitiative]
  );

  // Hover handler for statblock preview (CMD+hover)
  // Preview stays open while CMD is held - only CMD release closes it
  const handleEntryHover = useCallback(
    (entry: InitiativeEntry | null, cardElement?: HTMLElement): void => {
      // Ignore null entries - only CMD release closes the preview
      if (!entry || !entry.statblockPath) {
        return;
      }

      // Use the shared preview hook
      previewActions.showPreview(entry, entry.statblockPath, cardElement);
    },
    [previewActions]
  );

  // Don't render if closed
  if (!isOpen) return null;

  return (
    <div className="initiative-tracker">
      {/* Controls row: Roll + Combat + Close */}
      <div className="initiative-tracker__controls">
        {/* Roll All button */}
        <button
          className="clickable-icon initiative-tracker__btn"
          onClick={rollAllInitiative}
          disabled={sortedEntries.length === 0}
        >
          <Dices />
        </button>

        {/* Start/End Combat button */}
        {!initiative.isActive ? (
          <button
            className="clickable-icon initiative-tracker__btn"
            onClick={startCombat}
            disabled={sortedEntries.length === 0}
          >
            <Swords />
          </button>
        ) : (
          <button
            className="clickable-icon initiative-tracker__btn initiative-tracker__btn--end"
            onClick={endCombat}
          >
            <Square />
          </button>
        )}
      </div>

      {/* Content - Cards for each token */}
      <div className="initiative-tracker__content">
        {sortedEntries.map((entry, index) => (
          <InitiativeCard
            key={entry.id}
            entry={entry}
            index={index}
            isHoveredForPreview={previewState.hoveredEntry?.id === entry.id}
            onDragStart={handleDragStart}
            onDragOver={handleDragOver}
            onDragEnd={handleDragEnd}
            onContextMenu={handleContextMenu}
            onHover={handleEntryHover}
          />
        ))}
      </div>

      {/* Statblock Preview - using shared component */}
      {/* Key forces remount on entry change to trigger animation */}
      <StatblockHoverPreview
        key={previewState.hoveredEntry?.id || 'none'}
        notePath={previewState.notePath}
        app={app}
        vitals={
          previewState.hoveredEntry && {
            ...previewState.hoveredEntry,
            ringColor: tokens[previewState.hoveredEntry.tokenId]?.ringColor,
          }
        }
        isVisible={previewState.isVisible}
        isClosing={previewState.isClosing}
        position={previewState.position}
        anchorRect={previewState.anchorRect}
        preferredSide="left"
      />

      {/* Turn navigation — always visible, disabled when combat inactive */}
      <div className="initiative-tracker__turn-controls">
        <button
          ref={prevBtnRef}
          className={`clickable-icon initiative-tracker__btn ${hotkeyPressed === 'prev' ? 'initiative-tracker__btn--pressed' : ''}`}
          onClick={previousTurn}
          disabled={!initiative.isActive}
        >
          <ChevronUp />
        </button>
        <span className="initiative-tracker__round">
          {initiative.isActive ? `R${initiative.round}` : '—'}
        </span>
        <button
          ref={nextBtnRef}
          className={`clickable-icon initiative-tracker__btn ${hotkeyPressed === 'next' ? 'initiative-tracker__btn--pressed' : ''}`}
          onClick={nextTurn}
          disabled={!initiative.isActive}
        >
          <ChevronDown />
        </button>
      </div>

      {/* Edit Initiative Popup - positioned like statblock preview */}
      {editingEntry && editAnchorRect && createPortal(
        <EditInitiativePopup
          entry={editingEntry}
          anchorRect={editAnchorRect}
          value={editValue}
          onChange={setEditValue}
          onConfirm={() => {
            const parsed = parseInt(editValue, 10);
            if (!isNaN(parsed)) {
              updateInitiativeEntry(editingEntry.id, { initiative: parsed });
            }
            setEditingEntry(null);
            setEditAnchorRect(null);
          }}
          onCancel={() => {
            setEditingEntry(null);
            setEditAnchorRect(null);
          }}
        />,
        document.body
      )}
    </div>
  );
};
