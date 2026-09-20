/**
 * Texture Cache Manager
 * 
 * Handles texture loading, caching, and generation for tokens.
 */

import { Texture, Graphics, Assets, CanvasSource, ImageSource } from 'pixi.js';
import { App as ObsidianApp, TFile } from 'obsidian';
import type { ITextureCache } from './types';
import type { Application } from 'pixi.js';
import { normalizeImagePath } from '../../utils/pathUtils';

/**
 * Longest edge of a token texture. Tokens render at roughly one grid cell, so
 * detail beyond this is never visible and only costs GPU memory and upload time.
 */
const MAX_TOKEN_TEXTURE_SIZE = 1024;

function fitWithin(width: number, height: number, max: number): { width: number; height: number } {
  const scale = Math.min(1, max / Math.max(width, height));
  return { width: Math.max(1, Math.round(width * scale)), height: Math.max(1, Math.round(height * scale)) };
}

/**
 * Decode an image off the main thread and downscale it to the token budget.
 * Falls back to an <img> + canvas decode for formats createImageBitmap cannot
 * handle (notably SVG in Chromium).
 */
async function decodeTokenImage(buffer: ArrayBuffer, mimeType: string): Promise<ImageBitmap | HTMLCanvasElement> {
  const blob = new Blob([buffer], { type: mimeType });
  if (mimeType !== 'image/svg+xml') {
    try {
      const full = await createImageBitmap(blob);
      const target = fitWithin(full.width, full.height, MAX_TOKEN_TEXTURE_SIZE);
      if (target.width === full.width && target.height === full.height) return full;
      const scaled = await createImageBitmap(full, {
        resizeWidth: target.width,
        resizeHeight: target.height,
        resizeQuality: 'high',
      });
      full.close();
      return scaled;
    } catch {
      // Fall through to the <img> path
    }
  }
  const url = URL.createObjectURL(blob);
  try {
    const img = new Image();
    img.src = url;
    await img.decode();
    const target = fitWithin(img.naturalWidth || 512, img.naturalHeight || 512, MAX_TOKEN_TEXTURE_SIZE);
    const canvas = document.createElement('canvas');
    canvas.width = target.width;
    canvas.height = target.height;
    canvas.getContext('2d')!.drawImage(img, 0, 0, target.width, target.height);
    return canvas;
  } finally {
    URL.revokeObjectURL(url);
  }
}

// MIME type mapping
const MIME_MAP: Record<string, string> = {
  'png': 'image/png',
  'jpg': 'image/jpeg',
  'jpeg': 'image/jpeg',
  'gif': 'image/gif',
  'webp': 'image/webp',
  'svg': 'image/svg+xml',
  'bmp': 'image/bmp',
  'ico': 'image/x-icon',
  'tiff': 'image/tiff',
  'tif': 'image/tiff',
};

export class TextureCache implements ITextureCache {
  private textureCache: Map<string, Texture> = new Map();
  private ringTextureCache: Map<string, Texture> = new Map();
  private gradientTextureCache: Map<string, Texture> = new Map();
  // Textures loaded through Assets are owned by its cache and must be unloaded by URL
  private assetUrlByKey: Map<string, string> = new Map();
  // Decoded bitmaps backing vault-loaded textures, closed on eviction
  private bitmapByKey: Map<string, ImageBitmap> = new Map();
  private obsApp: ObsidianApp;
  private pixiApp: Application | null = null;

  constructor(obsApp: ObsidianApp, pixiApp?: Application) {
    this.obsApp = obsApp;
    this.pixiApp = pixiApp || null;
  }

  setPixiApp(app: Application): void {
    this.pixiApp = app;
  }

  /**
   * Load a texture for a token character object
   * This is a compatibility method that extracts the image path and calls getTexture
   */
  async loadTokenTexture(character: any): Promise<Texture> {
    const imagePath = character?.imagePath || '';
    return this.getTexture(imagePath);
  }

  async getTexture(imagePath: string): Promise<Texture> {
    if (!imagePath) {
      return this.getDefaultTokenTexture();
    }

    // Normalize the path
    const normalizedPath = normalizeImagePath(imagePath);

    // Check cache first
    if (this.textureCache.has(normalizedPath)) {
      return this.textureCache.get(normalizedPath)!;
    }

    try {
      if (
        normalizedPath.startsWith('data:') ||
        normalizedPath.startsWith('blob:') ||
        normalizedPath.startsWith('http://') ||
        normalizedPath.startsWith('https://') ||
        normalizedPath.startsWith('app://')
      ) {
        const texture = await Assets.load({
          src: normalizedPath,
          loadParser: 'loadTextures',
          data: {
            autoGenerateMipmaps: true,
            scaleMode: 'linear',
          }
        });
        this.assetUrlByKey.set(normalizedPath, normalizedPath);
        this.textureCache.set(normalizedPath, texture);
        return texture;
      }

      // Try to load from Obsidian vault
      const file = this.obsApp.vault.getAbstractFileByPath(normalizedPath);
      
      if (!(file instanceof TFile)) {
        console.error(`File not found: ${normalizedPath}`);
        return this.getDefaultTokenTexture();
      }

      const arrayBuffer = await this.obsApp.vault.readBinary(file);
      const mimeType = MIME_MAP[file.extension.toLowerCase()] || 'image/png';
      const decoded = await decodeTokenImage(arrayBuffer, mimeType);

      // A concurrent call may have finished first; keep the existing texture.
      const existing = this.textureCache.get(normalizedPath);
      if (existing) {
        if (decoded instanceof ImageBitmap) decoded.close();
        return existing;
      }

      const sourceOptions = { autoGenerateMipmaps: true, scaleMode: 'linear' as const, label: normalizedPath };
      const source = decoded instanceof ImageBitmap
        ? new ImageSource({ resource: decoded, ...sourceOptions })
        : new CanvasSource({ resource: decoded, ...sourceOptions });
      const texture = new Texture({ source, label: normalizedPath });

      if (decoded instanceof ImageBitmap) this.bitmapByKey.set(normalizedPath, decoded);
      this.textureCache.set(normalizedPath, texture);
      return texture;
    } catch (error) {
      console.error(`Failed to load texture: ${normalizedPath}`, error);
      return this.getDefaultTokenTexture();
    }
  }

  getRingTexture(size: number, color: string, strokeWidth: number): Texture {
    const cacheKey = `${size}-${strokeWidth}-${color}`;
    
    if (this.ringTextureCache.has(cacheKey)) {
      return this.ringTextureCache.get(cacheKey)!;
    }

    if (!this.pixiApp?.renderer) {
      console.warn('[TextureCache] PIXI app not initialized for ring texture, returning empty texture');
      return Texture.EMPTY;
    }

    // Create ring graphics
    const graphics = new Graphics();
    const radius = size / 2;
    
    // Draw circle at center of the texture bounds, not at 0,0
    graphics.circle(radius, radius, radius);
    // Convert color string to number for PIXI
    const colorNum = parseInt(color.replace('#', ''), 16);
    graphics.stroke({
      width: strokeWidth,
      color: colorNum,
    });

    // Generate texture - PIXI v8 syntax
    
    const texture = this.pixiApp.renderer.generateTexture(graphics);
    

    // Clean up graphics
    graphics.destroy();

    // Cache and return
    this.ringTextureCache.set(cacheKey, texture);
    return texture;
  }

  getGradientTexture(width: number, height: number, innerColor: string, outerColor: string): Texture;
  getGradientTexture(width: number, height: number, colorStops: Array<{ offset: number; color: string }>): Texture;
  getGradientTexture(
    width: number, 
    height: number, 
    innerColorOrStops: string | Array<{ offset: number; color: string }>, 
    outerColor?: string
  ): Texture {
    // Create cache key
    const cacheKey = typeof innerColorOrStops === 'string' 
      ? `${width}x${height}-${innerColorOrStops}-${outerColor}`
      : `${width}x${height}-${JSON.stringify(innerColorOrStops)}`;
    
    if (this.gradientTextureCache.has(cacheKey)) {
      return this.gradientTextureCache.get(cacheKey)!;
    }

    // Create gradient using Canvas API
    const canvas = document.createElement('canvas');
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext('2d')!;

    // Create radial gradient
    const centerX = width / 2;
    const centerY = height / 2;
    const radius = Math.min(width, height) / 2;
    
    const gradient = ctx.createRadialGradient(
      centerX, centerY, 0,
      centerX, centerY, radius
    );
    
    // Add color stops
    if (typeof innerColorOrStops === 'string' && outerColor) {
      // Simple two-color gradient
      gradient.addColorStop(0, innerColorOrStops);
      gradient.addColorStop(1, outerColor);
    } else if (Array.isArray(innerColorOrStops)) {
      // Multiple color stops
      innerColorOrStops.forEach(stop => {
        gradient.addColorStop(stop.offset, stop.color);
      });
    }
    
    ctx.fillStyle = gradient;
    ctx.fillRect(0, 0, width, height);

    // Create texture from canvas with mipmaps for smooth scaling
    const gradientSource = new CanvasSource({ resource: canvas, autoGenerateMipmaps: true, scaleMode: 'linear' });
    const texture = new Texture({ source: gradientSource });
    
    // Cache and return
    this.gradientTextureCache.set(cacheKey, texture);
    return texture;
  }


  /**
   * Move a cached texture from one path key to another without reloading.
   * Used when a token image file is renamed/moved in the vault.
   */
  rekeyTexture(oldPath: string, newPath: string): void {
    const oldKey = normalizeImagePath(oldPath);
    const newKey = normalizeImagePath(newPath);
    const texture = this.textureCache.get(oldKey);
    if (texture) {
      this.textureCache.delete(oldKey);
      this.textureCache.set(newKey, texture);
    }
    const bitmap = this.bitmapByKey.get(oldKey);
    if (bitmap) {
      this.bitmapByKey.delete(oldKey);
      this.bitmapByKey.set(newKey, bitmap);
    }
    const url = this.assetUrlByKey.get(oldKey);
    if (url) {
      this.assetUrlByKey.delete(oldKey);
      this.assetUrlByKey.set(newKey, url);
    }
  }

  /**
   * Evict a texture and release its GPU memory. Callers are responsible for
   * checking that no sprite still uses the image.
   */
  clearTexture(key: string): void {
    this.releaseImageTexture(normalizeImagePath(key));
    
    if (this.ringTextureCache.has(key)) {
      const texture = this.ringTextureCache.get(key);
      texture?.destroy();
      this.ringTextureCache.delete(key);
    }
    
    if (this.gradientTextureCache.has(key)) {
      const texture = this.gradientTextureCache.get(key);
      texture?.destroy();
      this.gradientTextureCache.delete(key);
    }
  }

  destroyAll(): void {
    for (const key of Array.from(this.textureCache.keys())) {
      this.releaseImageTexture(key);
    }
    this.ringTextureCache.forEach(texture => texture.destroy(true));
    this.gradientTextureCache.forEach(texture => texture.destroy(true));
    this.ringTextureCache.clear();
    this.gradientTextureCache.clear();
  }

  private releaseImageTexture(key: string): void {
    const texture = this.textureCache.get(key);
    if (!texture) return;
    this.textureCache.delete(key);

    const assetUrl = this.assetUrlByKey.get(key);
    if (assetUrl) {
      this.assetUrlByKey.delete(key);
      // Assets owns this texture; unloading destroys it and its source.
      Assets.unload(assetUrl).catch(() => undefined);
      return;
    }

    texture.destroy(true);
    const bitmap = this.bitmapByKey.get(key);
    if (bitmap) {
      bitmap.close();
      this.bitmapByKey.delete(key);
    }
  }

  // Private helper methods

  private getDefaultTokenTexture(): Texture {
    const cacheKey = 'default-token';
    
    if (this.textureCache.has(cacheKey)) {
      return this.textureCache.get(cacheKey)!;
    }

    if (!this.pixiApp?.renderer) {
      // Return empty texture if no renderer available
      return Texture.EMPTY;
    }

    // Create a simple colored circle as default token
    const graphics = new Graphics();
    const size = 100;
    const radius = size / 2;
    
    // Draw circle with gradient-like effect
    graphics.circle(radius, radius, radius);
    graphics.fill({
      color: 0x8B6F47, // Dark walnut brown
      alpha: 1,
    });
    
    // Add inner highlight
    graphics.circle(radius, radius, radius * 0.8);
    graphics.fill({
      color: 0xA0826D, // Lighter brown
      alpha: 0.5,
    });

    // Generate texture - PIXI v8 syntax
    const texture = this.pixiApp.renderer.generateTexture(graphics);

    // Clean up graphics
    graphics.destroy();

    // Cache and return
    this.textureCache.set(cacheKey, texture);
    return texture;
  }
}
