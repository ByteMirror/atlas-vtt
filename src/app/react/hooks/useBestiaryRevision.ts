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
 */
export function useBestiaryRevision(app: App): number {
  const [revision, setRevision] = useState(0);

  useEffect(() => {
    const bump = (): void => setRevision((value) => value + 1);
    const refs = BESTIARY_EVENTS.map((event) => app.workspace.on(event as never, bump as never));
    return () => refs.forEach((ref) => app.workspace.offref(ref));
  }, [app]);

  return revision;
}
