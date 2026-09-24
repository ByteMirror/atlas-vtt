import { useMemo } from 'react';
import { TFile } from 'obsidian';
import { useAtlasUI } from '../../root/AtlasUIContext';
import { useAtlasStore } from '../../ViewStoreContext';
import type { DiceRollResult } from '../../../tools/DiceTool';
import { TokenStatblockLinkService } from '../../../services/TokenStatblockLinkService';

export interface DiceAvatar {
  src: string;
  showRing: boolean | undefined;
  ringColor: string | undefined;
}

/**
 * Resolves the avatar for a roll at render time rather than storing a URL with
 * the roll: resource URLs do not survive a restart, and a token may have been
 * given new artwork since. The map token's current image wins, then the image
 * of the token currently linked to the statblock, then the path recorded with
 * the roll. The ring follows the map token, so the avatar matches the canvas.
 */
export function useDiceAvatar(source: DiceRollResult['source']): DiceAvatar | null {
  const { app } = useAtlasUI();
  const tokenId = source?.tokenId;
  // One selector per field: selecting the token itself would re-render on every move.
  const currentImagePath = useAtlasStore((state): string | undefined =>
    tokenId ? state.objects?.tokens?.[tokenId]?.imagePath : undefined,
  );
  const showRing = useAtlasStore((state): boolean | undefined =>
    tokenId ? state.objects?.tokens?.[tokenId]?.showRing : undefined,
  );
  const ringColor = useAtlasStore((state): string | undefined =>
    tokenId ? state.objects?.tokens?.[tokenId]?.ringColor : undefined,
  );
  // ponytail: read per render, so a re-link shows on the next re-render (the log
  // ticks every 10 s); subscribe to metadataCache 'changed' if that is too slow.
  const statblockFile = source?.statblockPath
    ? app.vault.getAbstractFileByPath(source.statblockPath)
    : null;
  const linkedImagePath =
    statblockFile instanceof TFile
      ? TokenStatblockLinkService.getInstance(app).readStatblockImage(statblockFile)
      : null;
  const imagePath = currentImagePath ?? linkedImagePath ?? source?.tokenImagePath;

  return useMemo((): DiceAvatar | null => {
    if (!imagePath) return null;
    const file = app.vault.getAbstractFileByPath(imagePath);
    return file instanceof TFile ? { src: app.vault.getResourcePath(file), showRing, ringColor } : null;
  }, [app, imagePath, showRing, ringColor]);
}
