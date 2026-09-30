/// <reference types="vite/client" />
import type { Renderer } from 'pixi.js';
import { describe, expect, it } from 'vitest';
import { LightingEngine } from '../LightingEngine';
import { SEES_ALL } from '../../../../vision/sight';
import type { WallSegment } from '../../../../types/wallTypes';
import type { EngineLight, EngineScene } from '../types';
import { createTestRenderer } from './gpuTestUtils';
import { rng } from './fuzzRooms';

const SAMPLES = 5;
const STRICT = Boolean(import.meta.env.VITE_PERF_STRICT);

interface TimerExt { TIME_ELAPSED_EXT: number; GPU_DISJOINT_EXT: number }

/**
 * GPU time of `fn` from a timer query (CPU time around readPixels does not wait for the GPU),
 * sampled again while the GPU reports a disjoint event. NaN without the extension.
 */
async function gpuMs(gl: WebGL2RenderingContext, fn: () => void): Promise<number> {
  const ext = gl.getExtension('EXT_disjoint_timer_query_webgl2') as TimerExt | null;
  if (!ext) return NaN;
  for (;;) {
    gl.getParameter(ext.GPU_DISJOINT_EXT);
    const query = gl.createQuery()!;
    gl.beginQuery(ext.TIME_ELAPSED_EXT, query);
    fn();
    gl.endQuery(ext.TIME_ELAPSED_EXT);
    while (!gl.getQueryParameter(query, gl.QUERY_RESULT_AVAILABLE)) await new Promise((r) => setTimeout(r, 5));
    const ns = gl.getQueryParameter(query, gl.QUERY_RESULT) as number;
    gl.deleteQuery(query);
    if (!gl.getParameter(ext.GPU_DISJOINT_EXT)) return ns / 1e6;
  }
}

function median(values: number[]): number {
  const sorted = [...values].sort((a, b) => a - b);
  return sorted[Math.floor(sorted.length / 2)]!;
}

function randomScene(seed: number): EngineScene {
  const rand = rng(seed);
  const walls: WallSegment[] = [];
  while (walls.length < 1000) {
    let x = rand() * 3682, y = rand() * 4555;
    for (let z = 0; z < 8; z++) {
      const a = rand() * Math.PI * 2, l = 40 + rand() * 150;
      walls.push({ id: `w${walls.length}`, kind: 'wall', type: 'solid', p1: { x, y }, p2: { x: x + Math.cos(a) * l, y: y + Math.sin(a) * l } });
      x += Math.cos(a) * l;
      y += Math.sin(a) * l;
    }
  }
  const px = 73.89 / 5;
  const lights: EngineLight[] = Array.from({ length: 40 }, (_, i) => ({ key: `l${i}`, x: rand() * 3682, y: rand() * 4555, bright: 20 * px, dim: 40 * px, flame: 40 * px * 0.12, color: [1, 0.6, 0.3], intensity: 1, animation: 'none' }));
  return { bounds: { width: 3682, height: 4555 }, albedo: null, walls, lights, sight: SEES_ALL, sightRadius: 37, ambient: 0.1 };
}

function withMovedLight(scene: EngineScene, dx: number): EngineScene {
  const [first, ...rest] = scene.lights;
  return { ...scene, lights: [{ ...first!, x: first!.x + dx }, ...rest] };
}

async function gpuName(renderer: Renderer & { gl: WebGL2RenderingContext }): Promise<string> {
  const debug = renderer.gl.getExtension('WEBGL_debug_renderer_info');
  return debug ? String(renderer.gl.getParameter(debug.UNMASKED_RENDERER_WEBGL)) : 'unknown';
}

describe('lighting performance', () => {
  it('measures 1,000 walls and 40 lights (budgets asserted with VITE_PERF_STRICT)', async (ctx) => {
    const renderer = await createTestRenderer(1440);
    const engines: LightingEngine[] = [];
    try {
      const gpu = await gpuName(renderer);
      const scene = randomScene(3);
      const all: number[] = [], bounce: number[] = [], moved: number[] = [];
      for (let i = 0; i < SAMPLES; i++) {
        const engine = new LightingEngine(renderer);
        engines.push(engine);
        engine.setEnabled(true);
        all.push(await gpuMs(renderer.gl, () => engine.update(scene)));
        bounce.push(await gpuMs(renderer.gl, () => engine.flush()));
        moved.push(await gpuMs(renderer.gl, () => engine.update(withMovedLight(scene, 10))));
        engine.destroy();
        engines.pop();
      }
      const figures = { gpu, samples: SAMPLES, all: median(all), bounce: median(bounce), moved: median(moved) };
      console.info(`lighting perf: ${JSON.stringify(figures)}`);
      if (gpu.includes('SwiftShader') || Number.isNaN(figures.all)) ctx.skip('no GPU timer, or software rendering');
      if (STRICT) {
        expect(figures.moved).toBeLessThan(3);
        expect(figures.bounce).toBeLessThan(10);
      }
    } finally {
      for (const engine of engines) engine.destroy();
      renderer.destroy();
    }
  });
});
