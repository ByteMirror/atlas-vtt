/// <reference types="vite/client" />
import { Container, Ticker } from 'pixi.js';
import { Viewport } from 'pixi-viewport';
import { describe, expect, it, vi } from 'vitest';
import type { StoreApi } from 'zustand';
import { createTestRenderer } from '../../lighting/engine/__tests__/gpuTestUtils';
import type { ViewAtlasState } from '../../../storeFactory';
import type { WallSegment } from '../../../types/wallTypes';
import { WallRenderer } from '../WallRenderer';

const SCREEN = 1024;
const MAP = 8192;
/** Zoom steps to measure; `VITE_KIND_ZOOMS=0.25,0.5,1,2` leaves out the closest. */
const ZOOMS = String(import.meta.env.VITE_KIND_ZOOMS ?? '0.25,0.5,1,2,4').split(',').map(Number);

function rng(seed: number): () => number {
  let s = seed >>> 0;
  return () => {
    s = (Math.imul(s, 1664525) + 1013904223) >>> 0;
    return s / 2 ** 32;
  };
}

/** Walls all over a map of 8,192 px, each with a look of its own: for sight, for light, limited, in turn. */
function kindWalls(count: number): Record<string, WallSegment> {
  const rand = rng(11);
  const kinds: Partial<WallSegment>[] = [{ blocks: 'sight' }, { blocks: 'light' }, { limited: true }, { limited: true, blocks: 'sight' }];
  const walls: Record<string, WallSegment> = {};
  for (let i = 0; i < count; i++) {
    const x = rand() * MAP, y = rand() * MAP, angle = rand() * Math.PI * 2, length = 60 + rand() * 140;
    walls[`w${i}`] = { id: `w${i}`, kind: 'wall', type: 'solid', p1: { x, y }, p2: { x: x + Math.cos(angle) * length, y: y + Math.sin(angle) * length }, ...kinds[i % kinds.length] };
  }
  return walls;
}

/** Milliseconds of each zoom step of the wall editor over `count` kind walls: the event, the frame's tick and the render, until the GPU has drawn it. */
async function zoomSteps(count: number): Promise<number[]> {
  vi.stubGlobal('activeDocument', document);
  const renderer = await createTestRenderer(SCREEN);
  const ticker = new Ticker();
  ticker.autoStart = false;
  const stage = new Container();
  const viewport = new Viewport({ screenWidth: SCREEN, screenHeight: SCREEN, events: renderer.events, ticker });
  stage.addChild(viewport);
  const state = { objects: { walls: kindWalls(count) } } as unknown as ViewAtlasState;
  const store = { getState: () => state, subscribe: () => () => undefined } as unknown as StoreApi<ViewAtlasState>;
  const walls = new WallRenderer(viewport, store);
  try {
    viewport.scale.set(0.2);
    viewport.position.set(-MAP * 0.2 * 0.3, -MAP * 0.2 * 0.3);
    walls.getContainer().visible = true;
    walls.forceRedraw();
    renderer.render({ container: stage });
    renderer.gl.finish();
    const times: number[] = [];
    for (const zoom of ZOOMS) {
      const started = performance.now();
      // The middle of the map stays in the middle of the screen.
      viewport.scale.set(zoom);
      viewport.position.set(SCREEN / 2 - (MAP / 2) * zoom, SCREEN / 2 - (MAP / 2) * zoom);
      // A wheel's notch is several events within one frame.
      for (let i = 0; i < 3; i++) viewport.emit('zoomed', { viewport, type: 'wheel' });
      ticker.update(performance.now());
      renderer.render({ container: stage });
      renderer.gl.finish();
      times.push(Math.round(performance.now() - started));
    }
    return times;
  } finally {
    walls.destroy();
    stage.destroy({ children: true });
    renderer.destroy();
    vi.unstubAllGlobals();
  }
}

describe('the wall editor\'s kind walls while zooming', () => {
  // 1 to 45 ms a step for 2,000 walls and 9 to 70 ms for 20,000. Before the walls off screen
  // were left out and a notch of the wheel drew once, 2,000 took 40 to 230 ms a step and
  // 20,000 from 0.3 s at the widest zoom to 3.4 s at the closest.
  it.each([2000, 20_000])('draws %d kind walls anew within the bound at every zoom step', { timeout: 600_000 }, async (count) => {
    const times = await zoomSteps(count);
    console.info(`kind walls, ${count}: ${ZOOMS.map((zoom, i) => `zoom ${zoom}: ${times[i]} ms`).join(', ')}`);
    for (const time of times) expect(time).toBeLessThan(15_000);
  });
});
