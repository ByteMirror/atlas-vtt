import type { TokenEntity } from '../../types';
import { isSeen, type LightReach, type Sight } from '../../vision/sight';
import type { HideableLayer, LayerVisibility } from '../playerSafeFrame';

/** Things only the GM may see. */
export interface GmOverlays {
  /** Wall lines and light handles, shown with the lighting tool. */
  wallEditor: HideableLayer;
  doorBadges: HideableLayer;
  /** Faint light icons, shown without the lighting tool. */
  lightMarkers: HideableLayer;
}

export interface PlayerLightingInput {
  enabled: boolean;
  /** `LightingRenderer.modeLayer`: visible renders the player's view. */
  modeLayer: HideableLayer;
  gmOverlays: GmOverlays;
}

/** Layer changes for a player frame: the GM's overlays never show; with lighting on, the player's view. */
export function playerLightingLayers({ enabled, modeLayer, gmOverlays }: PlayerLightingInput): LayerVisibility[] {
  const { wallEditor, doorBadges, lightMarkers } = gmOverlays;
  const hidden = [wallEditor, doorBadges, lightMarkers].map((layer) => ({ layer, visible: false }));
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
