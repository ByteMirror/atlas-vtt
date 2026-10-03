import { useEffect, useState } from 'react';
import type { App } from 'obsidian';

const BESTIARY_EVENTS = [
  'fantasy-statblocks:loaded',
  'fantasy-statblocks:bestiary:resolved',
  'fantasy-statblocks:bestiary:updated',
] as const;

/**
 * A number that grows whenever Fantasy Statblocks (re)parses its bestiary, for
 * memos and effects that read it. Subscribes through Obsidian's event bus rather
 * than the plugin API: on a window reload Fantasy Statblocks may load after the
 * caller mounts, when its API is not on `window` yet.
 *
 * With `settleMs`, a burst of events (one per parsed note while the bestiary
 * loads) grows it once, `settleMs` after the last of them.
 */
export function useBestiaryRevision(app: App, settleMs = 0): number {
  const [revision, setRevision] = useState(0);

  useEffect(() => {
    let timer: number | null = null;
    const increment = (): void => setRevision((value) => value + 1);
    const bump = settleMs > 0
      ? (): void => {
        if (timer !== null) window.clearTimeout(timer);
        timer = window.setTimeout(() => { timer = null; increment(); }, settleMs);
      }
      : increment;
    const refs = BESTIARY_EVENTS.map((event) => app.workspace.on(event as never, bump as never));
    return () => {
      if (timer !== null) window.clearTimeout(timer);
      refs.forEach((ref) => app.workspace.offref(ref));
    };
  }, [app, settleMs]);

  return revision;
}
