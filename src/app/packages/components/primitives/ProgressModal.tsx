import React, { useId } from 'react';

interface ProgressModalProps {
  title: string;
  message: string;
  /** 0..1 */
  fraction: number;
}

/** Blocking progress dialog for long-running work that has no cancel path, such as packing or unpacking a collection. */
export function ProgressModal({ title, message, fraction }: ProgressModalProps): React.JSX.Element {
  const titleId = useId();
  const percent = Math.round(Math.min(1, Math.max(0, fraction)) * 100);
  return (
    <div className="atlas-progress-modal-overlay" role="dialog" aria-modal="true" aria-labelledby={titleId} aria-busy="true">
      <div className="atlas-progress-modal">
        <div className="atlas-progress-modal__spinner" aria-hidden="true" />
        <h3 id={titleId} className="atlas-progress-modal__title">{title}</h3>
        <p className="atlas-progress-modal__message" role="status">{message}</p>
        <div className="atlas-progress-modal__bar" role="progressbar" aria-valuemin={0} aria-valuemax={100} aria-valuenow={percent}>
          <div className="atlas-progress-modal__fill" style={{ width: `${percent}%` }} />
        </div>
      </div>
    </div>
  );
}
