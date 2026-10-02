import React, { useEffect, useRef } from 'react';
import { isActiveAtlasLeaf } from '../../utils/activeLeafGuard';
import type { InitiativeEntry } from '../../types/initiativeTypes';

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

export function EditInitiativePopup({
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
        className="atlas-initiative-edit-backdrop"
        onClick={onCancel}
      />
      <div
        ref={popupRef}
        className="atlas-initiative-edit-popup"
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
          className="atlas-initiative-edit-popup__input"
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder="0"
        />
        <span className="atlas-initiative-edit-popup__hint">Enter to save · Esc to cancel</span>
      </div>
    </>
  );
}
