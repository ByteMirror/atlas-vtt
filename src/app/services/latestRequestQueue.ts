import { settledWithin } from '../utils/settledWithin';

/** How long a request waits for the running job to stop before it starts regardless. */
export const STALLED_JOB_MS = 5000;

/**
 * Runs async jobs one at a time, the latest request winning: a job requested while
 * another runs starts once that one has settled, and of several waiting only the
 * last starts. A running job learns through `isSuperseded` that it was replaced and
 * stops at its next wait, so the wait is short. A job that never gets there (a file
 * or an image that never arrives) holds the queue for `STALLED_JOB_MS` at most.
 */
export class LatestRequestQueue {
  private requests = 0;
  private inFlight: Promise<unknown> = Promise.resolve();

  /** Resolves with the job's result, or with null when a later request replaced the job before it started. */
  run<T>(job: (isSuperseded: () => boolean) => Promise<T>): Promise<T | null> {
    const request = ++this.requests;
    const isSuperseded = (): boolean => request !== this.requests;
    const result = settledWithin(this.inFlight, STALLED_JOB_MS).then(() => (isSuperseded() ? null : job(isSuperseded)));
    this.inFlight = result.catch(() => undefined);
    return result;
  }

  /** Replaces every request without a new one: waiting jobs never start and the running one stops at its next wait. */
  cancel(): void {
    this.requests++;
  }
}
