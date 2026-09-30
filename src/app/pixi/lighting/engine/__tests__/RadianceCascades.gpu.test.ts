import { BufferImageSource, Texture, type WebGLRenderer } from 'pixi.js';
import { afterEach, describe, expect, it } from 'vitest';
import { CapsuleField } from '../CapsuleField';
import { LightMap } from '../LightMap';
import { TileCache } from '../TileCache';
import { RadianceCascades } from '../RadianceCascades';
import { BOUNCE, wallRadius } from '../../../../lighting/lightingConstants';
import { splitBlocking } from '../../../../lighting/segments';
import { createTestRenderer, readFloats } from './gpuTestUtils';
import type { WallSegment } from '../../../../types/wallTypes';

const wall = (id: string, x1: number, y1: number, x2: number, y2: number): WallSegment => ({ id, kind: 'wall', type: 'solid', p1: { x: x1, y: y1 }, p2: { x: x2, y: y2 } });

const bounds = { width: 1024, height: 512 };
/** Two rooms sharing the wall x = 512; the light is in the left one. */
const walls = [wall('t', 32, 32, 992, 32), wall('b', 32, 480, 992, 480), wall('l', 32, 32, 32, 480), wall('r', 992, 32, 992, 480), wall('m', 512, 32, 512, 480)];

/** A 4 × 4 map image of one premultiplied RGBA colour. */
function flatTexture(rgba: readonly [number, number, number, number]): Texture {
  const pixels = new Uint8Array(4 * 4 * 4);
  for (let i = 0; i < pixels.length; i += 4) pixels.set(rgba, i);
  return new Texture({ source: new BufferImageSource({ resource: pixels, width: 4, height: 4 }) });
}

describe('RadianceCascades', () => {
  const cleanup: (() => void)[] = [];
  afterEach(() => {
    while (cleanup.length) cleanup.pop()!();
  });

  /** Builds the bounce of the two rooms with `albedo`; returns the fluence and its probe lookup. */
  async function bounce(albedo: Texture | null): Promise<{ probes: Float32Array; probe: (x: number, y: number) => number }> {
    const renderer: WebGLRenderer = await createTestRenderer(64);
    cleanup.push(() => renderer.destroy());
    const field = new CapsuleField(renderer, [0, 0, bounds.width, bounds.height], 2, wallRadius(2));
    const tiles = new TileCache(renderer, field);
    const map = new LightMap(renderer, bounds, 2);
    const cascades = new RadianceCascades(renderer, bounds, field);
    cleanup.push(() => {
      cascades.destroy();
      map.destroy();
      tiles.destroy();
      field.destroy();
    });
    field.build(splitBlocking(walls).twoWay);
    tiles.sync([{ key: 'l', x: 200, y: 256, bright: 120, dim: 240, flame: 20, color: [1, 1, 1], intensity: 1, animation: 'none' }], walls, 'all');
    const tile = tiles.tiles().get('l')!;
    map.draw([{ tile, bright: 120, reach: 240 * 1.12, color: [1, 1, 1], intensity: 1 }]);
    cascades.build(map, albedo, field);
    const probes = readFloats(renderer, cascades.fluence);
    const width = cascades.fluence.source.pixelWidth;
    const probe = (x: number, y: number): number => probes[(Math.floor(y / BOUNCE.probe) * width + Math.floor(x / BOUNCE.probe)) * 4]!;
    return { probes, probe };
  }

  it('bounces light into a lit room and none into the closed room beside it', async () => {
    const { probe } = await bounce(null);
    expect(probe(420, 256)).toBeGreaterThan(0);
    for (let x = 530; x < 980; x += 16) for (let y = 48; y < 470; y += 16) expect(probe(x, y)).toBe(0);
  });

  it('bounces a transparent map as mid grey, like no map at all, and an opaque one by its colour', async () => {
    const transparent = flatTexture([0, 0, 0, 0]);
    const white = flatTexture([255, 255, 255, 255]);
    cleanup.push(() => {
      transparent.destroy(true);
      white.destroy(true);
    });
    const none = await bounce(null);
    const clear = await bounce(transparent);
    const opaque = await bounce(white);
    for (let i = 0; i < none.probes.length; i++) {
      // Half floats keep 11 significant bits.
      expect(Math.abs(clear.probes[i]! - none.probes[i]!)).toBeLessThanOrEqual(Math.abs(none.probes[i]!) * 2 ** -10 + 1e-6);
    }
    // White reflects twice what mid grey does.
    expect(opaque.probe(420, 256) / none.probe(420, 256)).toBeCloseTo(2, 1);
  });
});
