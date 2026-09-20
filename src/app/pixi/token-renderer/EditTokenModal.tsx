import React, { useState, useRef, useEffect } from 'react';
import { X, Check } from 'lucide-react';
import { createRoot } from 'react-dom/client';
import type { StoreApi } from 'zustand';
import type { ViewAtlasState } from '../../storeFactory';
import { WALLS_AND_LIGHTING_ENABLED } from '../../featureFlags';
import { CloseButton } from '../../packages/components/primitives/CloseButton';

interface EditTokenModalProps {
  name: string;
  showNameplate: boolean;
  playerLinked: boolean;
  visionInnerRadius: number | undefined;
  visionOuterRadius: number | undefined;
  unitLabel: string;
  onSave: (name: string, showNameplate: boolean, visionInnerRadius: number | undefined, visionOuterRadius: number | undefined) => void;
  onClose: () => void;
}

function parseVisionInput(value: string): number | undefined {
  const trimmed = value.trim();
  if (trimmed === '') return undefined;
  const num = Number(trimmed);
  return isNaN(num) ? undefined : num;
}

function EditTokenModalInner({
  name: initialName,
  showNameplate: initialShowNameplate,
  playerLinked,
  visionInnerRadius: initialVisionInnerRadius,
  visionOuterRadius: initialVisionOuterRadius,
  unitLabel,
  onSave,
  onClose,
}: EditTokenModalProps): React.ReactElement {
  const [name, setName] = useState(initialName);
  const [showNameplate, setShowNameplate] = useState(initialShowNameplate);
  const [visionInnerInput, setVisionInnerInput] = useState(
    initialVisionInnerRadius !== undefined ? String(initialVisionInnerRadius) : '',
  );
  const [visionOuterInput, setVisionOuterInput] = useState(
    initialVisionOuterRadius !== undefined ? String(initialVisionOuterRadius) : '',
  );
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    window.setTimeout(() => {
      inputRef.current?.focus();
      inputRef.current?.select();
    }, 50);
  }, []);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent): void => {
      if (e.key === 'Escape') {
        e.preventDefault();
        e.stopPropagation();
        onClose();
      } else if (e.key === 'Enter') {
        e.preventDefault();
        onSave(
          name,
          showNameplate,
          parseVisionInput(visionInnerInput),
          parseVisionInput(visionOuterInput),
        );
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [name, showNameplate, visionInnerInput, visionOuterInput, onSave, onClose]);

  const handleSave = (): void => {
    onSave(
      name,
      showNameplate,
      parseVisionInput(visionInnerInput),
      parseVisionInput(visionOuterInput),
    );
  };

  return (
    <div className="atlas-modal-overlay" onClick={onClose}>
      <div className="atlas-modal atlas-edit-token-modal" onClick={(e) => e.stopPropagation()}>
        {/* Header */}
        <div className="atlas-modal-header">
          <h3>Edit Token</h3>
          <CloseButton onClick={onClose} />
        </div>

        {/* Content */}
        <div className="atlas-modal-content">
          {/* Name field */}
          <div className="atlas-edit-token__field">
            <label className="atlas-edit-token__label">Name</label>
            <input
              ref={inputRef}
              type="text"
              className="atlas-input"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Token name"
            />
          </div>

          {/* Show Nameplate toggle */}
          <div className="atlas-edit-token__field atlas-edit-token__field--row">
            <label className="atlas-edit-token__label">Show Nameplate</label>
            <div className="atlas-toggle" onClick={() => setShowNameplate(!showNameplate)}>
              <div className={showNameplate
                ? 'atlas-toggle__switch atlas-toggle__switch--on'
                : 'atlas-toggle__switch atlas-toggle__switch--off'
              }>
                <div className={showNameplate
                  ? 'atlas-toggle__thumb atlas-toggle__thumb--on'
                  : 'atlas-toggle__thumb atlas-toggle__thumb--off'
                }>
                  {showNameplate
                    ? <Check className="atlas-toggle__icon" />
                    : <X className="atlas-toggle__icon" />
                  }
                </div>
              </div>
            </div>
          </div>

          {/* Vision Override — only for player-linked tokens */}
          {WALLS_AND_LIGHTING_ENABLED && playerLinked && (
            <>
              <div className="atlas-edit-token__section-divider" />
              <div className="atlas-edit-token__section-label">Vision Override</div>

              <div className="atlas-edit-token__field">
                <label className="atlas-edit-token__label">Bright Vision Range{unitLabel ? ` (${unitLabel})` : ''}</label>
                <div className="atlas-edit-token__input-row">
                  <input
                    type="number"
                    className="atlas-input"
                    value={visionInnerInput}
                    onChange={(e) => setVisionInnerInput(e.target.value)}
                    placeholder="(collection default)"
                    min={0}
                  />
                  {visionInnerInput !== '' && (
                    <button
                      className="atlas-button atlas-button-ghost atlas-edit-token__clear-btn"
                      onClick={() => setVisionInnerInput('')}
                      title="Reset to collection default"
                    >
                      <X size={12} />
                    </button>
                  )}
                </div>
              </div>

              <div className="atlas-edit-token__field">
                <label className="atlas-edit-token__label">Dim Vision Range{unitLabel ? ` (${unitLabel})` : ''}</label>
                <div className="atlas-edit-token__input-row">
                  <input
                    type="number"
                    className="atlas-input"
                    value={visionOuterInput}
                    onChange={(e) => setVisionOuterInput(e.target.value)}
                    placeholder="(collection default)"
                    min={0}
                  />
                  {visionOuterInput !== '' && (
                    <button
                      className="atlas-button atlas-button-ghost atlas-edit-token__clear-btn"
                      onClick={() => setVisionOuterInput('')}
                      title="Reset to collection default"
                    >
                      <X size={12} />
                    </button>
                  )}
                </div>
              </div>
            </>
          )}
        </div>

        {/* Footer */}
        <div className="atlas-modal-footer">
          <button className="atlas-button atlas-button-secondary" onClick={onClose}>
            Cancel
          </button>
          <button className="atlas-button atlas-button-primary" onClick={handleSave}>
            Save
          </button>
        </div>
      </div>
    </div>
  );
}

/**
 * Imperatively opens an Edit Token modal by mounting a React root.
 * Call from non-React code (e.g. InteractionController).
 */
export function openEditTokenModal(
  token: {
    id: string;
    name?: string;
    showNameplate?: boolean;
    playerLinked?: boolean;
    visionInnerRadius?: number;
    visionOuterRadius?: number;
  },
  store: StoreApi<ViewAtlasState>,
): void {
  const container = document.body.createDiv({ cls: 'atlas-vtt-plugin atlas-vtt-root' });

  const root = createRoot(container);

  const cleanup = (): void => {
    root.unmount();
    container.remove();
  };

  const handleSave = (
    name: string,
    showNameplate: boolean,
    visionInnerRadius: number | undefined,
    visionOuterRadius: number | undefined,
  ): void => {
    store.getState().updateToken(token.id, {
      name,
      showNameplate,
      visionInnerRadius,
      visionOuterRadius,
    } as any);
    cleanup();
  };

  // Derive unit label from grid settings
  const grid = store.getState().grid;
  const unitType = grid?.unitType ?? 'feet';
  const unitLabel = unitType === 'meters' ? 'm' : unitType === 'feet' ? 'ft' : '';

  root.render(
    <EditTokenModalInner
      name={token.name ?? ''}
      showNameplate={token.showNameplate ?? false}
      playerLinked={token.playerLinked ?? false}
      visionInnerRadius={token.visionInnerRadius}
      visionOuterRadius={token.visionOuterRadius}
      unitLabel={unitLabel}
      onSave={handleSave}
      onClose={cleanup}
    />,
  );
}
