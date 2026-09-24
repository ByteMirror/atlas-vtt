import type { App } from 'obsidian';
import { DEFAULT_TOKEN_SETTINGS, type ViewAtlasState } from '../storeFactory';
import { isPersistedMapEnvelope } from './MapPersistence';
import { updateCollectionScenes } from './collectionScenes';

type TokenSettings = ViewAtlasState['tokenSettings'];
export type TokenBars = Partial<Pick<TokenSettings, 'showHPBars' | 'showStressBars'>>;

/**
 * The resource bars a collection's default widgets turn on or off. A collection
 * that never set its default widgets leaves every map's own choice alone.
 */
export function tokenBarsOf(defaultWidgets: Record<string, boolean> | undefined): TokenBars {
  if (!defaultWidgets) return {};
  return { showHPBars: !!defaultWidgets.hpBar, showStressBars: !!defaultWidgets.stressBar };
}

/** The bars in `after` that differ from `before`. */
export function changedTokenBars(before: TokenBars, after: TokenBars): TokenBars {
  const changed: TokenBars = {};
  if (after.showHPBars !== undefined && after.showHPBars !== before.showHPBars) changed.showHPBars = after.showHPBars;
  if (after.showStressBars !== undefined && after.showStressBars !== before.showStressBars) changed.showStressBars = after.showStressBars;
  return changed;
}

/** A complete token settings object; a map file replaces the defaults with it as a whole. */
export function withTokenBars(current: Partial<TokenSettings> | undefined, bars: TokenBars): TokenSettings {
  return { ...DEFAULT_TOKEN_SETTINGS, ...current, ...bars };
}

function rewriteMapBars(content: string, bars: TokenBars): string | null {
  const data: unknown = JSON.parse(content);
  if (!isPersistedMapEnvelope(data) || !data.state) return null;
  const state = data.state as { tokenSettings?: Partial<TokenSettings> };
  const next = withTokenBars(state.tokenSettings, bars);
  if (JSON.stringify(next) === JSON.stringify(state.tokenSettings)) return null;
  state.tokenSettings = next;
  return JSON.stringify(data, null, 2);
}

/** Shows or hides resource bars in every scene of the collection. */
export async function applyTokenBars(app: App, collectionId: string, bars: TokenBars): Promise<void> {
  if (Object.keys(bars).length === 0) return;
  await updateCollectionScenes(app, collectionId, {
    updateOpen: (view) => {
      const state = view.getStore().getState();
      state.setTokenSettings(withTokenBars(state.tokenSettings, bars));
    },
    rewrite: (content) => rewriteMapBars(content, bars),
  });
}
