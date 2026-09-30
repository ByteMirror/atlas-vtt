import type { Texture } from 'pixi.js';
import { loadAsset, unloadAsset } from './utils/assetLifecycle';
import { isVideoSource, videoElementOf } from './utils/videoSource';

/** Idle backgrounds kept for quick scene switches, in addition to the ones on screen. */
const MAX_IDLE_ENTRIES = 3;
/** Decoded pixel budget for idle backgrounds. The most recently left one is always kept. */
const MAX_IDLE_BYTES = 256 * 1024 * 1024;
/** Mipmaps add a third to a texture's memory, so only smaller maps get them. */
const MIPMAP_SIZE_THRESHOLD = 2048;
const MAX_RECOMMENDED_TEXTURE_SIZE = 8192;

interface CacheEntry {
  texture: Promise<Texture>;
  refs: number;
  bytes: number;
  lastUsed: number;
}

function configureBackgroundTexture(texture: Texture): void {
  const { source } = texture;
  source.scaleMode = 'linear';
  // A video map is well under the threshold at 1080p, but its source re-uploads on every
  // decoded frame, so mipmapping it regenerates the whole chain 24-60 times a second.
  const isVideo = isVideoSource(source);
  source.autoGenerateMipmaps = !isVideo
    && texture.width <= MIPMAP_SIZE_THRESHOLD
    && texture.height <= MIPMAP_SIZE_THRESHOLD;
  // PIXI's VideoSource defaults to playing once. A battlemap is ambience, so it repeats;
  // the flag lives on the element, which the source neither copies from its options nor exposes.
  const video = videoElementOf(source);
  if (video) video.loop = true;
  source.update();
  if (texture.width > MAX_RECOMMENDED_TEXTURE_SIZE || texture.height > MAX_RECOMMENDED_TEXTURE_SIZE) {
    console.warn(`[BackgroundTextureCache] Texture size (${texture.width}x${texture.height}) exceeds the recommended maximum of ${MAX_RECOMMENDED_TEXTURE_SIZE}px. Consider resizing the map for better performance.`);
  }
}

function estimateBytes(texture: Texture): number {
  const { pixelWidth, pixelHeight, autoGenerateMipmaps } = texture.source;
  return pixelWidth * pixelHeight * 4 * (autoGenerateMipmaps ? 4 / 3 : 1);
}

/**
 * Reference-counted cache for map background textures, shared by every map view
 * because PIXI's `Assets` cache is global.
 *
 * Backgrounds that no view shows any more stay decoded in a small LRU, so switching
 * back to a recent scene skips decoding and only re-uploads to the GPU; PIXI's
 * texture GC already frees the GPU copy of an idle texture. Idle entries are kept
 * only while at least one background is in use, so closing the last map frees all.
 */
class BackgroundTextureCache {
  private readonly entries = new Map<string, CacheEntry>();

  /** Loads (or reuses) the texture for `url`. Every call must be paired with `release(url)`. */
  acquire(url: string): Promise<Texture> {
    const entry = this.entries.get(url) ?? this.load(url);
    entry.refs++;
    entry.lastUsed = performance.now();
    return entry.texture;
  }

  release(url: string): void {
    const entry = this.entries.get(url);
    if (!entry || entry.refs === 0) return;
    entry.refs--;
    entry.lastUsed = performance.now();
    if (entry.refs === 0) this.trim();
  }

  private evictAllIdle(): void {
    for (const [url, entry] of this.entries) {
      if (entry.refs === 0) this.evict(url);
    }
  }

  private load(url: string): CacheEntry {
    const entry: CacheEntry = { texture: loadAsset<Texture>(url), refs: 0, bytes: 0, lastUsed: 0 };
    entry.texture = entry.texture.then(
      (texture) => {
        configureBackgroundTexture(texture);
        entry.bytes = estimateBytes(texture);
        return texture;
      },
      (error: unknown) => {
        if (this.entries.get(url) === entry) this.entries.delete(url);
        throw error;
      },
    );
    this.entries.set(url, entry);
    return entry;
  }

  private trim(): void {
    const idle = [...this.entries].filter(([, entry]) => entry.refs === 0);
    if (idle.length === this.entries.size) {
      this.evictAllIdle();
      return;
    }

    idle.sort(([, a], [, b]) => b.lastUsed - a.lastUsed);
    let keptBytes = 0;
    idle.forEach(([url, entry], index) => {
      keptBytes += entry.bytes;
      const overBudget = index >= MAX_IDLE_ENTRIES || (index > 0 && keptBytes > MAX_IDLE_BYTES);
      if (overBudget) this.evict(url);
    });
  }

  private evict(url: string): void {
    this.entries.delete(url);
    void unloadAsset(url);
  }
}

export const backgroundTextureCache = new BackgroundTextureCache();
