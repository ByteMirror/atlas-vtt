import { BitmapText, Cache, Container, DynamicBitmapFont, TextStyle } from 'pixi.js';
import { cellNumberAnchor, cellNumberFontSize } from './cellNumbering';
import type { NumberedCell } from './cellNumbering';
import type { Point } from './hexGeometry';

/**
 * Glyph atlas sizes in device pixels. Labels read from the smallest atlas at
 * least as large as they appear on screen, so the GPU scales glyphs down by
 * less than 2x and plain linear filtering keeps them sharp.
 */
const RASTER_SIZES = [16, 32, 64, 128, 256] as const;
type RasterSize = (typeof RASTER_SIZES)[number];
/** Numbers smaller than this on screen (CSS pixels) are unreadable noise, so they hide until zoomed in. */
const MIN_SCREEN_FONT_SIZE = 7;

function fontName(size: RasterSize): string {
  return `atlas-cell-numbers-${size}`;
}

function rasterSizeFor(devicePixels: number): RasterSize {
  return RASTER_SIZES.find((size) => size >= devicePixels) ?? RASTER_SIZES[RASTER_SIZES.length - 1]!;
}

/**
 * A white digit atlas at one raster size, shared by every cell number. Labels
 * take the grid colour as a tint. Built like `BitmapFontManager.install`, but
 * without mipmaps: a mip level is picked for any downscale and blurs the digits.
 */
function ensureCellNumberFont(size: RasterSize): string {
  const name = fontName(size);
  const cacheKey = `${name}-bitmap`;
  if (Cache.has(cacheKey)) return name;
  const font = new DynamicBitmapFont({
    style: new TextStyle({ fontFamily: 'Arial, sans-serif', fontSize: size, fontWeight: 'bold', fill: 0xffffff }),
    overrideFill: false,
    overrideSize: false,
    mipmap: false,
    skipKerning: true,
    textureSize: Math.max(512, size * 4),
  });
  font.ensureCharacters('0123456789');
  Cache.set(cacheKey, font);
  font.once('destroy', () => Cache.remove(cacheKey));
  return name;
}

export interface CellNumberLabelStyle {
  color: number;
  opacity: number;
}

/** How the viewport shows the grid: its zoom and the renderer's device pixel ratio. */
export interface CellNumberView {
  zoom: number;
  pixelRatio: number;
}

/** The numbers of a grid, laid out in the grid container's local space. */
export class CellNumberLabels {
  readonly container: Container;
  private readonly labels: BitmapText[] = [];
  private readonly fontSize: number;
  private rasterSize: RasterSize;

  constructor(
    cells: readonly NumberedCell[],
    size: number,
    localOrigin: Point,
    style: CellNumberLabelStyle,
    view: CellNumberView,
  ) {
    this.fontSize = cellNumberFontSize(size);
    this.container = new Container({ label: 'cell-numbers', eventMode: 'none', interactiveChildren: false });
    this.container.alpha = style.opacity;
    this.container.visible = this.isReadable(view.zoom);
    this.rasterSize = rasterSizeFor(this.fontSize * view.zoom * view.pixelRatio);
    const fontFamily = ensureCellNumberFont(this.rasterSize);

    for (const cell of cells) {
      const anchor = cellNumberAnchor(size, cell.center);
      const label = new BitmapText({ text: cell.label, style: { fontFamily, fontSize: this.fontSize } });
      label.anchor.set(0.5);
      label.position.set(anchor.x - localOrigin.x, anchor.y - localOrigin.y);
      label.tint = style.color;
      this.labels.push(label);
      this.container.addChild(label);
    }
  }

  setOpacity(opacity: number): void {
    this.container.alpha = opacity;
  }

  private isReadable(zoom: number): boolean {
    return this.fontSize * zoom >= MIN_SCREEN_FONT_SIZE;
  }

  /** Picks the glyph atlas for the numbers' size on screen and hides them while too small to read. */
  setView({ zoom, pixelRatio }: CellNumberView): void {
    const readable = this.isReadable(zoom);
    if (this.container.visible !== readable) this.container.visible = readable;
    if (!readable) return;

    const rasterSize = rasterSizeFor(this.fontSize * zoom * pixelRatio);
    if (rasterSize === this.rasterSize) return;
    this.rasterSize = rasterSize;
    const fontFamily = ensureCellNumberFont(rasterSize);
    for (const label of this.labels) label.style.fontFamily = fontFamily;
  }
}
