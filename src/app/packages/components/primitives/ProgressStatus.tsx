import React from 'react';
import { Check } from 'lucide-react';
import { cn } from '../../../../utils/cn';
import { LoadingSpinner } from './LoadingSpinner';
import { ProgressBar } from './ProgressBar';
import { useLingeringTask, type ProgressTask } from './useLingeringTask';

interface ProgressStatusProps {
  /** The running task, or null when nothing runs. */
  task: ProgressTask | null;
  /** The status shown while nothing runs. */
  children?: React.ReactNode;
  /** Skip the completed state when the work ended in failure: `children` then explains it. */
  failed?: boolean;
  className?: string;
}

/**
 * A status line for long work: the Atlas spinner and what is happening, joined
 * by a bar and a count once the work takes a noticeable moment and has more
 * than one step. When it ends, the bar shows full with a check before the line
 * gives way to `children` again.
 */
export function ProgressStatus({ task, children, failed = false, className }: ProgressStatusProps): React.JSX.Element {
  const lingering = useLingeringTask(task);
  const current = task ?? (failed ? null : lingering);
  if (!current) return <>{children}</>;
  const complete = task === null;
  const meter = lingering && lingering.total > 1 ? lingering : null;
  const count = meter ? `${meter.done.toLocaleString()} of ${meter.total.toLocaleString()}` : '';
  return (
    <div className={cn('atlas-progress-status', className)}>
      {complete ? <Check className="atlas-progress-status__check" aria-hidden="true" /> : <LoadingSpinner size={16} />}
      <span className="atlas-progress-status__label">{current.label}</span>
      {meter && (
        <span className="atlas-progress-status__meter">
          <ProgressBar value={meter.done} max={meter.total} label={meter.label} valueText={count} className="atlas-progress-status__bar" />
          <span className="atlas-progress-status__count" aria-hidden="true">{count}</span>
        </span>
      )}
    </div>
  );
}
