import { describeError } from '../utils/errors';

type Listener = (...args: never[]) => void;

/** Runs `listener` so that an error it throws is reported instead of thrown; the same message is reported once. */
function isolated<L extends Listener>(listener: L, report: (error: unknown) => void): L {
  const reported = new Set<string>();
  const run = (...args: Parameters<L>): void => {
    try {
      listener(...args);
    } catch (error) {
      const message = describeError(error);
      if (reported.has(message)) return;
      reported.add(message);
      report(error);
    }
  };
  // Same parameters, and the result of a listener is never used
  return run as L;
}

/**
 * Makes `store.subscribe` isolate the listeners it registers. zustand runs them in turn
 * inside `setState`: one that throws keeps the listeners after it from ever seeing that
 * state, and its error surfaces in whatever wrote to the store, such as a scene load.
 */
export function isolateListeners<S extends { subscribe: (...args: never[]) => () => void }>(
  store: S,
  report: (error: unknown) => void,
): void {
  // `subscribe` takes a listener, or a selector, a listener and options
  const subscribe = store.subscribe as unknown as (...args: unknown[]) => () => void;
  const subscribeIsolated = (first: unknown, second?: unknown, ...rest: unknown[]): (() => void) => (
    typeof second === 'function'
      ? subscribe(first, isolated(second as Listener, report), ...rest)
      : subscribe(isolated(first as Listener, report))
  );
  store.subscribe = subscribeIsolated;
}
