/**
 * Canvas 2D side of the cloud fog modifier: the cloud-textured fog baked once
 * per finished edit, the soft puff that parts over a reveal, and the coarse
 * fog masks a reveal is measured with.
 */
import type { FogBounds, FogOperation } from '../../types/fogTypes';
import { FogCanvasCompositor } from './FogCanvasCompositor';
import type { FogMask } from './fogReveal';

/** Clouds are soft, so a quarter of world resolution is plenty and keeps the texture small. */
export const CLOUD_SCALE = 0.25;
/** Soft fog edge, in canvas pixels at `CLOUD_SCALE` (12 world pixels). */
const EDGE_BLUR_PX = 3;
const TILE_SIZE = 256;
const TILE_PUFFS = 140;
const PUFF_TEXTURE_SIZE = 128;

const cloudTiles = new Map<string, HTMLCanvasElement>();

/** `color` mixed towards white (`amount` > 0) or black (`amount` < 0), as 0xRRGGBB. */
function shade(color: string, amount: number): number {
  const value = parseInt(color.slice(1), 16);
  const target = amount > 0 ? 255 : 0;
  const mix = (channel: number): number => Math.round(channel + (target - channel) * Math.abs(amount));
  return (mix(value >> 16) << 16) | (mix((value >> 8) & 0xff) << 8) | mix(value & 0xff);
}

const toCss = (color: number): string => `#${color.toString(16).padStart(6, '0')}`;

/** The lighter and darker tones clouds of `color` are drawn with; reveal puffs use the same. */
export function cloudTones(color: string): number[] {
  return [shade(color, 0.12), shade(color, 0.24), shade(color, -0.35)];
}

/** A radial gradient from opaque white to clear, tinted per use. */
export function createPuffCanvas(): HTMLCanvasElement {
  const canvas = createEl('canvas');
  canvas.width = canvas.height = PUFF_TEXTURE_SIZE;
  const ctx = canvas.getContext('2d');
  if (!ctx) return canvas;
  const middle = PUFF_TEXTURE_SIZE / 2;
  const gradient = ctx.createRadialGradient(middle, middle, 0, middle, middle, middle);
  gradient.addColorStop(0, 'rgba(255, 255, 255, 1)');
  gradient.addColorStop(0.45, 'rgba(255, 255, 255, 0.7)');
  gradient.addColorStop(1, 'rgba(255, 255, 255, 0)');
  ctx.fillStyle = gradient;
  ctx.fillRect(0, 0, PUFF_TEXTURE_SIZE, PUFF_TEXTURE_SIZE);
  return canvas;
}

/** An opaque, seamlessly repeating cloud tile of `color`; built once per colour and shared by every scene. */
function getCloudTile(color: string): HTMLCanvasElement | null {
  const cached = cloudTiles.get(color);
  if (cached) return cached;
  const tile = createEl('canvas');
  tile.width = tile.height = TILE_SIZE;
  const ctx = tile.getContext('2d');
  if (!ctx) return null;
  ctx.fillStyle = color;
  ctx.fillRect(0, 0, TILE_SIZE, TILE_SIZE);
  const tones = cloudTones(color).map(toCss);
  const puff = createPuffCanvas();
  let seed = 7;
  const random = (): number => (seed = (seed * 16807) % 2147483647) / 2147483647;
  for (let i = 0; i < TILE_PUFFS; i++) {
    const radius = 4 + random() * 14;
    const x = random() * TILE_SIZE;
    const y = random() * TILE_SIZE;
    const tone = tones[Math.floor(random() * tones.length)] ?? color;
    const tinted = tintedPuff(puff, tone);
    ctx.globalAlpha = 0.16 + random() * 0.3;
    // Drawn with its wrapped copies, so the tile repeats without seams
    for (const ox of [-TILE_SIZE, 0, TILE_SIZE]) {
      for (const oy of [-TILE_SIZE, 0, TILE_SIZE]) {
        ctx.drawImage(tinted, x + ox - radius, y + oy - radius, radius * 2, radius * 2);
      }
    }
  }
  ctx.globalAlpha = 1;
  cloudTiles.set(color, tile);
  return tile;
}

const tintCache = new Map<string, HTMLCanvasElement>();
function tintedPuff(puff: HTMLCanvasElement, tone: string): HTMLCanvasElement {
  const cached = tintCache.get(tone);
  if (cached) return cached;
  const canvas = createEl('canvas');
  canvas.width = puff.width;
  canvas.height = puff.height;
  const ctx = canvas.getContext('2d');
  if (ctx) {
    ctx.drawImage(puff, 0, 0);
    ctx.globalCompositeOperation = 'source-in';
    ctx.fillStyle = tone;
    ctx.fillRect(0, 0, canvas.width, canvas.height);
  }
  tintCache.set(tone, canvas);
  return canvas;
}

/**
 * The fog of `ops` over `bounds` as clouds of `color` with soft edges, at `CLOUD_SCALE`.
 * Returns null where there is no Canvas 2D (tests).
 */
export function bakeCloudFog(ops: FogOperation[], bounds: FogBounds, color: string): HTMLCanvasElement | null {
  const tile = getCloudTile(color);
  if (!tile) return null;
  const mask = new FogCanvasCompositor(bounds, CLOUD_SCALE);
  try {
    mask.compositeAll(ops);
    const canvas = createEl('canvas');
    canvas.width = mask.getCanvas().width;
    canvas.height = mask.getCanvas().height;
    const ctx = canvas.getContext('2d');
    if (!ctx) return null;
    ctx.filter = `blur(${EDGE_BLUR_PX}px)`;
    ctx.drawImage(mask.getCanvas(), 0, 0);
    ctx.filter = 'none';
    // The texture stays anchored to the map when the fog bounds change
    const pattern = ctx.createPattern(tile, 'repeat');
    pattern?.setTransform(new DOMMatrix().translate(-bounds.x * CLOUD_SCALE, -bounds.y * CLOUD_SCALE));
    ctx.globalCompositeOperation = 'source-in';
    ctx.fillStyle = pattern ?? color;
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    return canvas;
  } finally {
    mask.destroy();
  }
}

/** The clouds both `a` and `b` show (same size and bounds): what stays put while one turns into the other. */
export function intersectClouds(a: HTMLCanvasElement, b: HTMLCanvasElement): HTMLCanvasElement {
  const canvas = createEl('canvas');
  canvas.width = a.width;
  canvas.height = a.height;
  const ctx = canvas.getContext('2d');
  if (!ctx) return canvas;
  ctx.drawImage(a, 0, 0);
  ctx.globalCompositeOperation = 'destination-in';
  ctx.drawImage(b, 0, 0);
  return canvas;
}

/** `ops` sampled once per `cellSize` world pixels, for measuring what an edit revealed. */
export function sampleFogMask(ops: FogOperation[], bounds: FogBounds, cellSize: number): FogMask | null {
  let mask: FogCanvasCompositor;
  try {
    mask = new FogCanvasCompositor(bounds, 1 / cellSize);
  } catch {
    return null;
  }
  try {
    mask.compositeAll(ops);
    const canvas = mask.getCanvas();
    const pixels = canvas.getContext('2d')?.getImageData(0, 0, canvas.width, canvas.height).data;
    if (!pixels) return null;
    const alpha = new Uint8Array(canvas.width * canvas.height);
    for (let i = 0; i < alpha.length; i++) alpha[i] = pixels[i * 4 + 3] ?? 0;
    return { alpha, columns: canvas.width, rows: canvas.height };
  } finally {
    mask.destroy();
  }
}
