/** Dynamic lighting of one scene. Saved in the map file, never undo-tracked. */
export interface SceneLighting {
  enabled: boolean;
  /** Light everywhere without a source: 0 is pitch black, 1 is daylight. */
  ambient: number;
  /** Tint of the ambient light; unset is neutral white. */
  ambientColor?: string;
}

export const DEFAULT_SCENE_LIGHTING: SceneLighting = { enabled: false, ambient: 0.1 };

export type LightAnimation = 'none' | 'torch' | 'candle' | 'pulse' | 'magic';

/** What a light gives off. Distances are game units (feet, metres…), converted at render time. */
export interface LightEmission {
  /** Radius of full light. */
  bright: number;
  /** Radius where the light ends; at least `bright`. */
  dim: number;
  color: string;
  /** Brightness multiplier, 1 is nominal. */
  intensity: number;
  animation: LightAnimation;
  /** Size of the flame; larger sources cast softer shadows. */
  sourceRadius?: number;
}

/** A light placed on the map. */
export interface LightSource {
  id: string;
  kind: 'light';
  x: number;
  y: number;
  emission: LightEmission;
  /** Switched off by the GM. */
  hidden?: boolean;
}

export type LightInput = Omit<LightSource, 'id' | 'kind'>;

/** How a token sees. Distances are game units. */
export interface TokenVision {
  enabled: boolean;
  /** Sight range; unset is unlimited. */
  range?: number;
  /** Radius the token sees without light, drawn desaturated. */
  darkvision?: number;
  /** Radius within which the token senses other tokens through walls and darkness; the map stays unseen. */
  tremorsense?: number;
  /** Width of the vision cone in degrees (1–360), facing the token's rotation; unset sees all around. */
  angle?: number;
}

/** What a collection or game system gives new tokens; vision itself always starts off. */
export type TokenVisionDefaults = Omit<TokenVision, 'enabled'>;
