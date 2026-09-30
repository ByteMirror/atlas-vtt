import React, { useState, useRef, useEffect } from 'react';
import { X, Check } from 'lucide-react';
import { createRoot } from 'react-dom/client';
import { TFile, type App } from 'obsidian';
import type { StoreApi } from 'zustand';
import type { TokenUpdates, ViewAtlasState } from '../../storeFactory';
import type { TokenEntity } from '../../types';
import { CloseButton } from '../../packages/components/primitives/CloseButton';
import { Button } from '../../packages/components/primitives/button';
import { TooltipProvider } from '../../packages/components/primitives/tooltip';
import { NumberOverrideField, parseNumberInput } from './NumberOverrideField';
import { readStatblockVitals } from './statblockFrontmatter';
import { buildResourceUpdates, statblockResourceDefaults, type ResourceDefaults } from './tokenResourceEdits';
import { TokenLightingFields, type LightChoice } from './TokenLightingFields';
import { WALLS_AND_LIGHTING_ENABLED } from '../../featureFlags';
import { unitLabelFor } from '../../grid/measurementFormat';
import { presetOf } from '../../lighting/lightPresets';
import { carriedLight, visionForm, visionFromForm, type VisionForm } from '../../lighting/tokenLighting';
import { numberText } from '../../utils/numberInput';

interface EditTokenValues {
  name: string;
  showNameplate: boolean;
  maxHp: number | undefined;
  maxStress: number | undefined;
  vision: VisionForm;
  light: LightChoice;
}

interface EditTokenModalProps {
  initial: EditTokenValues;
  resourceDefaults: ResourceDefaults;
  unit: string;
  onSave: (values: EditTokenValues) => void;
  onClose: () => void;
}

const defaultPlaceholder = (value: number | undefined): string =>
  value === undefined ? 'None' : `Statblock default: ${value}`;

function EditTokenModalInner({ initial, resourceDefaults, unit, onSave, onClose }: EditTokenModalProps): React.ReactElement {
  const [name, setName] = useState(initial.name);
  const [showNameplate, setShowNameplate] = useState(initial.showNameplate);
  const [maxHpInput, setMaxHpInput] = useState(numberText(initial.maxHp));
  const [maxStressInput, setMaxStressInput] = useState(numberText(initial.maxStress));
  const [vision, setVision] = useState(initial.vision);
  const [light, setLight] = useState(initial.light);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    window.setTimeout(() => {
      inputRef.current?.focus();
      inputRef.current?.select();
    }, 50);
  }, []);

  const handleSave = (): void => {
    onSave({
      name,
      showNameplate,
      maxHp: parseNumberInput(maxHpInput),
      maxStress: parseNumberInput(maxStressInput),
      vision,
      light,
    });
  };

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent): void => {
      if (e.key === 'Escape') {
        e.preventDefault();
        e.stopPropagation();
        onClose();
      } else if (e.key === 'Enter') {
        e.preventDefault();
        handleSave();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  });


  return (
    <div className="atlas-modal-overlay" onClick={onClose}>
      <div className="atlas-modal atlas-edit-token-modal" onClick={(e) => e.stopPropagation()}>
        <div className="atlas-modal-header">
          <h3>Edit Token</h3>
          <CloseButton onClick={onClose} />
        </div>

        <div className="atlas-modal-body">
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

          <div className="atlas-edit-token__field atlas-edit-token__field--row">
            <label className="atlas-edit-token__label">Show Nameplate</label>
            <div className="atlas-toggle" onClick={() => setShowNameplate(!showNameplate)}>
              <div className={`atlas-toggle__switch atlas-toggle__switch--${showNameplate ? 'on' : 'off'}`}>
                <div className={`atlas-toggle__thumb atlas-toggle__thumb--${showNameplate ? 'on' : 'off'}`}>
                  {showNameplate ? <Check className="atlas-toggle__icon" /> : <X className="atlas-toggle__icon" />}
                </div>
              </div>
            </div>
          </div>

          <div className="atlas-edit-token__section-divider" />
          <div className="atlas-edit-token__section-label">Resources</div>
          <NumberOverrideField
            label="Max HP"
            value={maxHpInput}
            onChange={setMaxHpInput}
            placeholder={defaultPlaceholder(resourceDefaults.maxHp)}
            resetLabel="Reset to statblock default"
          />
          <NumberOverrideField
            label="Max Secondary Resource"
            value={maxStressInput}
            onChange={setMaxStressInput}
            placeholder={defaultPlaceholder(resourceDefaults.maxStress)}
            resetLabel="Reset to statblock default"
          />
          {WALLS_AND_LIGHTING_ENABLED && (
            <TokenLightingFields vision={vision} onVisionChange={setVision} light={light} onLightChange={setLight} unit={unit} />
          )}
        </div>

        <div className="atlas-modal-footer">
          <Button variant="outline" size="sm" onClick={onClose}>Cancel</Button>
          <Button variant="default" size="sm" onClick={handleSave}>Save</Button>
        </div>
      </div>
    </div>
  );
}

function lightingUpdates(vision: VisionForm, light: LightChoice): Pick<TokenUpdates, 'vision' | 'light'> {
  return {
    vision: visionFromForm(vision),
    ...(light !== 'custom' && { light: carriedLight(light === 'none' ? null : light) }),
  };
}

function readResourceDefaults(app: App, statblockPath: string | undefined): ResourceDefaults {
  const file = statblockPath ? app.vault.getAbstractFileByPath(statblockPath) : null;
  const frontmatter = file instanceof TFile ? app.metadataCache.getFileCache(file)?.frontmatter : undefined;
  return frontmatter ? statblockResourceDefaults(readStatblockVitals(frontmatter)) : {};
}

/**
 * Imperatively opens an Edit Token modal by mounting a React root.
 * Call from non-React code (e.g. InteractionController).
 */
export function openEditTokenModal(token: TokenEntity, store: StoreApi<ViewAtlasState>, app: App): void {
  const character = token.kind === 'character' ? token : undefined;
  const resourceDefaults = readResourceDefaults(app, character?.statblockPath);
  const container = document.body.createDiv({ cls: 'atlas-vtt-plugin atlas-vtt-root' });
  const root = createRoot(container);

  const cleanup = (): void => {
    root.unmount();
    container.remove();
  };

  const handleSave = ({ name, showNameplate, maxHp, maxStress, vision, light }: EditTokenValues): void => {
    store.getState().updateToken(token.id, {
      name,
      showNameplate,
      ...(WALLS_AND_LIGHTING_ENABLED ? lightingUpdates(vision, light) : {}),
      ...buildResourceUpdates(character ?? {}, { maxHp, maxStress }, resourceDefaults),
    });
    cleanup();
  };

  // Its own React root, so no provider above it: the vision switch's tooltip needs one.
  root.render(
    <TooltipProvider delayDuration={300}>
      <EditTokenModalInner
        initial={{
          name: character?.name ?? '',
          showNameplate: token.showNameplate ?? false,
          maxHp: typeof character?.hp === 'object' ? character.hp.max : character?.hp,
          maxStress: typeof character?.stress === 'object' ? character.stress.max : character?.maxStress,
          vision: visionForm(token.vision),
          light: token.light ? presetOf(token.light) ?? 'custom' : 'none',
        }}
        unit={unitLabelFor(store.getState().grid?.unitType)}
        resourceDefaults={resourceDefaults}
        onSave={handleSave}
        onClose={cleanup}
      />
    </TooltipProvider>,
  );
}
