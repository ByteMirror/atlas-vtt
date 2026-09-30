import type { WallSegment } from '../../types/wallTypes';
import { lightReach, type LightReach } from '../../vision/sight';
import type { EngineLight } from './engine/types';

interface Entry {
  x: number;
  y: number;
  dim: number;
  walls: readonly WallSegment[];
  reach: LightReach;
}

/**
 * Where each light reaches, for deciding on the CPU what is lit. A light's polygon is
 * recomputed only when it moved, its reach changed or the walls changed, so dragging a token
 * does not retrace every light.
 */
export class LightReaches {
  private entries = new Map<string, Entry>();

  sync(lights: readonly EngineLight[], walls: readonly WallSegment[]): LightReach[] {
    const next = new Map<string, Entry>();
    for (const { key, x, y, dim } of lights) {
      const cached = this.entries.get(key);
      const fresh = cached && cached.walls === walls && cached.x === x && cached.y === y && cached.dim === dim;
      next.set(key, fresh ? cached : { x, y, dim, walls, reach: lightReach({ x, y }, dim, walls) });
    }
    this.entries = next;
    return [...next.values()].map((entry) => entry.reach);
  }
}
