/**
 * Runs tasks one after another: a task starts once every task queued before it
 * has settled, whether it succeeded or failed. Not re-entrant, so a task must
 * never queue another task on the same lock and wait for it.
 */
export class SerialLock {
  private tail: Promise<unknown> = Promise.resolve();

  run<T>(task: () => Promise<T>): Promise<T> {
    const result = this.tail.then(task);
    this.tail = result.catch(() => undefined);
    return result;
  }

  /** Resolves once every task queued so far has settled. */
  async idle(): Promise<void> {
    await this.tail;
  }
}
