import { useEffect } from 'react';
import { useAtlasStore } from '../react/ViewStoreContext';
import type { TokenEntity } from '../types';
import type { InitiativeEntry } from '../types/initiativeTypes';

/** Keeps the tracker's entries in step with their tokens while the tracker is mounted. */
export function useInitiativeTokenSync(tokens: Record<string, TokenEntity>, entries: InitiativeEntry[]): void {
  const removeFromInitiative = useAtlasStore((s) => s.removeFromInitiative);
  const updateInitiativeEntry = useAtlasStore((s) => s.updateInitiativeEntry);

  // The entry of a deleted token goes with it
  useEffect(() => {
    entries.forEach((entry) => {
      if (!tokens[entry.tokenId]) {
        removeFromInitiative(entry.id);
      }
    });
  // Deliberately not keyed on the entries: checked only when map tokens change, not on entry edits.
  }, [tokens, removeFromInitiative]);

  // Entries follow their token's name, image and statblock; resources are read from the token itself
  useEffect(() => {
    entries.forEach((entry) => {
      const token = tokens[entry.tokenId];
      if (!token) return;

      const updates: Partial<InitiativeEntry> = {};

      if (entry.imagePath !== token.imagePath) {
        updates.imagePath = token.imagePath;
      }

      if (token.kind === 'character') {
        if (entry.name !== token.name) {
          updates.name = token.name;
        }

        const tokenStatblockPath = token.statblockPath?.trim() ? token.statblockPath : undefined;

        if (entry.statblockPath !== tokenStatblockPath) {
          updates.statblockPath = tokenStatblockPath;
        }
      }

      if (Object.keys(updates).length > 0) {
        updateInitiativeEntry(entry.id, updates);
      }
    });
  }, [tokens, entries, updateInitiativeEntry]);
}
