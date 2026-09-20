import { afterEach, describe, expect, test, vi } from 'vitest';
import { Application, Container, Graphics, Rectangle, Sprite, Texture } from 'pixi.js';
import { MapThumbnailService } from '../../src/app/services/MapThumbnailService';

afterEach(() => vi.restoreAllMocks());

function setup(width = 1200, height = 600) {
  const viewport = new Container();
  const background = new Sprite(Texture.WHITE);
  background.position.set(100, 200);
  background.width = width;
  background.height = height;
  viewport.addChild(background);
  const destroy = vi.fn();
  const source = document.createElement('canvas');
  source.width = 400;
  source.height = 300;
  const generateTexture = vi.fn((_options: { frame: Rectangle; resolution: number }) => ({ destroy }));
  const drawImage = vi.fn();
  vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue({ drawImage } as any);
  vi.spyOn(HTMLCanvasElement.prototype, 'toDataURL').mockReturnValue('data:image/jpeg;base64,AA==');
  const app = { renderer: { generateTexture, extract: { canvas: vi.fn(() => source) } } };
  const service = new MapThumbnailService({ vault: { getAbstractFileByPath: () => null } } as any);
  const capture = (mapBackground?: Container) => service.generateThumbnail(
    app as unknown as Application, viewport, 'scene.atlasmap', mapBackground,
  );
  const frame = () => generateTexture.mock.calls.at(-1)![0].frame as Rectangle;
  return { viewport, background, app, capture, frame, generateTexture, destroy, source, drawImage };
}

describe('scene thumbnail framing', () => {
  test('captures the same map region regardless of viewport pan and zoom', async () => {
    const { viewport, capture, frame } = setup();
    viewport.position.set(800, -300);
    viewport.scale.set(0.1);
    await capture();
    const firstFrame = frame().clone();
    viewport.position.set(-2400, 1300);
    viewport.scale.set(3);
    await capture();
    expect(frame()).toEqual(firstFrame);
    expect(viewport.position).toMatchObject({ x: -2400, y: 1300 });
    expect(viewport.scale).toMatchObject({ x: 3, y: 3 });
  });

  test.each([
    [1200, 600, new Rectangle(300, 200, 800, 600)],
    [600, 1200, new Rectangle(100, 575, 600, 450)],
    [800, 600, new Rectangle(100, 200, 800, 600)],
  ])('fills the thumbnail with a centered crop of a %s × %s map', async (width, height, expected) => {
    const { viewport, background, capture, frame } = setup(width, height);
    // Grids, fog and editor overlays can extend far beyond the actual map.
    viewport.addChild(new Graphics().rect(-10000, -10000, 20000, 20000).fill(0xffffff));
    await capture(background);
    expect(frame()).toEqual(expected);
  });

  test('keeps rendering bounded even for very large maps', async () => {
    const { background, capture, frame, generateTexture, destroy } = setup(100000, 100000);
    await capture(background);
    const resolution = generateTexture.mock.calls[0]![0].resolution;
    expect(frame().width * resolution).toBeLessThanOrEqual(400);
    expect(frame().height * resolution).toBeLessThanOrEqual(300);
    expect(destroy).toHaveBeenCalledWith(true);
  });

  test('fills the output canvas even if the extracted aspect ratio differs', async () => {
    const { capture, source, drawImage } = setup();
    source.width = 800;
    source.height = 300;
    await capture();
    expect(drawImage).toHaveBeenCalledWith(source, -200, 0, 800, 300);
  });

  test('skips empty scenes instead of overwriting a preview with a blank image', async () => {
    const { viewport, capture, generateTexture } = setup();
    viewport.removeChildren();
    expect(await capture()).toBeNull();
    expect(generateTexture).not.toHaveBeenCalled();
  });

  test('releases the render texture if extraction fails', async () => {
    const { app, viewport, capture, destroy } = setup();
    viewport.position.set(30, 80);
    viewport.scale.set(0.25);
    app.renderer.extract.canvas.mockImplementation(() => { throw new Error('Extraction failed'); });
    vi.spyOn(console, 'error').mockImplementation(() => {});
    expect(await capture()).toBeNull();
    expect(destroy).toHaveBeenCalledWith(true);
    expect(viewport.position).toMatchObject({ x: 30, y: 80 });
    expect(viewport.scale).toMatchObject({ x: 0.25, y: 0.25 });
  });
});
