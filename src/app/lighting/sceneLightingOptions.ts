import type { SceneLighting } from '../types/lightingTypes';

/** Ambient light from which everything in sight counts as lit, when the scene sets none. */
export const DEFAULT_LIT_THRESHOLD = 0.25;
/** Remembered areas keep the map's own (dimmed, desaturated) colours. */
export const DEFAULT_EXPLORED_COLOR = '#ffffff';
export const DEFAULT_UNEXPLORED_COLOR = '#000000';

/** The scene options the composite draws with; the others decide what is seen and recorded. */
export type SceneLook = Pick<SceneLighting, 'ambient' | 'ambientColor' | 'exploredMemory' | 'exploredColor' | 'unexploredColor'>;

export function tokenVisionOn(lighting: Pick<SceneLighting, 'tokenVision'>): boolean {
  return lighting.tokenVision !== false;
}

export function exploredMemoryOn(lighting: Pick<SceneLighting, 'exploredMemory'>): boolean {
  return lighting.exploredMemory !== false;
}

/** A threshold within 0..1; anything that is not a number falls back to the default. */
export function clampLitThreshold(value: number): number {
  return Number.isFinite(value) ? Math.min(1, Math.max(0, value)) : DEFAULT_LIT_THRESHOLD;
}

export function litThresholdOf(lighting: Pick<SceneLighting, 'litThreshold'>): number {
  return lighting.litThreshold === undefined ? DEFAULT_LIT_THRESHOLD : clampLitThreshold(lighting.litThreshold);
}

/** The options `lighting` sets for the composite; unset ones stay unset, so the composite keeps its defaults. */
export function sceneLook({ ambient, ambientColor, exploredMemory, exploredColor, unexploredColor }: SceneLighting): SceneLook {
  return {
    ambient,
    ...(ambientColor !== undefined && { ambientColor }),
    ...(exploredMemory !== undefined && { exploredMemory }),
    ...(exploredColor !== undefined && { exploredColor }),
    ...(unexploredColor !== undefined && { unexploredColor }),
  };
}
