import React from 'react';
import { cn } from '../../../../utils/cn';

interface ProgressBarProps {
  /** Finished units. */
  value: number;
  /** All units; the bar stays empty while it is 0. */
  max: number;
  /** What is in progress, for screen readers. */
  label: string;
  /** The value in words, such as "12 of 40". */
  valueText?: string;
  className?: string;
}

/**
 * A thin determinate bar. The fill slides with a transform, so it keeps moving
 * smoothly on the compositor while the main thread is busy.
 */
export function ProgressBar({ value, max, label, valueText, className }: ProgressBarProps): React.JSX.Element {
  const done = Math.min(max, Math.max(0, value));
  const fraction = max > 0 ? done / max : 0;
  return (
    <div
      className={cn('atlas-progress-bar', className)}
      role="progressbar"
      aria-label={label}
      aria-valuemin={0}
      aria-valuemax={max}
      aria-valuenow={done}
      aria-valuetext={valueText}
    >
      <div className="atlas-progress-bar__fill" style={{ '--atlas-progress': fraction } as React.CSSProperties} />
    </div>
  );
}
