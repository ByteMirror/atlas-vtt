import { Container, Mesh, Shader, UniformGroup, type Renderer, type RenderTexture } from 'pixi.js';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { HALO, LIGHT_LEVELS } from '../../../../lighting/lightingConstants';
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

/** The fade from the dim radius to the reach: a smootherstep, 1 up to `dim` and 0 from `reach` on. */
function fade(d: number, dim: number, reach: number): number {
  const u = Math.min(1, Math.max(0, (reach - d) / (reach - dim)));
  return u * u * u * (u * (u * 6 - 15) + 10);
}

/** The two levels and the knee between them, without the halo: dim + (bright − dim) / (1 + (d / b)⁴). */
function levelsOnly(d: number, bright: number, dim: number, reach: number): number {
  const level = LIGHT_LEVELS.dim + (LIGHT_LEVELS.bright - LIGHT_LEVELS.dim) / (1 + (d / bright) ** 4);
  return level * fade(d, dim, reach);
}

/** The light with its Gaussian halo (`HALO`) added before the fade. */
function expected(d: number, bright: number, dim: number, reach: number): number {
  const s = Math.max(Math.max(bright, reach * 0.25) * HALO.size, 1);
  const level = LIGHT_LEVELS.dim + (LIGHT_LEVELS.bright - LIGHT_LEVELS.dim) / (1 + (d / bright) ** 4);
  return (level + HALO.gain * Math.exp(-(d * d) / (2 * s * s))) * fade(d, dim, reach);
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

  /** A light whose fade starts at `dim` and ends at `reach`. */
  function light(tile: Tile, bright: number, dim: number, reach: number): DrawnLight {
    return { tile, bright, dim, reach, color: [1, 1, 1], intensity: 1 };
  }

  it('clears a render target to 1 in its first channel, as the tiles need', async () => {
    const { renderer } = await setup(64);
    const tile = tileOf(renderer, 0, 0, [0, 0, 64, 64], 'all');
    expect(readUnorm(renderer, tile.texture).every((v, i) => i % 4 !== 0 || v === 1)).toBe(true);
  });

  it('is halfway between its levels at the bright radius, at the dim level at the dim radius, zero from the reach on, and follows the tile', async () => {
    const { renderer, map, at } = await setup(512);
    const tile = tileOf(renderer, 200, 200, [0, 0, 400, 400], 'all');
    map.draw([light(tile, 40, 134, 150)]);
    const texels = readFloats(renderer, map.texture);
    const halfway = (LIGHT_LEVELS.bright + LIGHT_LEVELS.dim) / 2;
    expect(expected(40, 40, 134, 150)).toBeCloseTo(halfway, 2);
    expect(at(texels, 241, 201)).toBeCloseTo(expected(Math.hypot(41, 1), 40, 134, 150), 3);
    expect(at(texels, 241, 201)).toBeCloseTo(halfway, 1);
    // Just inside the dim radius the light is still at its dim level: the fade has not begun.
    expect(at(texels, 331, 201)).toBeCloseTo(expected(Math.hypot(131, 1), 40, 134, 150), 3);
    expect(at(texels, 331, 201)).toBeGreaterThan(LIGHT_LEVELS.dim);
    expect(at(texels, 345, 201)).toBeCloseTo(expected(Math.hypot(145, 1), 40, 134, 150), 3);
    expect(at(texels, 345, 201)).toBeLessThan(0.5 * LIGHT_LEVELS.dim);
    expect(at(texels, 351, 201)).toBe(0);
    expect(at(texels, 360, 201)).toBe(0);
    expect(at(texels, 200, 450)).toBe(0);
  });

  it('holds in alpha the luminance the light would have at its bright level, never less than it has', async () => {
    const { renderer, map } = await setup(512);
    const tile = tileOf(renderer, 200, 200, [0, 0, 400, 400], 'all');
    map.draw([light(tile, 40, 134, 150)]);
    const texels = readFloats(renderer, map.texture);
    const texel = (x: number, y: number): number => (Math.floor(y / 2) * map.texture.source.pixelWidth + Math.floor(x / 2)) * 4;
    // In the dim range: the bright level. In the fade: the bright level, faded as the light is.
    const dim = texel(331, 201);
    expect(texels[dim + 3]).toBeCloseTo(LIGHT_LEVELS.bright, 2);
    const fading = texel(345, 201);
    expect(texels[fading + 3]! / texels[fading]!).toBeCloseTo(LIGHT_LEVELS.bright / (expected(Math.hypot(145, 1), 40, 134, 150) / fade(Math.hypot(145, 1), 134, 150)), 2);
    // At the flame the halo lifts the light above its bright level: alpha is what it gives.
    const flame = texel(200, 200);
    expect(texels[flame + 3]).toBeCloseTo(texels[flame]!, 2);
    expect(texels[texel(351, 201) + 3]).toBe(0);
  });

  it('lights a light without a bright radius at its dim level', async () => {
    const { renderer, map, at } = await setup(512);
    const tile = tileOf(renderer, 200, 200, [0, 0, 400, 400], 'all');
    map.draw([light(tile, 0, 134, 150)]);
    const texels = readFloats(renderer, map.texture);
    expect(at(texels, 291, 201)).toBeCloseTo(LIGHT_LEVELS.dim, 3);
    expect(at(texels, 331, 201)).toBeCloseTo(LIGHT_LEVELS.dim, 3);
  });

  it('adds a halo of about the gain at the flame, nothing noticeable at the bright radius', async () => {
    const { renderer, map, at } = await setup(512);
    const tile = tileOf(renderer, 200, 200, [0, 0, 400, 400], 'all');
    map.draw([light(tile, 40, 134, 150)]);
    const texels = readFloats(renderer, map.texture);
    const centre = Math.hypot(1, 1);
    // Half floats keep 11 significant bits: about 0.002 at this level.
    expect(at(texels, 200, 200)).toBeCloseTo(expected(centre, 40, 134, 150), 2);
    expect(at(texels, 200, 200) - levelsOnly(centre, 40, 134, 150)).toBeCloseTo(HALO.gain, 1);
    expect(at(texels, 241, 201) - levelsOnly(Math.hypot(41, 1), 40, 134, 150)).toBeLessThan(1e-3);
  });

  it('reads the tile the right way up: only the lit quadrant of the tile shines', async () => {
    const { renderer, map, at } = await setup(512);
    const tile = tileOf(renderer, 200, 200, [0, 0, 400, 400], [0, 0, 0.5, 0.5]);
    map.draw([light(tile, 40, 134, 150)]);
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
    map.draw([light(a, 40, 134, 150), light(b, 40, 89, 100)]);
    let texels = readFloats(renderer, map.texture);
    const dA = Math.hypot(250 + 1 - 200, 250 + 1 - 200);
    const dB = Math.hypot(250 + 1 - 312, 250 + 1 - 312);
    expect(at(texels, 251, 251)).toBeCloseTo(expected(dA, 40, 134, 150) + expected(dB, 40, 89, 100), 2);
    map.draw([light(b, 40, 89, 100)]);
    texels = readFloats(renderer, map.texture);
    expect(at(texels, 150, 150)).toBe(0);
    expect(at(texels, 312 + 1, 312 + 1)).toBeGreaterThan(0.4);
  });

  it('does not keep a destroyed tile bound: no PIXI warning, correct output', async () => {
    const { renderer, map, at } = await setup(512);
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    const first = tileOf(renderer, 200, 200, [0, 0, 400, 400], 'all');
    map.draw([light(first, 40, 134, 150), light(first, 40, 134, 150)]);
    first.texture.destroy(true);
    const second = tileOf(renderer, 300, 300, [100, 100, 400, 400], 'all');
    map.draw([light(second, 40, 134, 150)]);
    const texels = readFloats(renderer, map.texture);
    expect(warn).not.toHaveBeenCalled();
    expect(at(texels, 301, 301)).toBeCloseTo(expected(Math.hypot(1, 1), 40, 134, 150), 2);
    expect(at(texels, 150, 150)).toBe(0);
  });

  it('stays finite for a light without radii', async () => {
    const { renderer, map } = await setup(128);
    const tile = tileOf(renderer, 64, 64, [0, 0, 128, 128], 'all');
    map.draw([light(tile, 0, 0, 0)]);
    expect(readFloats(renderer, map.texture).every((v) => Number.isFinite(v))).toBe(true);
  });

  it('clears to black with no lights', async () => {
    const { renderer, map } = await setup(64);
    map.draw([]);
    expect(Array.from(readFloats(renderer, map.texture)).every((v, i) => i % 4 === 3 || v === 0)).toBe(true);
  });
});
