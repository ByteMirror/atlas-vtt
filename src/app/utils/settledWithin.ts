/** Resolves with true when `work` settles, or with false after `ms` when it has not by then. */
export function settledWithin(work: Promise<unknown>, ms: number): Promise<boolean> {
  return new Promise((resolve) => {
    const timer = window.setTimeout(() => resolve(false), ms);
    const settled = (): void => {
      window.clearTimeout(timer);
      resolve(true);
    };
    work.then(settled, settled);
  });
}
