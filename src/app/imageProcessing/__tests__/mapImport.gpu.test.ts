import { afterAll, describe, expect, it, vi } from 'vitest';
import { disposeImageProcessing, IMAGE_PRESETS, optimizeImage } from '../imageProcessing';
import type { Size } from '../imageLayout';

const MAP_SIDE = IMAGE_PRESETS.map.maxWidth;

/** The pixels of an encoded image, as the map loader decodes it. */
async function decoded(image: Blob): Promise<{ size: Size; luminanceAt: (x: number, y: number) => number }> {
  const bitmap = await createImageBitmap(image);
  const canvas = new OffscreenCanvas(bitmap.width, bitmap.height);
  const context = canvas.getContext('2d')!;
  context.drawImage(bitmap, 0, 0);
  bitmap.close();
  return {
    size: { width: canvas.width, height: canvas.height },
    luminanceAt: (x, y) => {
      const [r = 0, g = 0, b = 0] = context.getImageData(x, y, 1, 1).data;
      return 0.299 * r + 0.587 * g + 0.114 * b;
    },
  };
}

async function png(width: number, height: number): Promise<Blob> {
  const canvas = new OffscreenCanvas(width, height);
  const context = canvas.getContext('2d')!;
  context.fillStyle = '#e9dcc0';
  context.fillRect(0, 0, width, height);
  return canvas.convertToBlob({ type: 'image/png' });
}

describe('importing maps with the real workers', () => {
  afterAll(disposeImageProcessing);

  it('draws an SVG map at map size, whatever size its file states', async () => {
    // A line one twentieth of a unit wide: about a pixel at map size, a quarter of one at 2048 px.
    const svg = new Blob([
      '<svg xmlns="http://www.w3.org/2000/svg" width="400" height="200" viewBox="0 0 400 200">',
      '<rect width="400" height="200" fill="#fff"/><path d="M0 100h400" stroke="#000" stroke-width="0.05"/></svg>',
    ], { type: 'image/svg+xml' });

    const result = await optimizeImage(svg, IMAGE_PRESETS.map);
    const map = await decoded(result.image);

    expect(map.size).toEqual({ width: MAP_SIDE, height: MAP_SIDE / 2 });
    expect(result.scaledDown).toBeUndefined();
    const lineY = MAP_SIDE / 4;
    const darkest = Math.min(...[-1, 0, 1].map((dy) => map.luminanceAt(MAP_SIDE / 2, lineY + dy)));
    expect(darkest).toBeLessThan(140);
    expect(map.luminanceAt(MAP_SIDE / 2, lineY + 8)).toBeGreaterThan(240);
  });

  it('rasterizes vectors one at a time, each only once the one before is converted', async () => {
    const svg = (): Blob => new Blob(['<svg xmlns="http://www.w3.org/2000/svg" width="40" height="40"><rect width="40" height="40"/></svg>'], { type: 'image/svg+xml' });
    // Workers have their own OffscreenCanvas, so the spy counts the main thread's rasters only.
    const raster = vi.spyOn(OffscreenCanvas.prototype, 'transferToImageBitmap');
    const rastersWhenConverted: number[] = [];

    await Promise.all([0, 1, 2].map(async () => {
      await optimizeImage(svg(), IMAGE_PRESETS.token);
      rastersWhenConverted.push(raster.mock.calls.length);
    }));
    raster.mockRestore();

    expect(rastersWhenConverted).toEqual([1, 2, 3]);
  });

  it('reports the pixels a map above the limit lost', async () => {
    const result = await optimizeImage(await png(9000, 90), IMAGE_PRESETS.map);

    expect(result.scaledDown).toEqual({ from: { width: 9000, height: 90 }, to: { width: MAP_SIDE, height: 82 } });
    expect((await decoded(result.image)).size).toEqual({ width: MAP_SIDE, height: 82 });
  });

  it('reports nothing for a map within the limit', async () => {
    const result = await optimizeImage(await png(4000, 40), IMAGE_PRESETS.map);

    expect(result.scaledDown).toBeUndefined();
    expect((await decoded(result.image)).size).toEqual({ width: 4000, height: 40 });
  });
});
