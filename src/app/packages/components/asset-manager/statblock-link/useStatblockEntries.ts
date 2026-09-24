import { useMemo } from 'react';
import type { App } from 'obsidian';
import { getFantasyStatblocksApi } from '../../../../services/FantasyStatblocksService';
import { useBestiaryRevision } from '../../../../react/hooks/useBestiaryRevision';
import { statblockEntries, type StatblockEntry } from './statblockEntries';

export type BestiaryStatus = 'missing' | 'loading' | 'ready';

export interface StatblockEntries {
  entries: StatblockEntry[];
  status: BestiaryStatus;
}

/** The linkable creatures of Fantasy Statblocks' bestiary, kept current while it (re)parses. */
export function useStatblockEntries(app: App): StatblockEntries {
  const revision = useBestiaryRevision(app);

  return useMemo((): StatblockEntries => {
    const api = getFantasyStatblocksApi();
    if (!api) return { entries: [], status: 'missing' };
    const entries = statblockEntries(api.getBestiaryCreatures());
    // The bestiary is parsed asynchronously at startup: empty and unresolved means "not ready yet".
    const status = entries.length === 0 && !api.isResolved?.() ? 'loading' : 'ready';
    return { entries, status };
    // `revision` is not read here; it re-reads the bestiary whenever it changes.
  }, [revision]);
}
