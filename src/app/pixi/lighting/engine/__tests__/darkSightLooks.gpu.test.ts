import { RenderTexture, Sprite, Texture } from 'pixi.js';
import { afterEach, describe, expect, it } from 'vitest';
import { BUILT_IN_SENSES, GENERIC_SENSES } from '../../../../gameSystems/senses';
import { srgbToLinear } from '../../../../lighting/srgb';
import type { TokenEntity } from '../../../../types';
import type { TokenSense } from '../../../../types/senseTypes';
import type { WallSegment } from '../../../../types/wallTypes';
import { computeSight, sightSources } from '../../../../vision/sight';
import { LightingEngine } from '../LightingEngine';
import type { LightingMode } from '../compositeFilter';
import type { EngineLight, EngineScene } from '../types';
import { createTestRenderer, renderThroughEngine, type PixelReader } from './gpuTestUtils';
import { watchGl } from './strictGl';

const SIZE = 256;
const MAP = 1024;
/** The whole map on screen, one screen pixel for four world pixels, on a blue-grey floor. */
const camera = { size: SIZE, scale: SIZE / MAP, x: 0, y: 0, tint: 0x6699cc };
const ALL_SENSES = [...GENERIC_SENSES, ...Object.values(BUILT_IN_SENSES).flat()];
const scale = { unitDistance: 5, cellSize: 5 };

const lamp: EngineLight = { key: 'lamp', x: 250, y: 512, bright: 100, dim: 200, flame: 10, color: [1, 1, 1], intensity: 1, animation: 'none' };
const wall: WallSegment = { id: 'w', kind: 'wall', type: 'solid', p1: { x: 850, y: 300 }, p2: { x: 850, y: 724 } };
const VIEWER = { x: 700, y: 512 };
/** World points: in the lamp's bright light, in the dark 80 px from the viewer, and in the dark behind the wall. */
const BRIGHT = { x: 300, y: 512 };
const DARK = { x: 780, y: 512 };
const BEHIND = { x: 900, y: 512 };

type Looks = Pick<EngineScene, 'darkSightLook' | 'darkSightTint'>;
type Pixel = readonly [number, number, number];

function sense(id: string): TokenSense[] {
  const definition = ALL_SENSES.find((candidate) => candidate.id === id)!;
  return [{ id, ...(definition.range === 'required' && { range: 400 }) }];
}

const luminance = ([r, g, b]: Pixel): number => 0.2126 * r + 0.7152 * g + 0.0722 * b;
const chroma = (pixel: Pixel): number => Math.max(...pixel) - Math.min(...pixel);
/** The light a pixel gives off, 0..1: its luminance once the sRGB encoding is undone. */
const light = (pixel: Pixel): number => luminance(pixel.map((channel) => srgbToLinear(channel / 255) * 255) as unknown as Pixel) / 255;

describe('the scene\'s darkvision look', () => {
  const cleanup: (() => void)[] = [];
  afterEach(() => {
    while (cleanup.length) cleanup.pop()!();
  });

  /** The players' picture of the viewer's senses under `looks`, read with every GL call checked. */
  async function frame(senses: TokenSense[], looks: Looks = {}, mode: LightingMode = 'player', floor: number = camera.tint, scene: Partial<EngineScene> = {}): Promise<PixelReader> {
    const renderer = await createTestRenderer(SIZE);
    cleanup.push(() => renderer.destroy());
    const watch = watchGl(renderer.gl);
    const engine = new LightingEngine(renderer);
    cleanup.push(() => engine.destroy());
    const viewer: TokenEntity = { id: 'v', kind: 'token', imagePath: 'v.png', ...VIEWER, vision: { enabled: true, senses } };
    const sight = computeSight(sightSources({ v: viewer }, scale, { width: MAP, height: MAP }, { definitions: ALL_SENSES, conditions: [] }), [wall]);
    engine.setEnabled(true);
    engine.setMode(mode);
    engine.update({ bounds: { width: MAP, height: MAP }, albedo: null, walls: [wall], lights: [lamp], sight, sightRadius: 20, ambient: 0, ...looks, ...scene });
    engine.flush();
    const at = renderThroughEngine(engine, renderer, { ...camera, tint: floor });
    watch.stop();
    expect(watch.findings).toEqual([]);
    return at;
  }

  async function render(senses: TokenSense[], looks: Looks = {}, mode: LightingMode = 'player'): Promise<(point: { x: number; y: number }) => Pixel> {
    const at = await frame(senses, looks, mode);
    return (point) => at(Math.round(point.x * camera.scale), Math.round(point.y * camera.scale));
  }

  function sameFrame(a: PixelReader, b: PixelReader): boolean {
    for (let y = 0; y < SIZE; y++) {
      for (let x = 0; x < SIZE; x++) {
        const [p, q] = [a(x, y), b(x, y)];
        if (p[0] !== q[0] || p[1] !== q[1] || p[2] !== q[2]) return false;
      }
    }
    return true;
  }

  it('is pixel for pixel the picture without the option while unset or as the system says, for every look without colour', async () => {
    for (const id of ['darkvision', 'pathfinder2e-darkvision', 'ose-infravision']) {
      for (const mode of ['player', 'gm'] as const) {
        const before = await frame(sense(id), {}, mode);
        expect(sameFrame(before, await frame(sense(id), { darkSightLook: 'system' }, mode))).toBe(true);
        // A tint without a hue is none.
        expect(sameFrame(before, await frame(sense(id), { darkSightTint: '#ffffff' }, mode))).toBe(true);
      }
    }
  });

  it('as the system says: darkvision grey, Pathfinder black and white, infravision in heat tones', async () => {
    expect(chroma((await render(sense('darkvision'), { darkSightLook: 'system' }))(DARK))).toBeLessThan(12);
    expect(chroma((await render(sense('pathfinder2e-darkvision'), { darkSightLook: 'system' }))(DARK))).toBeLessThanOrEqual(2);
    const [r, g, b] = (await render(sense('ose-infravision'), { darkSightLook: 'system' }))(DARK);
    expect(r).toBeGreaterThan(g + 20);
    expect(g).toBeGreaterThan(b);
  });

  it('grey: every look without colour is the grey of darkvision, at the level the sense sees the dark at', async () => {
    const darkvision = (await render(sense('darkvision')))(DARK);
    expect((await render(sense('darkvision'), { darkSightLook: 'grey' }))(DARK)).toEqual(darkvision);
    // Infravision sees the dark as dim, like the generic darkvision: grey makes the two one picture.
    const infravision = (await render(sense('ose-infravision'), { darkSightLook: 'grey' }))(DARK);
    expect(infravision).toEqual(darkvision);
    // Pathfinder's darkvision sees the dark as bright: grey, and as bright as before.
    const own = (await render(sense('pathfinder2e-darkvision')))(DARK);
    const grey = (await render(sense('pathfinder2e-darkvision'), { darkSightLook: 'grey' }))(DARK);
    expect(chroma(grey)).toBeLessThan(40);
    expect(chroma(grey)).toBeGreaterThan(chroma(own));
    expect(Math.abs(luminance(grey) - luminance(own))).toBeLessThan(6);
  });

  it('in colour: every look without colour shows the map\'s own colours, as bright as the sense sees the dark', async () => {
    for (const id of ['darkvision', 'pathfinder2e-darkvision', 'ose-infravision']) {
      const own = (await render(sense(id)))(DARK);
      const [r, g, b] = (await render(sense(id), { darkSightLook: 'colour' }))(DARK);
      // The floor is blue-grey (#6699cc).
      expect(b).toBeGreaterThan(g);
      expect(g).toBeGreaterThan(r);
      expect(b - r).toBeGreaterThan(20);
      if (id !== 'ose-infravision') expect(Math.abs(luminance([r, g, b]) - luminance(own))).toBeLessThan(6);
    }
  });

  it('tints the look in the hue picked and keeps its brightness', async () => {
    const plain = (await render(sense('darkvision')))(DARK);
    const [r, g, b] = (await render(sense('darkvision'), { darkSightTint: '#40ff80' }))(DARK);
    expect(g).toBeGreaterThan(r + 15);
    expect(g).toBeGreaterThan(b + 10);
    expect(light([r, g, b]) / light(plain)).toBeGreaterThan(0.85);
    expect(light([r, g, b]) / light(plain)).toBeLessThan(1.15);
    // With a look the scene chose, too.
    const tinted = (await render(sense('ose-infravision'), { darkSightLook: 'grey', darkSightTint: '#40ff80' }))(DARK);
    expect(tinted).toEqual([r, g, b]);
  });

  it('changes nothing but what is perceived without light and without colour', async () => {
    const looks: Looks[] = [{ darkSightLook: 'grey' }, { darkSightLook: 'colour' }, { darkSightTint: '#ff2020' }];
    for (const choice of looks) {
      // Light is drawn as light, and a wall still ends the sense.
      const plain = await render(sense('darkvision'));
      const at = await render(sense('darkvision'), choice);
      expect(at(BRIGHT)).toEqual(plain(BRIGHT));
      expect(at(BEHIND)).toEqual([0, 0, 0]);
      // A sense that sees in colour keeps its look.
      const blindsight = await frame(sense('blindsight'));
      expect(sameFrame(blindsight, await frame(sense('blindsight'), choice))).toBe(true);
      // Without a sense there is nothing to draw differently.
      expect(sameFrame(await frame([]), await frame([], choice))).toBe(true);
    }
  });

  it('reads a look or tint it does not know as unset', async () => {
    const before = await frame(sense('ose-infravision'));
    const unknown = { darkSightLook: 'sepia', darkSightTint: 'red' } as unknown as Looks;
    expect(sameFrame(before, await frame(sense('ose-infravision'), unknown))).toBe(true);
  });

  describe('a tint', () => {
    /** Floors from dark brown to sand to grey, and one of each pure colour's opposite. */
    const FLOORS = { 'dark brown': 0x3b2414, brown: 0x8b4513, sand: 0xc2b280, grey: 0x808080, 'pale stone': 0xd8d8d0, moss: 0x4c7a3f, 'blue-grey': 0x6699cc } as const;
    const TINTS = ['#0000ff', '#ff0000', '#00ff00', '#40ff80', '#ff9040', '#8020c0', '#203040'];
    const LOOKS: Looks['darkSightLook'][] = [undefined, 'grey', 'colour'];
    /** The light of the dark floor around `DARK`, averaged over a few pixels: the composite's dither moves each by a level. */
    const lightAround = (at: PixelReader): number => {
      const [cx, cy] = [Math.round(DARK.x * camera.scale), Math.round(DARK.y * camera.scale)];
      let sum = 0;
      for (let dy = -2; dy <= 2; dy++) for (let dx = -2; dx <= 2; dx++) sum += light(at(cx + dx, cy + dy));
      return sum / 25;
    };

    it('changes the hue and not how much the party sees: as bright as the untinted look, on every floor and for every look', { timeout: 300_000 }, async () => {
      // One engine for the whole grid: only the sight, the look and the floor change.
      const renderer = await createTestRenderer(SIZE);
      cleanup.push(() => renderer.destroy());
      const watch = watchGl(renderer.gl);
      const engine = new LightingEngine(renderer);
      cleanup.push(() => engine.destroy());
      engine.setEnabled(true);
      engine.setMode('player');
      const off: string[] = [];
      let compared = 0;
      for (const id of ['darkvision', 'pathfinder2e-darkvision', 'ose-infravision']) {
        const viewer: TokenEntity = { id: 'v', kind: 'token', imagePath: 'v.png', ...VIEWER, vision: { enabled: true, senses: sense(id) } };
        const sight = computeSight(sightSources({ v: viewer }, scale, { width: MAP, height: MAP }, { definitions: ALL_SENSES, conditions: [] }), [wall]);
        const shoot = (looks: Looks, floor: number): number => {
          engine.update({ bounds: { width: MAP, height: MAP }, albedo: null, walls: [wall], lights: [lamp], sight, sightRadius: 20, ambient: 0, ...looks });
          engine.flush();
          return lightAround(renderThroughEngine(engine, renderer, { ...camera, tint: floor }));
        };
        for (const [floorName, floor] of Object.entries(FLOORS)) {
          for (const darkSightLook of LOOKS) {
            const look = darkSightLook ? { darkSightLook } : {};
            const untinted = shoot(look, floor);
            expect(untinted).toBeGreaterThan(0);
            for (const darkSightTint of TINTS) {
              const ratio = shoot({ ...look, darkSightTint }, floor) / untinted;
              compared++;
              if (ratio < 0.85 || ratio > 1.15) off.push(`${id} on ${floorName}, ${darkSightLook ?? 'system'}, ${darkSightTint}: ${ratio.toFixed(2)}`);
            }
          }
        }
      }
      watch.stop();
      expect(watch.findings).toEqual([]);
      expect(compared).toBe(3 * 7 * 3 * 7);
      expect(off).toEqual([]);
    });

    it('gives its hue: blue stays blue on a brown floor in colour, where the floor has next to no blue', async () => {
      const at = await frame(sense('darkvision'), { darkSightLook: 'colour', darkSightTint: '#0000ff' }, 'player', FLOORS.brown);
      const [br, bg, bb] = at(Math.round(DARK.x * camera.scale), Math.round(DARK.y * camera.scale));
      expect(bb).toBeGreaterThan(br + 30);
      expect(bb).toBeGreaterThan(bg + 30);
    });

    it('is none below a small saturation: a near black and a near grey leave the picture as it is', async () => {
      const before = await frame(sense('darkvision'));
      for (const darkSightTint of ['#000001', '#000000', '#0a0a0a', '#101014', '#808080', '#fdfdfd']) {
        expect(sameFrame(before, await frame(sense('darkvision'), { darkSightTint })), darkSightTint).toBe(true);
      }
    });

    it('keeps the remembered look out of what a sense shows: a tinted dim sense over explored ground is the tint\'s hue alone', async () => {
      // The whole map is explored and remembered; the sense sees the dark as dim.
      const renderer = await createTestRenderer(SIZE);
      cleanup.push(() => renderer.destroy());
      const explored = RenderTexture.create({ width: 64, height: 64 });
      const white = new Sprite(Texture.WHITE);
      white.setSize(64, 64);
      renderer.render({ container: white, target: explored, clear: true });
      white.destroy();
      cleanup.push(() => explored.destroy(true));
      for (const [darkSightTint, strong, weak] of [['#0000ff', 2, 0], ['#ff0000', 0, 2]] as const) {
        const engine = new LightingEngine(renderer);
        const viewer: TokenEntity = { id: 'v', kind: 'token', imagePath: 'v.png', ...VIEWER, vision: { enabled: true, senses: sense('darkvision') } };
        const sight = computeSight(sightSources({ v: viewer }, scale, { width: MAP, height: MAP }, { definitions: ALL_SENSES, conditions: [] }), [wall]);
        engine.setEnabled(true);
        engine.setMode('player');
        engine.setExplored(explored);
        engine.update({ bounds: { width: MAP, height: MAP }, albedo: null, walls: [wall], lights: [], sight, sightRadius: 20, ambient: 0, exploredMemory: true, darkSightTint });
        engine.flush();
        const at = renderThroughEngine(engine, renderer, { ...camera, tint: FLOORS.grey });
        const pixel = at(Math.round(DARK.x * camera.scale), Math.round(DARK.y * camera.scale));
        engine.destroy();
        // The grey of memory would raise the two channels the tint leaves empty.
        expect(pixel[strong]).toBeGreaterThan(60);
        expect(pixel[weak]).toBeLessThanOrEqual(2);
        expect(pixel[1]).toBeLessThanOrEqual(2);
        // Behind the wall no sense reaches: there the memory shows, grey.
        const behind = at(Math.round(BEHIND.x * camera.scale), Math.round(BEHIND.y * camera.scale));
        expect(behind[0]).toBeGreaterThan(20);
        expect(Math.max(...behind) - Math.min(...behind)).toBeLessThanOrEqual(2);
      }
    });
  });
});
