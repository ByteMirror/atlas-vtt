import type { TokenEntity } from '../../types';
import { isSeen, type LightReach, type Sight } from '../../vision/sight';
import type { HideableLayer, LayerVisibility } from '../playerSafeFrame';

export interface PlayerLightingInput {
  enabled: boolean;
  /** `LightingRenderer.modeLayer`: visible renders the player's view. */
  modeLayer: HideableLayer;
  /** Wall lines, door icons, light handles: things only the GM may see. */
  gmOverlays: readonly HideableLayer[];
}

/** Layer changes for a player frame: the GM's wall and door overlays never show; with lighting on, the player's view. */
export function playerLightingLayers({ enabled, modeLayer, gmOverlays }: PlayerLightingInput): LayerVisibility[] {
  const hidden = gmOverlays.map((layer) => ({ layer, visible: false }));
  return enabled ? [{ layer: modeLayer, visible: true }, ...hidden] : hidden;
}

/** Whether the viewer sees each token, by its centre. The viewer's own tokens always show, lit or not. */
export function tokenSeenPredicate(
  sight: Sight,
  ambient: number,
  lights: readonly LightReach[],
  tokens: Record<string, TokenEntity>,
): (tokenId: string) => boolean {
  return (tokenId) => {
    const token = tokens[tokenId];
    return !!token && (!!token.vision?.enabled || isSeen({ x: token.x, y: token.y }, sight, ambient, lights));
  };
}
