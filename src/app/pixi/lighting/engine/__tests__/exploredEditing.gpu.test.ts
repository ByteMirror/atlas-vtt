import type { WebGLRenderer } from 'pixi.js';
import { afterEach, describe, expect, it } from 'vitest';
import { editPolygons, strokePolygons, type ExploredEdit } from '../../../../lighting/exploredEdits';
import type { StrokeShape } from '../../../../tools/shapeStroke';
import type { ExploredShapes } from '../../../../vision/exploredShapes';
import { ExploredTexture } from '../../ExploredTexture';
import { readCoverage, writeCoverage } from '../../exploredTexels';
import { createTestRenderer } from './gpuTestUtils';
import { watchGl, type GlWatch } from './strictGl';

const SIZE = 128;
/** The red channel of every texel, top row first. */
type Reds = (x: number, y: number) => number;
const shapes = (shape: StrokeShape): ExploredShapes => ({ polygons: strokePolygons(shape), clip: null });
const everything = (mode: ExploredEdit['mode']): ExploredShapes => ({ polygons: editPolygons({ mode, area: 'everything' }, { width: SIZE, height: SIZE }), clip: null });

describe('editing the explored memory\'s texture', () => {
  const cleanup: (() => void)[] = [];
  let watch: GlWatch | null = null;
  afterEach(() => {
    watch?.stop();
    // Every stamp, erase, read and write ran under strict GL.
    expect(watch?.findings ?? []).toEqual([]);
    watch = null;
    while (cleanup.length) cleanup.pop()!();
  });

  async function memory(size = SIZE): Promise<{ renderer: WebGLRenderer; explored: ExploredTexture; reds: () => Reds }> {
    const renderer = await createTestRenderer(SIZE);
    cleanup.push(() => renderer.destroy());
    watch = watchGl(renderer.gl);
    const explored = new ExploredTexture(renderer, { width: size, height: size });
    cleanup.push(() => explored.destroy());
    const reds = (): Reds => {
      const { pixels } = renderer.extract.pixels({ target: explored.texture });
      const width = explored.texture.width;
      return (x, y) => pixels[(y * width + x) * 4]!;
    };
    return { renderer, explored, reds };
  }

  it('reveals a rectangle exactly where it is drawn', async () => {
    const { explored, reds } = await memory();
    explored.add(shapes({ type: 'rectangle', x: 40, y: 20, width: 30, height: 50 }));
    const at = reds();
    expect(at(55, 45)).toBe(255);
    expect(at(41, 21)).toBe(255);
    expect(at(68, 68)).toBe(255);
    for (const [x, y] of [[38, 45], [71, 45], [55, 18], [55, 71], [5, 5]] as const) expect(at(x, y)).toBe(0);
  });

  it('reveals the inside of a lasso, and nothing outside it', async () => {
    const { explored, reds } = await memory();
    explored.add(shapes({ type: 'lasso', points: [{ x: 20, y: 20 }, { x: 100, y: 30 }, { x: 60, y: 100 }] }));
    const at = reds();
    expect(at(60, 50)).toBe(255);
    expect(at(30, 25)).toBe(255);
    expect(at(20, 90)).toBe(0);
    expect(at(100, 90)).toBe(0);
    // A lasso of two points is no area.
    expect(strokePolygons({ type: 'lasso', points: [{ x: 0, y: 0 }, { x: 9, y: 9 }] })).toEqual([]);
  });

  it('reveals a brush stroke as wide as the brush all along it, with round ends', async () => {
    const { explored, reds } = await memory();
    explored.add(shapes({ type: 'brush', brushRadius: 10, points: [{ x: 30, y: 30 }, { x: 90, y: 30 }, { x: 90, y: 90 }] }));
    const at = reds();
    for (const [x, y] of [[30, 30], [60, 30], [60, 22], [60, 38], [90, 60], [83, 60], [97, 60], [96, 24], [90, 98], [22, 30]] as const) expect(at(x, y)).toBe(255);
    // Past the brush's radius, at the sides, beyond the ends and in the corners the round ends leave.
    for (const [x, y] of [[60, 18], [60, 42], [78, 60], [102, 60], [90, 102], [18, 30], [22, 22], [60, 60]] as const) expect(at(x, y)).toBe(0);
  });

  it('reveals a single press of the brush as a disc', async () => {
    const { explored, reds } = await memory();
    explored.add(shapes({ type: 'brush', brushRadius: 12, points: [{ x: 64, y: 64 }] }));
    const at = reds();
    for (const [x, y] of [[64, 64], [74, 64], [64, 54], [71, 71]] as const) expect(at(x, y)).toBe(255);
    for (const [x, y] of [[78, 64], [64, 78], [74, 74]] as const) expect(at(x, y)).toBe(0);
  });

  it('forgets each shape where it lies, and keeps the memory around it', async () => {
    const forgets: [StrokeShape, inside: readonly [number, number], outside: readonly [number, number]][] = [
      [{ type: 'rectangle', x: 40, y: 20, width: 30, height: 50 }, [55, 45], [75, 45]],
      [{ type: 'lasso', points: [{ x: 20, y: 20 }, { x: 100, y: 30 }, { x: 60, y: 100 }] }, [60, 50], [20, 90]],
      [{ type: 'brush', brushRadius: 10, points: [{ x: 30, y: 30 }, { x: 90, y: 30 }] }, [60, 35], [60, 44]],
    ];
    for (const [shape, inside, outside] of forgets) {
      const { explored, reds } = await memory();
      explored.add(everything('reveal'));
      explored.erase(shapes(shape));
      const at = reds();
      expect(at(...inside)).toBe(0);
      expect(at(...outside)).toBe(255);
    }
  });

  it('forgets with the smooth edge it reveals with', async () => {
    const { explored, reds } = await memory();
    const triangle: StrokeShape = { type: 'lasso', points: [{ x: 0, y: 0 }, { x: 80, y: 0 }, { x: 0, y: 80 }] };
    explored.add(shapes(triangle));
    const revealed = reds();
    explored.add(everything('reveal'));
    explored.erase(shapes(triangle));
    const forgotten = reds();
    let partial = 0;
    for (let x = 1; x < 79; x++) {
      // The texels the triangle's long edge cuts in half.
      const y = 79 - x;
      // What the stamp covered of a texel on its edge, the eraser takes of it.
      expect(Math.abs(revealed(x, y) + forgotten(x, y) - 255)).toBeLessThanOrEqual(1);
      if (revealed(x, y) > 20 && revealed(x, y) < 235) partial++;
    }
    expect(partial).toBeGreaterThan(40);
  });

  it('reveals and forgets everything', async () => {
    const { explored, reds } = await memory();
    explored.add(everything('reveal'));
    let at = reds();
    for (const [x, y] of [[0, 0], [127, 0], [0, 127], [127, 127], [64, 64]] as const) expect(at(x, y)).toBe(255);
    explored.erase(everything('forget'));
    at = reds();
    for (const [x, y] of [[0, 0], [127, 0], [0, 127], [127, 127], [64, 64]] as const) expect(at(x, y)).toBe(0);
  });

  it('reads a region and writes it back texel for texel, at its place', async () => {
    const { renderer, explored, reds } = await memory();
    explored.add(shapes({ type: 'lasso', points: [{ x: 10, y: 10 }, { x: 110, y: 30 }, { x: 40, y: 120 }] }));
    const region = { x: 16, y: 8, width: 80, height: 100 };
    const before = readCoverage(renderer, explored.texture, region);
    const whole = reds();
    for (const [x, y] of [[0, 0], [5, 9], [40, 50], [79, 99], [33, 2]] as const) expect(before[y * region.width + x]).toBe(whole(region.x + x, region.y + y));
    // Soft edges are among what is kept.
    expect([...before].some((value) => value > 20 && value < 235)).toBe(true);

    explored.erase(everything('forget'));
    explored.add(shapes({ type: 'rectangle', x: 0, y: 0, width: 64, height: 128 }));
    writeCoverage(renderer, explored.texture, region, before);
    const after = reds();
    for (let y = 0; y < SIZE; y++) {
      for (let x = 0; x < SIZE; x++) {
        const inRegion = x >= region.x && x < region.x + region.width && y >= region.y && y < region.y + region.height;
        // Inside: as it was read. Outside: untouched, the rectangle stamped since.
        expect(after(x, y)).toBe(inRegion ? whole(x, y) : x < 64 ? 255 : 0);
      }
    }
  });

  it('names the texels a stroke touches, cut to the map, and none for one outside it', async () => {
    const { explored } = await memory();
    expect(explored.regionOf(shapes({ type: 'rectangle', x: 40, y: 20, width: 30, height: 50 }))).toEqual({ x: 40, y: 20, width: 30, height: 50 });
    expect(explored.regionOf(shapes({ type: 'brush', brushRadius: 10, points: [{ x: 5, y: 120 }] }))).toEqual({ x: 0, y: 110, width: 15, height: 18 });
    expect(explored.regionOf(shapes({ type: 'rectangle', x: 200, y: 200, width: 30, height: 50 }))).toBeNull();
  });

  it('edits a memory smaller than its map at the map\'s places', async () => {
    // A 4,096 px map is remembered at half its size.
    const { renderer, explored, reds } = await memory(4096);
    explored.add(shapes({ type: 'rectangle', x: 1000, y: 2000, width: 400, height: 200 }));
    expect(reds()(600, 1050)).toBe(255);
    expect(reds()(490, 1050)).toBe(0);
    const region = explored.regionOf(shapes({ type: 'rectangle', x: 1000, y: 2000, width: 400, height: 200 }))!;
    expect(region).toEqual({ x: 500, y: 1000, width: 200, height: 100 });
    const before = readCoverage(renderer, explored.texture, region);
    explored.erase(shapes({ type: 'brush', brushRadius: 100, points: [{ x: 1200, y: 2100 }] }));
    expect(reds()(600, 1050)).toBe(0);
    writeCoverage(renderer, explored.texture, region, before);
    expect(reds()(600, 1050)).toBe(255);
  });
});
