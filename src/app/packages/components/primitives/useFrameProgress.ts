import { useCallback, useEffect, useRef, useState } from 'react';
import type { ProgressCount } from './useLingeringTask';

export interface FrameProgressApi {
  progress: ProgressCount | null;
  /** Records a step; safe to call thousands of times a second. */
  report: (done: number, total: number) => void;
  clear: () => void;
}

/** Progress that may be reported far more often than the screen refreshes, rendered at most once a frame. */
export function useFrameProgress(): FrameProgressApi {
  const [progress, setProgress] = useState<ProgressCount | null>(null);
  const latest = useRef<ProgressCount | null>(null);
  const frame = useRef<number | null>(null);

  const cancelFrame = useCallback((): void => {
    if (frame.current !== null) window.cancelAnimationFrame(frame.current);
    frame.current = null;
  }, []);
  const report = useCallback((done: number, total: number): void => {
    latest.current = { done, total };
    frame.current ??= window.requestAnimationFrame(() => {
      frame.current = null;
      setProgress(latest.current);
    });
  }, []);
  const clear = useCallback((): void => {
    cancelFrame();
    latest.current = null;
    setProgress(null);
  }, [cancelFrame]);

  useEffect(() => cancelFrame, [cancelFrame]);
  return { progress, report, clear };
}
