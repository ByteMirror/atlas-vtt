import type { LightReach, Sight } from '../../vision/sight';
import type { HideableLayer } from '../playerSafeFrame';

/** What the map view needs from scene lighting, on the GPU or in the Canvas fallback. */
export interface SceneLightingView {
  /** Flipped by the player-frame capture: visible means the player's view. */
  readonly modeLayer: HideableLayer;
  isEnabled(): boolean;
  /** Shows the GM exactly what the players see. */
  setPreview(on: boolean): void;
  currentSight(): Sight;
  lightReaches(): LightReach[];
  ambient(): number;
  refreshBounds(): void;
  resetExplored(): void;
  destroy(): void;
}
