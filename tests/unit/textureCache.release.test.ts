import { describe, expect, it } from 'vitest';
import { Texture } from 'pixi.js';
import type { App } from 'obsidian';
import { TextureCache } from '../../src/app/pixi/token-renderer/TextureCache';

function cacheWith(keys: string[]): { cache: TextureCache; textures: Map<string, Texture> } {
  const cache = new TextureCache({} as App);
  const textures = new Map(keys.map((key) => [key, new Texture()] as const));
  // Seeds the cache the way loaded token art is stored, without decoding images in jsdom
  const store = (cache as unknown as { textureCache: Map<string, Texture> }).textureCache;
  textures.forEach((texture, key) => store.set(key, texture));
  return { cache, textures };
}

describe('TextureCache.releaseUnusedImages', () => {
  it('destroys token art the loaded scene does not use and keeps the rest', () => {
    const { cache, textures } = cacheWith(['tokens/goblin.png', 'tokens/orc.png', 'default-token']);

    cache.releaseUnusedImages(['tokens/goblin.png', '']);

    expect(textures.get('tokens/goblin.png')?.destroyed).toBe(false);
    expect(textures.get('tokens/orc.png')?.destroyed).toBe(true);
    expect(textures.get('default-token')?.destroyed).toBe(false);
  });
});
