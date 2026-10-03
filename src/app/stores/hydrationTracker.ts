import { toError } from '../utils/errors';

interface Hydration {
  isSuperseded: () => boolean;
  failed: boolean;
  error?: unknown;
}

/**
 * Follows the rehydrations of a persisted store, for two things zustand leaves open:
 * it reports a failed rehydration only to `onRehydrateStorage`, and it applies the
 * storage's state whenever the read returns, even after another load took the store over.
 */
export class HydrationTracker {
  private current: Hydration | null = null;

  /**
   * Runs `rehydrate` and rejects when the store did not take the storage's state.
   * Once `isSuperseded` reports true, a read that is still under way is dropped.
   */
  async run(rehydrate: () => Promise<void> | void, isSuperseded: () => boolean): Promise<void> {
    const hydration: Hydration = { isSuperseded, failed: false };
    this.current = hydration;
    try {
      await rehydrate();
    } finally {
      if (this.current === hydration) this.current = null;
    }
    if (hydration.failed) throw toError(hydration.error, 'The scene data could not be restored');
  }

  /** The storage read of the rehydration that is starting. Throws when the rehydration was replaced before the read returned. */
  async read<T>(read: () => Promise<T>): Promise<T> {
    const hydration = this.current;
    const value = await read();
    if (hydration && (hydration !== this.current || hydration.isSuperseded())) {
      throw new Error('A newer scene load replaced this one');
    }
    return value;
  }

  /** What `onRehydrateStorage` returns for the rehydration that is starting; `log` gets every error that is not a replaced read. */
  reporter(log: (error: unknown) => void): (state: unknown, error?: unknown) => void {
    const hydration = this.current;
    return (_state, error) => {
      if (error === undefined) return;
      if (hydration) {
        hydration.failed = true;
        hydration.error = error;
      }
      if (!hydration?.isSuperseded()) log(error);
    };
  }
}
