import { useEffect, useState } from 'react';
import type { App } from 'obsidian';
import { AssetService } from '../../services/AssetService';

/**
 * A number that changes whenever what a map reads from its collection may have changed: the
 * collection's settings were saved, or the asset index, which says which collection the map
 * is in, has loaded. A view built before that read its map as outside every collection.
 */
export function useCollectionRulesRevision(app: App | null | undefined): number {
  const [revision, setRevision] = useState(0);

  useEffect(() => {
    if (!app) return;
    let live = true;
    const changed = (): void => { if (live) setRevision((value) => value + 1); };
    const ref = app.workspace.on('atlas-vtt:collection-settings-changed', changed);
    AssetService.getInstance(app).initialize().then(changed, () => undefined);
    return () => {
      live = false;
      app.workspace.offref(ref);
    };
  }, [app]);

  return revision;
}
