import type { TokenEntity } from '../../types';
import type { TokenPerception } from '../lighting/playerLightingLayers';
import { hiddenTokenLayers, type HideableLayer, type LayerVisibility } from '../playerSafeFrame';
import { SensedOutlines, type SensedToken } from './SensedOutlines';
import type { TokenGroupContainer } from './types';

/** What the sight of the players' tokens needs to know of the token renderer. */
export interface PlayerSightHost {
  tokens: () => Record<string, TokenEntity>;
  sprites: () => Record<string, TokenGroupContainer | null>;
  /** The tokens the pointer holds or drags. */
  held: () => ReadonlySet<string>;
}

/**
 * The tokens as the players' sight shows them: which the canvas leaves out while it shows the
 * players' view of a lit scene (session view, the peek key), which a players' frame leaves out,
 * and the outlines of those the players only sense (`SensedOutlines`).
 */
export class PlayerSightTokens {
  private readonly outlines = new SensedOutlines();
  private provider?: () => TokenPerception | undefined;

  constructor(private readonly host: PlayerSightHost) {}

  /** The layer of the outlines, for the token renderer's viewport and the list of what the players' view shows. */
  get outlineLayer(): SensedOutlines['view'] {
    return this.outlines.view;
  }

  /**
   * `provider` answers how the players perceive each token while the canvas shows their view,
   * and nothing otherwise. Tokens they do not see are left out with their nameplates and bars,
   * as in the player frame; those they only sense show as outlines.
   */
  setProvider(provider: () => TokenPerception | undefined): void {
    this.provider = provider;
  }

  /** How the players perceive each token, while the canvas shows their view. */
  perception(): TokenPerception | undefined {
    return this.provider?.();
  }

  /** Whether the canvas leaves the token out by the players' sight. One the pointer holds stays until it is released. */
  hides(tokenId: string, perception = this.perception()): boolean {
    return !!perception && perception(tokenId) !== 'seen' && !this.host.held().has(tokenId);
  }

  /**
   * Outlines exactly the tokens the players sense without seeing them, never a hidden one. A
   * token the pointer holds keeps its outline for the players' frame only: on the canvas the
   * token itself stays under the pointer.
   */
  syncOutlines(perception = this.perception()): void {
    const tokens = this.host.tokens();
    const held = this.host.held();
    const sensed: SensedToken[] = [];
    for (const [id, sprite] of Object.entries(perception ? this.host.sprites() : {})) {
      const token = tokens[id];
      if (!token || !sprite || token.isHidden || perception?.(id) !== 'sensed') continue;
      sensed.push({ id, x: sprite.x, y: sprite.y, size: sprite.tokenSize || 70, held: held.has(id) });
    }
    this.outlines.sync(sensed);
  }

  /** What a players' frame changes about the tokens: those they do not see are left out, and the outlines of held ones show. */
  frameLayers(perception: TokenPerception | undefined): LayerVisibility[] {
    this.syncOutlines(perception);
    return [...hiddenTokenLayers(this.host.tokens(), this.host.sprites(), perception), { layer: this.outlines.heldView, visible: true }];
  }

  /** A picture of the scene is the GM's: no outlines. */
  gmLayers(): LayerVisibility[] {
    return [{ layer: this.outlines.view satisfies HideableLayer, visible: false }];
  }

  destroy(): void {
    this.outlines.destroy();
  }
}

/** Whether the players see the token itself, for what shows only with it (nameplate, bars, drag ruler). */
export function seenTokens(perception: TokenPerception | undefined): ((tokenId: string) => boolean) | undefined {
  return perception && ((tokenId) => perception(tokenId) === 'seen');
}
