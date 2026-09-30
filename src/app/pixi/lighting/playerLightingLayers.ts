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

/** Layer changes for a player frame of a scene with dynamic lighting. */
export function playerLightingLayers({ enabled, modeLayer, gmOverlays }: PlayerLightingInput): LayerVisibility[] {
  if (!enabled) return [];
  return [{ layer: modeLayer, visible: true }, ...gmOverlays.map((layer) => ({ layer, visible: false }))];
}

/** Whether the viewer sees each token, by the centre of the token. */
export function tokenSeenPredicate(
  sight: Sight,
  ambient: number,
  lights: readonly LightReach[],
  tokens: Record<string, TokenEntity>,
): (tokenId: string) => boolean {
  return (tokenId) => {
    const token = tokens[tokenId];
    return !!token && isSeen({ x: token.x, y: token.y }, sight, ambient, lights);
  };
}
