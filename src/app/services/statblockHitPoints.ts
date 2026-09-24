import type { App } from 'obsidian';
import { ATLAS_VIEW_TYPE } from '../atlas-view';
import type { TokenUpdates, ViewAtlasStore } from '../storeFactory';
import { rollStatblockDice } from './statblockDiceLinks';
import type { TokenVitals } from './statblockVitalsSync';

type PlacedToken = TokenVitals & { id: string };

/** The game master's map view that holds every one of these tokens. */
function storeHoldingTokens(app: App, ids: readonly string[]): ViewAtlasStore | null {
  for (const leaf of app.workspace.getLeavesOfType(ATLAS_VIEW_TYPE)) {
    const store = (leaf.view as unknown as { getStore?: () => ViewAtlasStore }).getStore?.();
    const state = store?.getState();
    if (store && state && !state.isPlayerView && ids.every((id) => state.objects.tokens[id])) return store;
  }
  return null;
}

/**
 * Rolls a statblock's hit dice once per token and puts each token at full
 * health with its own result. A rolled maximum is a deliberate choice, so it is
 * marked as overridden and survives later edits to the statblock. Without
 * placed tokens this is an ordinary roll.
 */
export function rollHitPoints(
  app: App,
  formula: string,
  statblockPath: string,
  tokens: readonly TokenVitals[],
  abilityName?: string,
): void {
  const placed = tokens.filter((token): token is PlacedToken => Boolean(token.id));
  const store = placed.length ? storeHoldingTokens(app, placed.map((token) => token.id)) : null;
  if (!store) {
    rollStatblockDice(app, formula, { statblockPath, abilityName });
    return;
  }

  const entries: Array<{ id: string; changes: TokenUpdates }> = [];
  for (const token of placed) {
    const roll = rollStatblockDice(app, formula, {
      tokenId: token.id,
      statblockPath,
      tokenName: token.name,
      tokenImagePath: token.imagePath,
      abilityName,
    });
    if (!roll) continue;
    const hp = Math.max(1, roll.total);
    entries.push({ id: token.id, changes: { hp: { current: hp, max: hp }, maxHpOverridden: true } });
  }
  if (entries.length) store.getState().updateTokens(entries);
}
