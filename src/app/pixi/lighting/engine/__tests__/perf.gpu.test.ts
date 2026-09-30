/// <reference types="vite/client" />
import type { Renderer, WebGLRenderer } from 'pixi.js';
import { describe, expect, it } from 'vitest';
import { LightingEngine } from '../LightingEngine';
import { SEES_ALL } from '../../../../vision/sight';
import type { WallSegment } from '../../../../types/wallTypes';
import type { EngineLight, EngineScene } from '../types';
import { createTestRenderer } from './gpuTestUtils';
import { rng } from './fuzzRooms';

const SAMPLES = 5;
/** Attempts per sample; an attempt whose timing the GPU reports as disjoint is discarded. */
const MAX_ATTEMPTS = 5;
const STRICT = import.meta.env.VITE_PERF_STRICT === '1';

interface TimerExt { TIME_ELAPSED_EXT: number; GPU_DISJOINT_EXT: number }

interface Sample {
  all: number;
  bounce: number;
  moved: number;
}

/**
 * GPU time of `fn` from a timer query (CPU time around readPixels does not wait for the GPU);
 * null when the GPU reported a disjoint event, which voids the measurement.
 */
async function gpuMs(gl: WebGL2RenderingContext, ext: TimerExt, fn: () => void): Promise<number | null> {
  gl.getParameter(ext.GPU_DISJOINT_EXT);
  const query = gl.createQuery()!;
  gl.beginQuery(ext.TIME_ELAPSED_EXT, query);
  fn();
  gl.endQuery(ext.TIME_ELAPSED_EXT);
  while (!gl.getQueryParameter(query, gl.QUERY_RESULT_AVAILABLE)) await new Promise((r) => setTimeout(r, 5));
  const ns = gl.getQueryParameter(query, gl.QUERY_RESULT) as number;
  gl.deleteQuery(query);
  return gl.getParameter(ext.GPU_DISJOINT_EXT) ? null : ns / 1e6;
}

/**
 * A fresh engine's first build, bounce and one moved light. Null if any timing was disjoint:
 * re-running a step on the state it already applied would measure a no-op.
 */
async function sample(renderer: WebGLRenderer, ext: TimerExt, scene: EngineScene): Promise<Sample | null> {
  const engine = new LightingEngine(renderer);
  try {
    engine.setEnabled(true);
    const all = await gpuMs(renderer.gl, ext, () => engine.update(scene));
    const bounce = await gpuMs(renderer.gl, ext, () => engine.flush());
    const moved = await gpuMs(renderer.gl, ext, () => engine.update(withMovedLight(scene, 10)));
    return all === null || bounce === null || moved === null ? null : { all, bounce, moved };
  } finally {
    engine.destroy();
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
    try {
      const gpu = await gpuName(renderer);
      const ext = renderer.gl.getExtension('EXT_disjoint_timer_query_webgl2') as TimerExt | null;
      if (!ext || gpu.includes('SwiftShader')) ctx.skip('no GPU timer, or software rendering');
      const scene = randomScene(3);
      const samples: Sample[] = [];
      for (let i = 0; i < SAMPLES; i++) {
        for (let attempt = 0; attempt < MAX_ATTEMPTS; attempt++) {
          const taken = await sample(renderer, ext!, scene);
          if (!taken) continue;
          samples.push(taken);
          break;
        }
      }
      if (samples.length === 0) ctx.skip('every GPU timing was disjoint');
      const pick = (key: keyof Sample): number => median(samples.map((taken) => taken[key]));
      const figures = { gpu, samples: samples.length, all: pick('all'), bounce: pick('bounce'), moved: pick('moved') };
      console.info(`lighting perf: ${JSON.stringify(figures)}`);
      if (STRICT) {
        expect(figures.moved).toBeLessThan(3);
        expect(figures.bounce).toBeLessThan(10);
      }
    } finally {
      renderer.destroy();
    }
  });
});
