import { useCallback, useEffect, useState } from 'react';
import type { App } from 'obsidian';
import { listDicePacks, type DicePackInfo } from './dicePackStore';

/** The dice packs a collection can use, refreshed when assets change. */
export function useDicePacks(app: App | null | undefined, collectionId: string | null): {
  packs: DicePackInfo[];
  loading: boolean;
  refresh: () => void;
} {
  const [packs, setPacks] = useState<DicePackInfo[]>([]);
  const [loading, setLoading] = useState(true);
  const [version, setVersion] = useState(0);
  const refresh = useCallback(() => setVersion((v) => v + 1), []);

  useEffect(() => {
    if (!app) return;
    let cancelled = false;
    setLoading(true);
    void listDicePacks(app, collectionId).then((found) => {
      if (cancelled) return;
      setPacks(found);
      setLoading(false);
    });
    return () => { cancelled = true; };
  }, [app, collectionId, version]);

  useEffect(() => {
    if (!app) return;
    const ref = app.workspace.on('atlas-vtt:refresh-assets', refresh);
    return () => app.workspace.offref(ref);
  }, [app, refresh]);

  return { packs, loading, refresh };
}
