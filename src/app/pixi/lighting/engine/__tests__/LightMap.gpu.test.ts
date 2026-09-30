import { Container, Mesh, Shader, UniformGroup, type Renderer, type RenderTexture } from 'pixi.js';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { GLSL_VERSION } from '../glsl';
import { createQuad, createTarget, HIGHP, quadGeometry, renderInto } from '../gpu';
import { LightMap, type DrawnLight } from '../LightMap';
import type { Tile } from '../TileCache';
import { createTestRenderer, readFloats, readUnorm } from './gpuTestUtils';

const vertex = `${GLSL_VERSION}
in vec2 aPosition;
uniform vec4 uRegion;
void main() { gl_Position = vec4((uRegion.xy + aPosition * uRegion.zw) * 2.0 - 1.0, 0.0, 1.0); }`;
const fragment = `${GLSL_VERSION}
out vec4 finalColor;
void main() { finalColor = vec4(1.0); }`;

/** A tile texture that is 0 everywhere except `lit` (0..1 of the target, GL row order), which is 1. */
function makeTile(renderer: Renderer, size: number, lit: readonly [number, number, number, number] | 'all'): RenderTexture {
  const target = createTarget(size, size, 'r8unorm', 'nearest');
  const region = lit === 'all' ? [0, 0, 1, 1] : lit;
  const uniforms = new UniformGroup({ uRegion: { value: new Float32Array(region), type: 'vec4<f32>' } });
  const shader = Shader.from({ gl: { vertex, fragment, name: 'test-tile', preferredFragmentPrecision: HIGHP }, resources: { uniforms } });
  const quad = createQuad();
  const geometry = quadGeometry(quad);
  const scene = new Container();
  scene.addChild(new Mesh({ geometry, shader }));
  renderInto(renderer, scene, target, [0, 0, 0, 1]);
  scene.destroy({ children: true });
  geometry.destroy();
  quad.vertices.destroy();
  quad.indices.destroy();
  shader.destroy();
  return target;
}

/** The brief's light: E = ½ ((1 + d²/b²) / 2)^(−3/2) inside a window that ends at the reach. */
function expected(d: number, bright: number, reach: number): number {
  const falloff = 0.5 * ((1 + (d * d) / (bright * bright)) / 2) ** -1.5;
  return falloff * (1 - (d / reach) ** 4) ** 2;
}

describe('LightMap', () => {
  const cleanup: (() => void)[] = [];
  afterEach(() => {
    vi.restoreAllMocks();
    while (cleanup.length) cleanup.pop()!();
  });

  async function setup(mapSize: number): Promise<{ renderer: Awaited<ReturnType<typeof createTestRenderer>>; map: LightMap; at: (texels: Float32Array, x: number, y: number) => number }> {
    const renderer = await createTestRenderer(64);
    const map = new LightMap(renderer, { width: mapSize, height: mapSize }, 2);
    cleanup.push(() => renderer.destroy());
    cleanup.push(() => map.destroy());
    const at = (texels: Float32Array, x: number, y: number): number => texels[(Math.floor(y / 2) * map.texture.source.pixelWidth + Math.floor(x / 2)) * 4]!;
    return { renderer, map, at };
  }

  function tileOf(renderer: Renderer, x: number, y: number, rect: Tile['rect'], lit: Parameters<typeof makeTile>[2]): Tile {
    const texture = makeTile(renderer, rect[2] / 2, lit);
    cleanup.push(() => { if (!texture.destroyed) texture.destroy(true); });
    return { x, y, flame: 5, rect, texture };
  }

  function light(tile: Tile, bright: number, reach: number): DrawnLight {
    return { tile, bright, reach, color: [1, 1, 1], intensity: 1 };
  }

  it('clears a render target to 1 in its first channel, as the tiles need', async () => {
    const { renderer } = await setup(64);
    const tile = tileOf(renderer, 0, 0, [0, 0, 64, 64], 'all');
    expect(readUnorm(renderer, tile.texture).every((v, i) => i % 4 !== 0 || v === 1)).toBe(true);
  });

  it('gives half the light at the bright radius, zero past the reach and follows the tile', async () => {
    const { renderer, map, at } = await setup(512);
    const tile = tileOf(renderer, 200, 200, [0, 0, 400, 400], 'all');
    map.draw([light(tile, 40, 150)]);
    const texels = readFloats(renderer, map.texture);
    expect(at(texels, 241, 201)).toBeCloseTo(expected(Math.hypot(41, 1), 40, 150), 3);
    expect(at(texels, 360, 201)).toBe(0);
    expect(at(texels, 200, 450)).toBe(0);
  });

  it('reads the tile the right way up: only the lit quadrant of the tile shines', async () => {
    const { renderer, map, at } = await setup(512);
    const tile = tileOf(renderer, 200, 200, [0, 0, 400, 400], [0, 0, 0.5, 0.5]);
    map.draw([light(tile, 40, 150)]);
    const texels = readFloats(renderer, map.texture);
    expect(at(texels, 150, 150)).toBeGreaterThan(0.05);
    expect(at(texels, 250, 150)).toBe(0);
    expect(at(texels, 150, 250)).toBe(0);
    expect(at(texels, 250, 250)).toBe(0);
  });

  it('adds lights, and reuses slots when fewer lights are drawn', async () => {
    const { renderer, map, at } = await setup(512);
    const a = tileOf(renderer, 200, 200, [0, 0, 400, 400], 'all');
    const b = tileOf(renderer, 312, 312, [112, 112, 400, 400], 'all');
    map.draw([light(a, 40, 150), light(b, 40, 100)]);
    let texels = readFloats(renderer, map.texture);
    const dA = Math.hypot(250 + 1 - 200, 250 + 1 - 200);
    const dB = Math.hypot(250 + 1 - 312, 250 + 1 - 312);
    expect(at(texels, 251, 251)).toBeCloseTo(expected(dA, 40, 150) + expected(dB, 40, 100), 2);
    map.draw([light(b, 40, 100)]);
    texels = readFloats(renderer, map.texture);
    expect(at(texels, 150, 150)).toBe(0);
    expect(at(texels, 312 + 1, 312 + 1)).toBeGreaterThan(0.4);
  });

  it('does not keep a destroyed tile bound: no PIXI warning, correct output', async () => {
    const { renderer, map, at } = await setup(512);
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    const first = tileOf(renderer, 200, 200, [0, 0, 400, 400], 'all');
    map.draw([light(first, 40, 150), light(first, 40, 150)]);
    first.texture.destroy(true);
    const second = tileOf(renderer, 300, 300, [100, 100, 400, 400], 'all');
    map.draw([light(second, 40, 150)]);
    const texels = readFloats(renderer, map.texture);
    expect(warn).not.toHaveBeenCalled();
    expect(at(texels, 301, 301)).toBeCloseTo(expected(Math.hypot(1, 1), 40, 150), 2);
    expect(at(texels, 150, 150)).toBe(0);
  });

  it('stays finite for a light without radii', async () => {
    const { renderer, map } = await setup(128);
    const tile = tileOf(renderer, 64, 64, [0, 0, 128, 128], 'all');
    map.draw([light(tile, 0, 0)]);
    expect(readFloats(renderer, map.texture).every((v) => Number.isFinite(v))).toBe(true);
  });

  it('clears to black with no lights', async () => {
    const { renderer, map } = await setup(64);
    map.draw([]);
    expect(Array.from(readFloats(renderer, map.texture)).every((v, i) => i % 4 === 3 || v === 0)).toBe(true);
  });
});
