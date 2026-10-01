import { Application, Container, Graphics } from 'pixi.js';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { RenderScheduler, hasPendingChanges, requestRender, setBeforeRender } from '../RenderScheduler';
import { captureBeforeRender, type PlayerFrameCamera } from '../playerSafeFrame';

const SIZE = 64;
const MAP = [0, 0, 255];
const DM_ONLY = [255, 0, 0];

/** What a 2D copy of `canvas` shows at (x, y), as the player window copies it. */
function copiedPixel(canvas: HTMLCanvasElement, x: number, y: number): number[] {
  const copy = document.createElement('canvas');
  copy.width = canvas.width;
  copy.height = canvas.height;
  const context = copy.getContext('2d')!;
  context.drawImage(canvas, 0, 0);
  return Array.from(context.getImageData(x, y, 1, 1).data.slice(0, 3));
}

describe('mirroring a real stage right before its render', () => {
  const cleanup: (() => void)[] = [];
  afterEach(() => {
    vi.restoreAllMocks();
    while (cleanup.length) cleanup.pop()!();
  });

  /** A blue map covered by a red DM-only layer, rendered on change and mirrored without the layer. */
  async function setup(camera?: (world: Container) => PlayerFrameCamera): Promise<{
    app: Application; world: Container; renders: ReturnType<typeof vi.fn>; captured: number[][]; tick: () => void;
  }> {
    const app = new Application();
    await app.init({ width: SIZE, height: SIZE, preference: 'webgl', antialias: false, autoStart: false, backgroundColor: 0x00ff00 });
    const scheduler = new RenderScheduler(app);
    cleanup.push(() => { scheduler.destroy(); app.destroy(true, { children: true }); });
    const world = new Container();
    const dmOnly = new Graphics().rect(0, 0, SIZE, SIZE).fill(0xff0000);
    world.addChild(new Graphics().rect(0, 0, SIZE, SIZE).fill(0x0000ff), dmOnly);
    app.stage.addChild(world);

    const captured: number[][] = [];
    setBeforeRender(app, () => captureBeforeRender(
      [{ layer: dmOnly, visible: false }],
      () => app.renderer.render(app.stage),
      () => captured.push(copiedPixel(app.canvas, 8, 8)),
      camera?.(world),
    ));
    const renders = vi.spyOn(app.renderer, 'render');
    let time = 1000;
    return { app, world, renders, captured, tick: () => app.ticker.update(time += 8) };
  }

  it('costs one player render and one DM render, ends on the DM frame and leaves nothing pending', async () => {
    const { app, renders, captured, tick } = await setup();

    tick();
    expect(renders).toHaveBeenCalledTimes(2);
    expect(captured).toEqual([MAP]);
    expect(copiedPixel(app.canvas, 8, 8)).toEqual(DM_ONLY);
    expect(hasPendingChanges(app.stage.renderGroup)).toBe(false);

    for (let i = 0; i < 5; i++) tick();
    expect(renders).toHaveBeenCalledTimes(2);
  });

  it('leaves nothing pending after a frame mirrored through a frozen player camera', async () => {
    const { app, world, renders, captured, tick } = await setup((target) => ({
      // World (500, 500) in the middle of the screen: off the map, so players see the background
      target: { screenWidth: SIZE, screenHeight: SIZE, position: target.position, scale: target.scale },
      camera: { centerX: 500, centerY: 500, scale: 1 },
    }));

    tick();
    expect(captured).toEqual([[0, 255, 0]]);
    expect(copiedPixel(app.canvas, 8, 8)).toEqual(DM_ONLY);
    expect([world.position.x, world.position.y]).toEqual([0, 0]);
    expect(hasPendingChanges(app.stage.renderGroup)).toBe(false);

    for (let i = 0; i < 5; i++) tick();
    expect(renders).toHaveBeenCalledTimes(2);

    requestRender(app);
    for (let i = 0; i < 5; i++) tick();
    expect(renders).toHaveBeenCalledTimes(4);
  });
});
