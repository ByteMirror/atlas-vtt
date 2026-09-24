import { useCallback, useEffect, useMemo, useState } from 'react';
import { Notice, TFile } from 'obsidian';
import { useAtlasUI } from '../../root/AtlasUIContext';
import { useAtlasStore } from '../../ViewStoreContext';
import { SceneSnapshotService, nextSnapshotName, type SceneSnapshotEntry } from '../../../snapshots/SceneSnapshotService';
import { confirmAction } from '../../../ui/confirmDialog';

export interface SceneSnapshotsController {
  entries: SceneSnapshotEntry[];
  isLoading: boolean;
  /** True while a snapshot is being written or restored. */
  isBusy: boolean;
  /** Image URL of the entry's thumbnail, or null when it has none. */
  thumbnailUrl: (entry: SceneSnapshotEntry) => string | null;
  save: () => Promise<void>;
  restore: (entry: SceneSnapshotEntry) => Promise<void>;
  overwrite: (entry: SceneSnapshotEntry) => Promise<void>;
  rename: (entry: SceneSnapshotEntry, name: string) => Promise<void>;
  remove: (entry: SceneSnapshotEntry) => Promise<void>;
}

/**
 * The snapshots of the scene open in this view and the actions on them.
 * Restoring, overwriting and deleting ask for confirmation first. `onRestore` runs right
 * before a snapshot replaces the map, so the caller can get out of the way.
 */
export function useSceneSnapshots(onRestore: () => void): SceneSnapshotsController {
  const { app, view } = useAtlasUI();
  const mapPath = useAtlasStore((state) => state.mapPath);
  const service = useMemo(() => new SceneSnapshotService(app), [app]);
  const [entries, setEntries] = useState<SceneSnapshotEntry[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isBusy, setIsBusy] = useState(false);

  const refresh = useCallback(async (): Promise<void> => {
    setEntries(mapPath ? await service.list(mapPath) : []);
    setIsLoading(false);
  }, [mapPath, service]);

  useEffect(() => {
    setIsLoading(true);
    void refresh();
  }, [refresh]);

  /** Runs one snapshot operation at a time and reports a failure to the user. */
  const run = useCallback(async (task: () => Promise<void>, failure: string): Promise<void> => {
    setIsBusy(true);
    try {
      await task();
    } catch (error: unknown) {
      console.error(`[Atlas] ${failure}:`, error);
      new Notice(failure);
    } finally {
      setIsBusy(false);
      await refresh();
    }
  }, [refresh]);

  const save = useCallback(async (): Promise<void> => {
    const mapFile = view?.file;
    if (!view || !(mapFile instanceof TFile)) return;
    const name = nextSnapshotName(entries.map((entry) => entry.snapshot.name));

    await run(async () => {
      await view.saveMap();
      await service.create(mapFile, name, view.serviceManager.renderMapThumbnail());
    }, 'Could not save the snapshot');
  }, [entries, run, service, view]);

  const restore = useCallback(async (entry: SceneSnapshotEntry): Promise<void> => {
    if (!view) return;
    const confirmed = await confirmAction({
      title: `Restore "${entry.snapshot.name}"?`,
      message: [
        'Tokens, pins, fog, drawings, initiative and everything else on this map return to how they were in this snapshot.',
        'Changes made since then are lost and cannot be undone. Save a snapshot first to keep them.',
      ],
      confirmLabel: 'Restore',
      destructive: true,
    });
    if (!confirmed) return;

    onRestore();
    await run(async () => {
      await view.reloadActiveScene((file) => service.restoreInto(file, entry.snapshot));
      new Notice(`Restored "${entry.snapshot.name}"`);
    }, 'Could not restore the snapshot');
  }, [onRestore, run, service, view]);

  /** An empty name keeps the old one: every snapshot has a name. */
  const overwrite = useCallback(async (entry: SceneSnapshotEntry): Promise<void> => {
    const mapFile = view?.file;
    if (!view || !(mapFile instanceof TFile)) return;
    const confirmed = await confirmAction({
      title: `Overwrite "${entry.snapshot.name}"?`,
      message: [
        'The snapshot is replaced with the map as it is now. Its previous state is lost.',
      ],
      confirmLabel: 'Overwrite',
      destructive: true,
    });
    if (!confirmed) return;

    await run(async () => {
      await view.saveMap();
      await service.overwrite(entry, mapFile, view.serviceManager.renderMapThumbnail());
    }, 'Could not overwrite the snapshot');
  }, [run, service, view]);

  const rename = useCallback(async (entry: SceneSnapshotEntry, requestedName: string): Promise<void> => {
    const name = requestedName.trim();
    if (!name || name === entry.snapshot.name) return;
    // Show the new name at once, like a file rename; the refresh after writing confirms it.
    setEntries((current) => current.map((item) => (item === entry ? { ...item, snapshot: { ...item.snapshot, name } } : item)));
    await run(() => service.rename(entry, name), 'Could not rename the snapshot');
  }, [run, service]);

  const remove = useCallback(async (entry: SceneSnapshotEntry): Promise<void> => {
    const confirmed = await confirmAction({
      title: `Delete "${entry.snapshot.name}"?`,
      message: ['The snapshot is removed from this map. The map itself does not change.'],
      confirmLabel: 'Delete',
      destructive: true,
    });
    if (!confirmed) return;
    await run(() => service.delete(entry), 'Could not delete the snapshot');
  }, [run, service]);

  const thumbnailUrl = useCallback((entry: SceneSnapshotEntry): string | null => service.thumbnailUrl(entry), [service]);

  return { entries, isLoading, isBusy, thumbnailUrl, save, restore, overwrite, rename, remove };
}
