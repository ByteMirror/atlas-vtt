/**
 * SystemTab — Choose the collection's game system from the vault's presets,
 * or save its current rules as a preset of your own.
 */

import React, { useState } from 'react';
import { Plus, RotateCcw } from 'lucide-react';
import { Button } from '../../../packages/components/primitives/button';
import { LabelTooltip } from '../../../packages/components/primitives/tooltip';
import { ActionsMenuButton } from '../../../packages/components/shared/ActionsMenuButton';
import type { ContextMenuEntry } from '../context-menu/AtlasContextMenu';
import { findActivePreset, sameSystemRules } from '../../../gameSystems/systemRules';
import type { SystemPresetService } from '../../../services/SystemPresetService';
import type { SystemPreset, SystemRules } from '../../../types/systemPresetTypes';
import { runInBackground } from '../../../utils/backgroundTask';
import { PresetNameInput } from './PresetNameInput';
import { SystemPresetRow } from './SystemPresetRow';

interface SystemTabProps {
  service: SystemPresetService;
  presets: readonly SystemPreset[];
  rules: SystemRules;
  presetId: string | undefined;
  onApplyPreset: (preset: SystemPreset) => void;
  onPresetIdChange: (presetId: string | undefined) => void;
  /** Deletes a user preset; the collections that use it, this one included, lose their game system. */
  onDeletePreset: (preset: SystemPreset) => Promise<void>;
}

type PendingEdit = { kind: 'create' } | { kind: 'rename' | 'delete'; presetId: string };

export function SystemTab({
  service, presets, rules, presetId, onApplyPreset, onPresetIdChange, onDeletePreset,
}: SystemTabProps): React.ReactElement {
  const [pending, setPending] = useState<PendingEdit | null>(null);
  const active = findActivePreset(presets, presetId, rules);
  const isEdited = active !== undefined && !sameSystemRules(active.rules, rules);

  const save = (name: string): void => {
    // A copy of a system keeps the widgets it adds, such as Shadowdark's torch timer.
    const widgets = active?.rules.widgets;
    onPresetIdChange(service.create(name, { ...rules, ...(widgets && { widgets }) }).id);
    setPending(null);
  };

  const rename = (preset: SystemPreset, name: string): void => {
    service.rename(preset.id, name);
    setPending(null);
  };

  const remove = (preset: SystemPreset): void => {
    setPending(null);
    runInBackground(onDeletePreset(preset), `Delete game system preset "${preset.name}"`, `Could not delete "${preset.name}".`);
  };

  const menuEntries = (preset: SystemPreset): ContextMenuEntry[] => [
    ...(preset.id === active?.id && isEdited
      ? [{ type: 'item' as const, label: 'Save changes to preset', icon: 'save', onClick: () => service.update(preset.id, rules) }]
      : []),
    { type: 'item', label: 'Rename', icon: 'pencil', onClick: () => setPending({ kind: 'rename', presetId: preset.id }) },
    { type: 'separator' },
    { type: 'item', label: 'Delete', icon: 'trash-2', destructive: true, onClick: () => setPending({ kind: 'delete', presetId: preset.id }) },
  ];

  const replacementFor = (preset: SystemPreset): React.ReactNode => {
    if (pending?.kind === 'rename' && pending.presetId === preset.id) {
      return (
        <PresetNameInput
          initialName={preset.name}
          confirmLabel="Rename"
          validate={(name) => service.nameError(name, preset.id)}
          onConfirm={(name) => rename(preset, name)}
          onCancel={() => setPending(null)}
        />
      );
    }
    if (pending?.kind === 'delete' && pending.presetId === preset.id) {
      return (
        <div className="atlas-csm-preset-confirm" role="alertdialog" aria-label={`Delete ${preset.name}`}>
          <span className="atlas-csm-preset-confirm__text">
            Delete “{preset.name}”? Collections that use it go back to no game system,
            and their tokens lose its conditions.
          </span>
          <div className="atlas-csm-preset-confirm__actions">
            <Button variant="outline" size="sm" onClick={() => setPending(null)}>Cancel</Button>
            <Button variant="destructive" size="sm" onClick={() => remove(preset)}>Delete</Button>
          </div>
        </div>
      );
    }
    return undefined;
  };

  const actionsFor = (preset: SystemPreset): React.ReactNode => {
    const reset = preset.id === active?.id && isEdited && (
      <LabelTooltip label={`Reset to ${preset.name}`}>
        <Button variant="ghost" size="icon" className="atlas-csm-preset-icon-btn" onClick={() => onApplyPreset(preset)}>
          <RotateCcw />
        </Button>
      </LabelTooltip>
    );
    const menu = !preset.builtIn && (
      <ActionsMenuButton label="Preset actions" entries={menuEntries(preset)} className="atlas-csm-preset-icon-btn" />
    );
    return reset || menu ? <>{reset}{menu}</> : null;
  };

  return (
    <>
      <p className="atlas-csm-hint">
        A game system sets how the ruler measures distance and which conditions tokens can have.
        Presets are shared by every collection in this vault.
      </p>

      <div className="atlas-csm-preset-list" role="radiogroup" aria-label="Game system">
        {presets.map((preset) => (
          <SystemPresetRow
            key={preset.id}
            name={preset.name}
            rules={preset.rules}
            isActive={preset.id === active?.id}
            isEdited={preset.id === active?.id && isEdited}
            isBuiltIn={preset.builtIn}
            onSelect={() => onApplyPreset(preset)}
            actions={actionsFor(preset)}
            replacement={replacementFor(preset)}
          />
        ))}
        {!active && <SystemPresetRow name="Custom" rules={rules} isActive />}
      </div>

      {pending?.kind === 'create' ? (
        <PresetNameInput
          initialName=""
          confirmLabel="Save preset"
          validate={(name) => service.nameError(name)}
          onConfirm={save}
          onCancel={() => setPending(null)}
        />
      ) : (
        <Button variant="ghost" className="atlas-csm-add-btn" onClick={() => setPending({ kind: 'create' })}>
          <Plus />
          Save as Preset
        </Button>
      )}
    </>
  );
}
