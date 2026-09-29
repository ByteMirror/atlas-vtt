import React from 'react';
import { Loader2, Save } from 'lucide-react';
import { Platform } from 'obsidian';
import { Button } from '../../primitives/button';
import { ProgressStatus } from '../../primitives/ProgressStatus';
import type { ProgressCount, ProgressTask } from '../../primitives/useLingeringTask';
import { modeNoun, type CreatorMode } from './types';

interface TokenCreatorFooterProps {
  mode: CreatorMode;
  isEditing: boolean;
  count: number;
  saveError: string;
  /** Conversion of the images added last, while it runs. */
  optimization: ProgressCount | null;
  /** Saving, while it runs. */
  saving: ProgressCount | null;
  canSubmit: boolean;
  onCancel: () => void;
  onSubmit: () => void;
}

function savingLabel(mode: CreatorMode, isEditing: boolean): string {
  if (isEditing) return mode === 'map' ? 'Updating map' : 'Updating token';
  return mode === 'map' ? 'Adding maps' : 'Creating tokens';
}

/** Status, progress and actions of the token creator. */
export function TokenCreatorFooter({ mode, isEditing, count, saveError, optimization, saving, canSubmit, onCancel, onSubmit }: TokenCreatorFooterProps): React.JSX.Element {
  const isSubmitting = saving !== null;
  const task: ProgressTask | null = saving
    ? { label: savingLabel(mode, isEditing), ...saving }
    : optimization ? { label: 'Optimizing images', ...optimization } : null;
  const submitLabel = isEditing ? 'Update' : 'Create';
  return (
    <footer className="atlas-token-creator__footer">
      <span className="atlas-token-creator__status">
        <ProgressStatus task={task} failed={Boolean(saveError)}>
          {saveError || (count === 0 ? `No ${modeNoun(mode, 2)} to create` : `${count} ${modeNoun(mode, count)} ready`)}
        </ProgressStatus>
      </span>
      <div className="atlas-token-creator__actions">
        <Button variant="outline" size="sm" onClick={() => { if (!isSubmitting) onCancel(); }}>Cancel</Button>
        <Button variant="default" size="sm" onClick={onSubmit} disabled={!canSubmit}>
          {isSubmitting ? <Loader2 className="atlas-spin" /> : <Save />}
          <span>{isSubmitting ? `${submitLabel.replace(/e$/, '')}ing…` : submitLabel}</span>
          {!isSubmitting && <kbd className="atlas-token-creator__kbd">{Platform.isMacOS ? '⌘' : 'Ctrl'}↵</kbd>}
        </Button>
      </div>
    </footer>
  );
}
