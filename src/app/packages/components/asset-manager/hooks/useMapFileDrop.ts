import type React from 'react';
import { useCallback } from 'react';
import type { App } from 'obsidian';
import { AssetService } from '../../../../services/AssetService';
import { runInBackground } from '../../../../utils/backgroundTask';
import { hasDroppableFiles, importDroppedMaps } from '../utils/importDroppedMaps';

export interface MapFileDrop {
  /** Takes the drag when it carries files, so the browser offers a copy rather than refusing it. */
  accepts: (event: React.DragEvent) => boolean;
  /** Imports the dropped files. Answers whether it took the drop. */
  receive: (event: React.DragEvent) => boolean;
}

/**
 * Lets the asset manager take map files dragged in from outside Obsidian. Both handlers
 * answer whether they took the event, so a caller can fall through to the drag of its
 * own cards; a drag between folders carries no files and is never taken here.
 */
export function useMapFileDrop(
  app: App,
  assetService: AssetService | null,
  collectionId: string | null,
  onImported: () => void,
): MapFileDrop {
  const accepts = useCallback((event: React.DragEvent): boolean => {
    if (!assetService || !hasDroppableFiles(event.dataTransfer)) return false;
    event.preventDefault();
    event.dataTransfer.dropEffect = 'copy';
    return true;
  }, [assetService]);

  const receive = useCallback((event: React.DragEvent): boolean => {
    const files = event.dataTransfer.files;
    if (!assetService || files.length === 0) return false;
    event.preventDefault();
    event.stopPropagation();

    const collection = collectionId ?? AssetService.defaultCollectionId();
    runInBackground(
      importDroppedMaps({ app, assetService, collectionId: collection, files }).then((created) => {
        if (created > 0) onImported();
      }),
      'Importing dropped maps',
      'Could not import the dropped files.',
    );
    return true;
  }, [app, assetService, collectionId, onImported]);

  return { accepts, receive };
}
