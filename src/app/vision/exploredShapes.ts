import type { SceneLighting } from '../types/lightingTypes';
import { exploredMemoryOn } from '../lighting/sceneLightingOptions';
import { ambientLights, type AmbientLight, type LightReach, type Sight } from './sight';
import type { Polygon } from './visibility';

/** What explored memory records: `polygons`, drawn only inside `clip` when it is set. */
export interface ExploredShapes {
  polygons: Polygon[];
  clip: Polygon[] | null;
}

/**
 * The part of the viewer's sight they actually saw: all of it in a lit scene, otherwise only
 * where light reaches or darkvision sees. Null when nothing is recorded: when the scene
 * remembers nothing, and when no token has vision (then line of sight hides nothing and there
 * is nothing to remember).
 */
export function exploredShapes(
  sight: Sight,
  scene: AmbientLight & Pick<SceneLighting, 'exploredMemory'>,
  lights: readonly LightReach[],
): ExploredShapes | null {
  if (!exploredMemoryOn(scene) || sight.all || sight.polygons.length === 0) return null;
  if (ambientLights(scene)) return { polygons: sight.polygons, clip: null };
  const seen = [...lights.map((light) => light.polygon), ...sight.darkvision];
  return seen.length > 0 ? { polygons: seen, clip: sight.polygons } : null;
}
