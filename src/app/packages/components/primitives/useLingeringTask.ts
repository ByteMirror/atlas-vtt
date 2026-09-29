import { useEffect, useRef, useState } from 'react';

export interface ProgressCount {
  done: number;
  total: number;
}

export interface ProgressTask extends ProgressCount {
  /** What is happening, such as "Creating tokens". */
  label: string;
}

type Phase = 'hidden' | 'visible' | 'finishing';

/** Work that finishes within this never shows progress, so quick tasks do not flash a bar. */
const SHOW_AFTER_MS = 300;
/** A finished task stays this long, so the bar is seen reaching its end. */
const LINGER_MS = 500;

/**
 * The task to show for `task`: null until it has run for a noticeable moment,
 * then its latest state, and once it ends, briefly as complete.
 */
export function useLingeringTask(task: ProgressTask | null): ProgressTask | null {
  const [phase, setPhase] = useState<Phase>('hidden');
  const last = useRef<ProgressTask | null>(null);
  if (task) last.current = task;
  const active = task !== null;

  useEffect(() => {
    if (active) {
      setPhase((current) => (current === 'finishing' ? 'visible' : current));
      const timer = window.setTimeout(() => setPhase('visible'), SHOW_AFTER_MS);
      return () => window.clearTimeout(timer);
    }
    setPhase((current) => (current === 'visible' ? 'finishing' : 'hidden'));
    const timer = window.setTimeout(() => setPhase('hidden'), LINGER_MS);
    return () => window.clearTimeout(timer);
  }, [active]);

  if (phase === 'hidden') return null;
  if (task) return task;
  // Also while the phase is still 'visible' in the render the task ended in, so the line never blinks.
  return last.current ? { ...last.current, done: last.current.total } : null;
}
