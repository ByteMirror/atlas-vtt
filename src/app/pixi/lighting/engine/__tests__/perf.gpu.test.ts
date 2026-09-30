import { describe, expect, it } from 'vitest';
import { LightingEngine } from '../LightingEngine';
import { SEES_ALL } from '../../../../vision/sight';
import type { WallSegment } from '../../../../types/wallTypes';
import { createTestRenderer } from './gpuTestUtils';
import { rng } from './fuzzRooms';

/** GPU time of `fn` from a timer query; CPU time around readPixels does not wait for the GPU. */
async function gpuMs(gl: WebGL2RenderingContext, fn: () => void): Promise<number> {
  const ext = gl.getExtension('EXT_disjoint_timer_query_webgl2') as { TIME_ELAPSED_EXT: number } | null;
  if (!ext) return NaN;
  const query = gl.createQuery()!;
  gl.beginQuery(ext.TIME_ELAPSED_EXT, query);
  fn();
  gl.endQuery(ext.TIME_ELAPSED_EXT);
  while (!gl.getQueryParameter(query, gl.QUERY_RESULT_AVAILABLE)) await new Promise((r) => setTimeout(r, 5));
  const ns = gl.getQueryParameter(query, gl.QUERY_RESULT) as number;
  gl.deleteQuery(query);
  return ns / 1e6;
}

describe('lighting performance', () => {
  it('stays within budget with 1,000 walls and 40 lights', async () => {
    const renderer = await createTestRenderer(1440);
    const engine = new LightingEngine(renderer);
    try {
      const debug = renderer.gl.getExtension('WEBGL_debug_renderer_info');
      const gpu = debug ? String(renderer.gl.getParameter(debug.UNMASKED_RENDERER_WEBGL)) : 'unknown';
      const rand = rng(3);
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
      const lights = Array.from({ length: 40 }, (_, i) => ({ key: `l${i}`, x: rand() * 3682, y: rand() * 4555, bright: 20 * px, dim: 40 * px, flame: 40 * px * 0.12, color: [1, 0.6, 0.3] as const, intensity: 1, animation: 'none' as const }));
      engine.setEnabled(true);
      const scene = { bounds: { width: 3682, height: 4555 }, albedo: null, walls, lights, sight: SEES_ALL, sightRadius: 37, ambient: 0.1 };
      const all = await gpuMs(renderer.gl, () => engine.update(scene));
      const bounce = await gpuMs(renderer.gl, () => engine.flush());
      const moved = await gpuMs(renderer.gl, () => engine.update({ ...scene, lights: [{ ...lights[0]!, x: lights[0]!.x + 10 }, ...lights.slice(1)] }));
      console.info(JSON.stringify({ gpu, all, bounce, moved }));
      if (gpu.includes('SwiftShader') || Number.isNaN(all)) return;
      expect(moved).toBeLessThan(10);
      expect(bounce).toBeLessThan(15);
    } finally {
      engine.destroy();
      renderer.destroy();
    }
  });
});
