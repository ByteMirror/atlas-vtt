import type { Texture } from 'pixi.js';
import type { LightAnimation } from '../../../types/lightingTypes';
import type { WallSegment } from '../../../types/wallTypes';
import type { Sight } from '../../../vision/sight';
import type { MapBounds } from '../../../vision/visibility';

/** A light in world pixels with its steady settings; colour is linear and already tinted. */
export interface EngineLight {
  key: string;
  x: number;
  y: number;
  bright: number;
  dim: number;
  /** Radius of the flame before placement clamps it. */
  flame: number;
  color: readonly [number, number, number];
  intensity: number;
  animation: LightAnimation;
}

/** Everything the engine lights, in world pixels. */
export interface EngineScene {
  bounds: MapBounds;
  /** The map image; bounce reads its colours (mid grey without one). */
  albedo: Texture | null;
  /** Welded walls. */
  walls: readonly WallSegment[];
  lights: readonly EngineLight[];
  sight: Sight;
  /** Footprint radius of a vision token, for the soft edges of its sight. */
  sightRadius: number;
  ambient: number;
  ambientColor?: string;
}
