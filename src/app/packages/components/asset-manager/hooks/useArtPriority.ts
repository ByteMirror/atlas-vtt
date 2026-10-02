import { useCallback, useEffect, useRef } from 'react';
import type { App } from 'obsidian';
import type { AssetService } from '../../../../services/AssetService';
import { AssetThumbnailService } from '../../../../services/AssetThumbnailService';

/**
 * Reports the cards on screen that still wait for their art, so their
 * thumbnails are made ahead of the rest of the library. Cards report as they
 * mount; the ids of one render go to the service together, in card order.
 */
export function useArtPriority(app: App, assetService: AssetService | null): (assetId: string) => void {
  const waiting = useRef<string[]>([]);
  const disposed = useRef(false);
  useEffect(() => {
    disposed.current = false;
    return (): void => { disposed.current = true; };
  }, []);

  return useCallback((assetId: string): void => {
    if (!assetService) return;
    if (waiting.current.length === 0) {
      queueMicrotask(() => {
        const assetIds = waiting.current;
        waiting.current = [];
        if (!disposed.current) AssetThumbnailService.getInstance(app, assetService).prioritize(assetIds);
      });
    }
    waiting.current.push(assetId);
  }, [app, assetService]);
}
