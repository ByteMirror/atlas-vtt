import { beforeEach, describe, expect, it, vi } from 'vitest';

const assets = vi.hoisted(() => ({
  load: vi.fn(),
  unload: vi.fn(),
}));

vi.mock('pixi.js', () => ({ Assets: assets }));

interface FakeSource {
  pixelWidth: number;
  pixelHeight: number;
  autoGenerateMipmaps: boolean;
  scaleMode: string;
  update: () => void;
  uploadMethodId?: string;
  resource?: unknown;
}

interface FakeTexture {
  width: number;
  height: number;
  source: FakeSource;
}

function fakeTexture(size: number): FakeTexture {
  return {
    width: size,
    height: size,
    source: { pixelWidth: size, pixelHeight: size, autoGenerateMipmaps: false, scaleMode: 'nearest', update: vi.fn() },
  };
}

/** A background decoded from a video file, as PIXI's `VideoSource` presents it. */
function fakeVideoTexture(width: number, height: number): FakeTexture {
  const video = document.createElement('video');
  return {
    width,
    height,
    source: {
      pixelWidth: width,
      pixelHeight: height,
      autoGenerateMipmaps: false,
      scaleMode: 'nearest',
      update: vi.fn(),
      uploadMethodId: 'video',
      resource: video,
    },
  };
}

/** Side length whose decoded texture (no mipmaps) takes `mb` megabytes. */
function sideForMegabytes(mb: number): number {
  return Math.sqrt((mb * 1024 * 1024) / 4);
}

async function loadCache(): Promise<typeof import('../../src/app/pixi/backgroundTextureCache').backgroundTextureCache> {
  vi.resetModules();
  return (await import('../../src/app/pixi/backgroundTextureCache')).backgroundTextureCache;
}

describe('backgroundTextureCache', () => {
  beforeEach(() => {
    assets.load.mockReset().mockImplementation(async () => fakeTexture(1024));
    assets.unload.mockReset().mockResolvedValue(undefined);
  });

  it('decodes a background once and shares it between users', async () => {
    const cache = await loadCache();
    const first = await cache.acquire('a');
    const second = await cache.acquire('a');

    expect(first).toBe(second);
    expect(assets.load).toHaveBeenCalledTimes(1);
    expect(first.source.autoGenerateMipmaps).toBe(true);
    expect(first.source.scaleMode).toBe('linear');
  });

  it('never mipmaps an animated map, however small its frames', async () => {
    const cache = await loadCache();
    // Full HD is inside the mipmap threshold, so only the video check can keep them off
    assets.load.mockImplementation(async () => fakeVideoTexture(1920, 1080));

    const texture = await cache.acquire('animated.webm');

    expect(texture.source.autoGenerateMipmaps).toBe(false);
    expect(texture.source.scaleMode).toBe('linear');
  });

  it('recognises a video source by its element when the upload method is not set', async () => {
    const cache = await loadCache();
    assets.load.mockImplementation(async () => {
      const texture = fakeVideoTexture(1280, 720);
      delete texture.source.uploadMethodId;
      return texture;
    });

    const texture = await cache.acquire('animated.mp4');

    expect(texture.source.autoGenerateMipmaps).toBe(false);
  });

  it('loops an animated map, which PIXI would otherwise play once', async () => {
    const cache = await loadCache();
    assets.load.mockImplementation(async () => fakeVideoTexture(1920, 1080));

    const texture = await cache.acquire('animated.webm');

    expect((texture.source.resource as HTMLVideoElement).loop).toBe(true);
  });

  it('keeps a left map decoded while another map is open, so switching back skips decoding', async () => {
    const cache = await loadCache();
    await cache.acquire('a');
    await cache.acquire('b');
    cache.release('a');

    await cache.acquire('a');
    expect(assets.load).toHaveBeenCalledTimes(2);
    expect(assets.unload).not.toHaveBeenCalled();
  });

  it('unloads the least recently used idle maps beyond the entry limit', async () => {
    const cache = await loadCache();
    await cache.acquire('open');
    for (const url of ['a', 'b', 'c', 'd']) {
      await cache.acquire(url);
      cache.release(url);
    }

    expect(assets.unload).toHaveBeenCalledTimes(1);
    expect(assets.unload).toHaveBeenCalledWith('a');
  });

  it('unloads idle maps beyond the memory budget but always keeps the last one left', async () => {
    const cache = await loadCache();
    assets.load.mockImplementation(async () => fakeTexture(sideForMegabytes(200)));
    await cache.acquire('open');
    for (const url of ['a', 'b']) {
      await cache.acquire(url);
      cache.release(url);
    }

    expect(assets.unload).toHaveBeenCalledWith('a');
    expect(assets.unload).not.toHaveBeenCalledWith('b');
  });

  it('frees every background once no map is open', async () => {
    const cache = await loadCache();
    await cache.acquire('a');
    await cache.acquire('b');
    cache.release('a');
    cache.release('b');

    expect(assets.unload).toHaveBeenCalledWith('a');
    expect(assets.unload).toHaveBeenCalledWith('b');
  });

  it('waits for an unload to finish before loading the same background again', async () => {
    const cache = await loadCache();
    let finishUnload!: () => void;
    assets.unload.mockReturnValueOnce(new Promise<void>((resolve) => {
      finishUnload = resolve;
    }));
    await cache.acquire('a');
    cache.release('a');
    expect(assets.unload).toHaveBeenCalledWith('a');

    // The unload destroys the texture PIXI still caches, so a load must not reuse it
    const reloading = cache.acquire('a');
    await Promise.resolve();
    expect(assets.load).toHaveBeenCalledTimes(1);

    finishUnload();
    await reloading;
    expect(assets.load).toHaveBeenCalledTimes(2);
  });

  it('retries a background whose load failed', async () => {
    const cache = await loadCache();
    assets.load.mockRejectedValueOnce(new Error('decode failed'));

    await expect(cache.acquire('a')).rejects.toThrow('decode failed');
    await expect(cache.acquire('a')).resolves.toBeDefined();
    expect(assets.load).toHaveBeenCalledTimes(2);
  });
});
