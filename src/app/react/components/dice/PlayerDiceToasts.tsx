import React, { useCallback, useMemo } from 'react';
import type { App } from 'obsidian';
import type { StoreApi } from 'zustand';
import { AtlasUIContext, type AtlasUIContextValue } from '../../root/AtlasUIContext';
import type { ViewAtlasState } from '../../../storeFactory';
import type { DiceRollResult } from '../../../tools/DiceTool';
import { DiceToastContainer } from './DiceToastContainer';

interface PlayerDiceToastsProps {
  app: App;
  /** Store of the presented scene; it tells which tokens players cannot see. */
  store: Pick<StoreApi<ViewAtlasState>, 'getState'>;
  container: HTMLElement;
}

/**
 * The DM's dice rolls as players see them in the player window. A roll made
 * for a token hidden on the map keeps its ability and result but not the
 * token's name or portrait, so it does not give the token away.
 */
export function PlayerDiceToasts({ app, store, container }: PlayerDiceToastsProps): React.ReactElement {
  const context = useMemo((): AtlasUIContextValue => ({ app, view: null, pixiApp: null, renderer: null }), [app]);

  const forPlayers = useCallback((result: DiceRollResult): DiceRollResult => {
    const source = result.source;
    const tokenId = source?.tokenId;
    if (!source || !tokenId || !store.getState().objects?.tokens?.[tokenId]?.isHidden) return result;
    const { type, abilityName } = source;
    return { ...result, source: abilityName ? { type, abilityName } : { type } };
  }, [store]);

  return (
    <AtlasUIContext.Provider value={context}>
      <DiceToastContainer container={container} prepare={forPlayers} />
    </AtlasUIContext.Provider>
  );
}
