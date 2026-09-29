import { App, TFile } from 'obsidian';
import { Application, Container, Rectangle, type Texture } from 'pixi.js';
import { mapThumbnailPath } from '../utils/dataFileMigration';
import { requestRender } from '../pixi/RenderScheduler';
import { trashHiddenPath } from '../utils/hiddenVaultFiles';

/** The bytes of a base64 data URL, such as the JPEG `renderThumbnail` returns. */
export function dataUrlToBytes(dataUrl: string): ArrayBuffer | null {
  const base64Data = dataUrl.split(',')[1];
  if (!base64Data) return null;
  const binaryData = atob(base64Data);
  const bytes = new Uint8Array(binaryData.length);
  for (let i = 0; i < binaryData.length; i++) {
    bytes[i] = binaryData.charCodeAt(i);
  }
  return bytes.buffer;
}

/** Pixel size of a rendered thumbnail. */
export interface ThumbnailSize {
  width: number;
  height: number;
}

/** Map cards in the asset manager and dashboard. */
const MAP_THUMBNAIL_SIZE: ThumbnailSize = { width: 400, height: 300 };
/** Scene snapshot cards: 16:9 and sharp enough for their larger preview. */
export const SNAPSHOT_THUMBNAIL_SIZE: ThumbnailSize = { width: 640, height: 360 };

/** Renders a map view into a thumbnail and stores it next to the scene's map file. */
export class MapThumbnailService {
  constructor(private readonly app: App) {}

  /**
   * Renders the map as it looks now into a JPEG data URL of `size` (400×300 by
   * default), framed on the map image. Returns null when there is nothing to frame.
   */
  renderThumbnail(pixiApp: Application, viewport: Container, background?: Container | null, size: ThumbnailSize = MAP_THUMBNAIL_SIZE): string | null {
    const contentBounds = this.calculateContentBounds(viewport, size, background);
    if (!contentBounds) return null;

    // Keep render texture bounded so large scenes do not spike memory.
    const renderResolution = Math.min(
      1,
      size.width / contentBounds.width,
      size.height / contentBounds.height
    );

    const renderTexture: Texture = pixiApp.renderer.generateTexture({
      target: viewport,
      frame: contentBounds,
      resolution: renderResolution,
    });
    // The off-screen render consumed pending stage updates; the canvas still needs them
    requestRender(pixiApp);
    try {
      const sourceCanvas = this.extractRenderCanvas(pixiApp, renderTexture, size);
      const thumbnailCanvas = this.fitIntoThumbnailCanvas(sourceCanvas, size);
      return thumbnailCanvas.toDataURL('image/jpeg', 0.8); // JPEG for smaller size
    } finally {
      renderTexture.destroy(true);
    }
  }

  private extractRenderCanvas(pixiApp: Application, renderTexture: Texture, size: ThumbnailSize): HTMLCanvasElement {
    if (pixiApp.renderer.extract && typeof pixiApp.renderer.extract.canvas === 'function') {
      return pixiApp.renderer.extract.canvas(renderTexture) as HTMLCanvasElement;
    }

    const canvas = createEl('canvas');
    const pixelData = pixiApp.renderer.extract?.pixels(renderTexture);
    if (!pixelData) {
      canvas.width = size.width;
      canvas.height = size.height;
      return canvas;
    }

    canvas.width = pixelData.width;
    canvas.height = pixelData.height;
    const ctx = canvas.getContext('2d');
    if (!ctx) return canvas;

    const imgData = ctx.createImageData(pixelData.width, pixelData.height);
    imgData.data.set(pixelData.pixels);
    ctx.putImageData(imgData, 0, 0);
    return canvas;
  }

  private fitIntoThumbnailCanvas(sourceCanvas: HTMLCanvasElement, size: ThumbnailSize): HTMLCanvasElement {
    const canvas = createEl('canvas');
    canvas.width = size.width;
    canvas.height = size.height;

    const ctx = canvas.getContext('2d');
    if (!ctx) return canvas;

    const sourceWidth = Math.max(1, sourceCanvas.width);
    const sourceHeight = Math.max(1, sourceCanvas.height);
    const scale = Math.max(
      size.width / sourceWidth,
      size.height / sourceHeight
    );
    const drawWidth = sourceWidth * scale;
    const drawHeight = sourceHeight * scale;
    const drawX = (size.width - drawWidth) / 2;
    const drawY = (size.height - drawHeight) / 2;

    ctx.drawImage(sourceCanvas, drawX, drawY, drawWidth, drawHeight);
    return canvas;
  }
  
  /**
   * Frame a centered cover crop in viewport-local coordinates. generateTexture
   * ignores the target's transform, so screen-space bounds include an unwanted
   * camera offset and zoom. Prefer the map image over grids and editor overlays.
   */
  private calculateContentBounds(viewport: Container, size: ThumbnailSize, background?: Container | null): Rectangle | null {
    let bounds = viewport.getLocalBounds();
    if (background?.parent === viewport) {
      background.updateLocalTransform();
      bounds = background.getLocalBounds().clone();
      bounds.applyMatrix(background.localTransform);
    }

    const { x, y, width, height } = bounds;
    if (![x, y, width, height].every(Number.isFinite) || width <= 0 || height <= 0) return null;

    const aspect = size.width / size.height;
    const cropWidth = Math.min(width, height * aspect);
    const cropHeight = Math.min(height, width / aspect);
    return new Rectangle(
      x + (width - cropWidth) / 2,
      y + (height - cropHeight) / 2,
      cropWidth,
      cropHeight
    );
  }
  
  /** Writes `bytes` as the thumbnail of the scene at `mapPath` and tells open asset lists. */
  async saveThumbnail(mapPath: string, bytes: ArrayBuffer): Promise<void> {
    if (!(this.app.vault.getAbstractFileByPath(mapPath) instanceof TFile)) return;
    const thumbnailPath = mapThumbnailPath(mapPath);
    const existing = this.app.vault.getAbstractFileByPath(thumbnailPath);
    const { adapter } = this.app.vault;
    // Thumbnails of scenes in a collection's maps folder live in the hidden data folder, which only the adapter sees.
    if (existing instanceof TFile) {
      await this.app.vault.modifyBinary(existing, bytes);
    } else if (await adapter.exists(thumbnailPath)) {
      await adapter.writeBinary(thumbnailPath, bytes);
    } else {
      const folder = thumbnailPath.substring(0, thumbnailPath.lastIndexOf('/'));
      if (!await adapter.exists(folder)) await adapter.mkdir(folder);
      await this.app.vault.createBinary(thumbnailPath, bytes);
    }
    this.app.workspace.trigger('atlas-vtt:scene-thumbnail-updated', mapPath);
  }

  /** Moves a deleted scene's thumbnail to the trash, so a later scene of the same name does not show it. */
  async trashThumbnail(mapPath: string): Promise<void> {
    const thumbnailPath = mapThumbnailPath(mapPath);
    const file = this.app.vault.getAbstractFileByPath(thumbnailPath);
    if (file instanceof TFile) await this.app.fileManager.trashFile(file);
    else await trashHiddenPath(this.app, thumbnailPath);
  }

  /** Whether the scene at `mapPath` has a thumbnail, wherever it is stored. */
  hasThumbnail(mapPath: string): Promise<boolean> {
    return this.app.vault.adapter.exists(mapThumbnailPath(mapPath));
  }
}
