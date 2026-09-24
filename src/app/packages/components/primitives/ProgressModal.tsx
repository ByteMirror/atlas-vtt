import React, { useId, useRef } from 'react';
import { Button } from './button';
import { useDialogEscape } from './useDialogEscape';

export interface ProgressModalAction {
  label: string;
  onSelect: () => void;
  isPrimary?: boolean;
}

/** A question for the user or a finished result: the dialog shows these choices instead of progress. */
export interface ProgressModalPrompt {
  actions: readonly ProgressModalAction[];
  /** Runs on Escape. */
  onDismiss: () => void;
}

interface ProgressModalProps {
  title: string;
  message: string;
  /** 0..1 */
  fraction: number;
  prompt?: ProgressModalPrompt | undefined;
}

/** Blocking progress dialog for long-running work that has no cancel path, such as packing or unpacking a collection. */
export function ProgressModal({ title, message, fraction, prompt }: ProgressModalProps): React.JSX.Element {
  const titleId = useId();
  const overlayRef = useRef<HTMLDivElement>(null);
  const percent = Math.round(Math.min(1, Math.max(0, fraction)) * 100);

  useDialogEscape(overlayRef, prompt?.onDismiss);

  return (
    <div ref={overlayRef} className="atlas-progress-modal-overlay" role="dialog" aria-modal="true" aria-labelledby={titleId} aria-busy={!prompt}>
      <div className="atlas-progress-modal">
        {!prompt && <div className="atlas-progress-modal__spinner" aria-hidden="true" />}
        <h3 id={titleId} className="atlas-progress-modal__title">{title}</h3>
        <p className="atlas-progress-modal__message" role="status">{message}</p>
        {prompt ? (
          <div className="atlas-progress-modal__actions">
            {prompt.actions.map((action) => (
              <Button key={action.label} variant={action.isPrimary ? 'default' : 'outline'} size="sm" onClick={action.onSelect} autoFocus={action.isPrimary}>
                {action.label}
              </Button>
            ))}
          </div>
        ) : (
          <div className="atlas-progress-modal__bar" role="progressbar" aria-valuemin={0} aria-valuemax={100} aria-valuenow={percent}>
            <div className="atlas-progress-modal__fill" style={{ width: `${percent}%` }} />
          </div>
        )}
      </div>
    </div>
  );
}
