import { App as ObsidianApp, Notice } from 'obsidian';
import type { StoreApi } from 'zustand';
import type { ViewAtlasState } from '../storeFactory';
import type { TokenEntity, TokenStateSnapshot } from '../types';
import type { GridSystem } from '../grid/GridSystem';
import { AssetService } from '../services/AssetService';
import { captureFormation, formationGridFromOptions } from './encounterFormation';
import { saveEncounter, type EncounterTokenDraft } from './encounterSaveService';

/** Token nearest the group's centroid becomes the anchor, so the encounter spawns centred on the viewport. */
function orderByCentroidDistance(tokens: TokenEntity[]): TokenEntity[] {
  const cx = tokens.reduce((sum, t) => sum + t.x, 0) / tokens.length;
  const cy = tokens.reduce((sum, t) => sum + t.y, 0) / tokens.length;
  return [...tokens].sort((a, b) => Math.hypot(a.x - cx, a.y - cy) - Math.hypot(b.x - cx, b.y - cy));
}

function snapshotTokenState(token: TokenEntity): TokenStateSnapshot {
  const { id: _id, x: _x, y: _y, instanceNumber: _instanceNumber, ...state } = token;
  return state;
}

/**
 * Save the given map tokens as an encounter, recording their grid-relative layout
 * and full state so spawning the encounter later reproduces them exactly.
 */
export async function saveMapTokensAsEncounter(
  app: ObsidianApp,
  store: StoreApi<ViewAtlasState>,
  gridSystem: GridSystem | null,
  tokenIds: string[],
): Promise<void> {
  const allTokens = store.getState().objects.tokens;
  const tokens = tokenIds
    .map((id) => allTokens[id])
    .filter((t): t is TokenEntity => !!t && typeof t.imagePath === 'string' && t.imagePath.length > 0);

  if (tokens.length === 0) {
    new Notice('Selected tokens have no image and cannot be saved as an encounter');
    return;
  }

  const ordered = orderByCentroidDistance(tokens);
  const grid = formationGridFromOptions(gridSystem?.getOptions());
  const { formation, slots } = captureFormation(ordered.map((t) => ({ x: t.x, y: t.y })), grid);

  const drafts = ordered.map((token, index): EncounterTokenDraft => {
    const character = token.kind === 'character' ? token : null;
    const draft: EncounterTokenDraft = {
      id: token.id,
      name: character?.name ?? 'Token',
      imagePath: token.imagePath,
      cell: slots[index]!.cell,
      offset: slots[index]!.offset,
      state: snapshotTokenState(token),
    };
    if (token.size !== undefined) draft.size = token.size;
    if (character?.statblockPath) draft.statblockPath = character.statblockPath;
    return draft;
  });

  await saveEncounter(app, AssetService.getInstance(app), drafts, formation);
}
