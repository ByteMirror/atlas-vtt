import { useCallback, useMemo, useState } from 'react';
import type { ProgressCount } from '../../primitives/useLingeringTask';

export interface BatchProgressApi {
  /** The running batch, or null when all its items are done. */
  progress: ProgressCount | null;
  /** Adds items; after a finished batch they start a new one, so the count never jumps backwards. */
  start: (count: number) => void;
  finish: () => void;
  /** Takes out an item that was cancelled before it finished. */
  drop: () => void;
  clear: () => void;
}

/** Counts the items of the current batch of background work, such as the conversions of added images. */
export function useBatchProgress(): BatchProgressApi {
  const [batch, setBatch] = useState<ProgressCount>({ done: 0, total: 0 });
  const start = useCallback((count: number): void => {
    setBatch(({ done, total }) => (done >= total ? { done: 0, total: count } : { done, total: total + count }));
  }, []);
  const finish = useCallback((): void => setBatch(({ done, total }) => ({ done: Math.min(total, done + 1), total })), []);
  const drop = useCallback((): void => setBatch(({ done, total }) => ({ done, total: Math.max(done, total - 1) })), []);
  const clear = useCallback((): void => setBatch({ done: 0, total: 0 }), []);
  const progress = useMemo(() => (batch.done < batch.total ? batch : null), [batch]);
  return { progress, start, finish, drop, clear };
}
