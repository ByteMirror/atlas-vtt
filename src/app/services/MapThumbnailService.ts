import { App, TFile } from 'obsidian';
import { Application, Container, Rectangle, type Texture } from 'pixi.js';
import { getDataFilePath } from '../utils/dataFileMigration';
import { requestRender } from '../pixi/RenderScheduler';

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

export class MapThumbnailService {
  private app: App;
  private thumbnailCache: Map<string, string> = new Map(); // Map path -> data URL
  private static readonly THUMBNAIL_WIDTH = 400;
  private static readonly THUMBNAIL_HEIGHT = 300;
  private static readonly MAX_CACHE_ENTRIES = 8;
  
  constructor(app: App) {
    this.app = app;
  }
  
  /**
   * Generates a thumbnail for the current map state
   * @param pixiApp The PIXI application instance
   * @param viewport The viewport container
   * @param mapPath The path to the map file
   * @param background The map image sprite, used to exclude outlying overlays from framing
   * @returns Data URL of the thumbnail image
   */
  async generateThumbnail(
    pixiApp: Application,
    viewport: Container,
    mapPath: string,
    background?: Container | null
  ): Promise<string | null> {
    try {
      const dataUrl = this.renderThumbnail(pixiApp, viewport, background);
      if (!dataUrl) return null;

      this.rememberThumbnail(mapPath, dataUrl);
      await this.saveThumbnailToVault(mapPath, dataUrl);
      return dataUrl;
    } catch (error) {
      console.error('[MapThumbnailService] Error generating thumbnail:', error);
      return null;
    }
  }

  /**
   * Renders the map as it looks now into a 400×300 JPEG data URL, framed on
   * the map image. Returns null when there is nothing to frame.
   */
  renderThumbnail(pixiApp: Application, viewport: Container, background?: Container | null): string | null {
    const contentBounds = this.calculateContentBounds(viewport, background);
    if (!contentBounds) return null;

    // Keep render texture bounded so large scenes do not spike memory.
    const renderResolution = Math.min(
      1,
      MapThumbnailService.THUMBNAIL_WIDTH / contentBounds.width,
      MapThumbnailService.THUMBNAIL_HEIGHT / contentBounds.height
    );

    const renderTexture: Texture = pixiApp.renderer.generateTexture({
      target: viewport,
      frame: contentBounds,
      resolution: renderResolution,
    });
    // The off-screen render consumed pending stage updates; the canvas still needs them
    requestRender(pixiApp);
    try {
      const sourceCanvas = this.extractRenderCanvas(pixiApp, renderTexture);
      const thumbnailCanvas = this.fitIntoThumbnailCanvas(sourceCanvas);
      return thumbnailCanvas.toDataURL('image/jpeg', 0.8); // JPEG for smaller size
    } finally {
      renderTexture.destroy(true);
    }
  }

  private extractRenderCanvas(pixiApp: Application, renderTexture: Texture): HTMLCanvasElement {
    if (pixiApp.renderer.extract && typeof pixiApp.renderer.extract.canvas === 'function') {
      return pixiApp.renderer.extract.canvas(renderTexture) as HTMLCanvasElement;
    }

    const canvas = createEl('canvas');
    const pixelData = pixiApp.renderer.extract?.pixels(renderTexture);
    if (!pixelData) {
      canvas.width = MapThumbnailService.THUMBNAIL_WIDTH;
      canvas.height = MapThumbnailService.THUMBNAIL_HEIGHT;
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

  private fitIntoThumbnailCanvas(sourceCanvas: HTMLCanvasElement): HTMLCanvasElement {
    const canvas = createEl('canvas');
    canvas.width = MapThumbnailService.THUMBNAIL_WIDTH;
    canvas.height = MapThumbnailService.THUMBNAIL_HEIGHT;

    const ctx = canvas.getContext('2d');
    if (!ctx) return canvas;

    const sourceWidth = Math.max(1, sourceCanvas.width);
    const sourceHeight = Math.max(1, sourceCanvas.height);
    const scale = Math.max(
      MapThumbnailService.THUMBNAIL_WIDTH / sourceWidth,
      MapThumbnailService.THUMBNAIL_HEIGHT / sourceHeight
    );
    const drawWidth = sourceWidth * scale;
    const drawHeight = sourceHeight * scale;
    const drawX = (MapThumbnailService.THUMBNAIL_WIDTH - drawWidth) / 2;
    const drawY = (MapThumbnailService.THUMBNAIL_HEIGHT - drawHeight) / 2;

    ctx.drawImage(sourceCanvas, drawX, drawY, drawWidth, drawHeight);
    return canvas;
  }
  
  /**
   * Frame a centered cover crop in viewport-local coordinates. generateTexture
   * ignores the target's transform, so screen-space bounds include an unwanted
   * camera offset and zoom. Prefer the map image over grids and editor overlays.
   */
  private calculateContentBounds(viewport: Container, background?: Container | null): Rectangle | null {
    let bounds = viewport.getLocalBounds();
    if (background?.parent === viewport) {
      background.updateLocalTransform();
      bounds = background.getLocalBounds().clone();
      bounds.applyMatrix(background.localTransform);
    }

    const { x, y, width, height } = bounds;
    if (![x, y, width, height].every(Number.isFinite) || width <= 0 || height <= 0) return null;

    const aspect = MapThumbnailService.THUMBNAIL_WIDTH / MapThumbnailService.THUMBNAIL_HEIGHT;
    const cropWidth = Math.min(width, height * aspect);
    const cropHeight = Math.min(height, width / aspect);
    return new Rectangle(
      x + (width - cropWidth) / 2,
      y + (height - cropHeight) / 2,
      cropWidth,
      cropHeight
    );
  }
  
  /**
   * Save thumbnail to vault as a file
   */
  private async saveThumbnailToVault(mapPath: string, dataUrl: string): Promise<void> {
    try {
      const bytes = dataUrlToBytes(dataUrl);
      if (!bytes) return;

      // Create thumbnail path (same directory as map, with .thumb.jpg extension)
      const mapFile = this.app.vault.getAbstractFileByPath(mapPath);
      if (!mapFile || !(mapFile instanceof TFile)) return;
      
      const thumbnailPath = getDataFilePath(mapPath.replace('.atlasmap', '.thumb.jpg'));
      
      // Ensure directory exists for the thumbnail
      const dir = thumbnailPath.substring(0, thumbnailPath.lastIndexOf('/'));
      if (!await this.app.vault.adapter.exists(dir)) {
        await this.app.vault.adapter.mkdir(dir);
      }
      
      // Save thumbnail file
      const existingThumb = this.app.vault.getAbstractFileByPath(thumbnailPath);
      if (existingThumb instanceof TFile) {
        await this.app.vault.modifyBinary(existingThumb, bytes);
      } else {
        await this.app.vault.createBinary(thumbnailPath, bytes);
      }
      
    } catch (error) {
      console.error('[MapThumbnailService] Error saving thumbnail:', error);
    }
  }
  
  /**
   * Get thumbnail for a map file
   */
  async getThumbnail(mapPath: string): Promise<string | null> {
    // Check cache first
    if (this.thumbnailCache.has(mapPath)) {
      const cached = this.thumbnailCache.get(mapPath)!;
      this.rememberThumbnail(mapPath, cached);
      return cached;
    }
    
    // Try to load from vault - new location first
    const thumbnailPath = getDataFilePath(mapPath.replace('.atlasmap', '.thumb.jpg'));
    let thumbFile = this.app.vault.getAbstractFileByPath(thumbnailPath);
    
    // If not found in new location, try old location
    if (!thumbFile) {
      const oldThumbnailPath = mapPath.replace('.atlasmap', '.thumb.jpg');
      thumbFile = this.app.vault.getAbstractFileByPath(oldThumbnailPath);
      
      if (thumbFile instanceof TFile) {
        // Migrate to new location
        try {
          const data = await this.app.vault.readBinary(thumbFile);
          
          // Ensure new directory exists
          const dir = thumbnailPath.substring(0, thumbnailPath.lastIndexOf('/'));
          if (!await this.app.vault.adapter.exists(dir)) {
            await this.app.vault.adapter.mkdir(dir);
          }
          
          // Create in new location
          await this.app.vault.createBinary(thumbnailPath, data);
          
          await this.app.fileManager.trashFile(thumbFile);
          // Update thumbFile reference
          thumbFile = this.app.vault.getAbstractFileByPath(thumbnailPath);
        } catch (migrationError) {
          console.error('[MapThumbnailService] Failed to migrate thumbnail:', migrationError);
        }
      }
    }
    
    if (thumbFile instanceof TFile) {
      try {
        const data = await this.app.vault.readBinary(thumbFile);
        const blob = new Blob([data], { type: 'image/jpeg' });
        const dataUrl = await new Promise<string>((resolve) => {
          const reader = new FileReader();
          reader.onloadend = () => resolve(reader.result as string);
          reader.readAsDataURL(blob);
        });
        
        // Cache it
        this.rememberThumbnail(mapPath, dataUrl);
        return dataUrl;
      } catch (error) {
        console.error('[MapThumbnailService] Error loading thumbnail:', error);
      }
    }
    
    return null;
  }
  
  /**
   * Clear thumbnail cache for a specific map or all maps
   */
  clearCache(mapPath?: string): void {
    if (mapPath) {
      this.thumbnailCache.delete(mapPath);
    } else {
      this.thumbnailCache.clear();
    }
  }

  private rememberThumbnail(mapPath: string, dataUrl: string): void {
    if (this.thumbnailCache.has(mapPath)) {
      this.thumbnailCache.delete(mapPath);
    }

    this.thumbnailCache.set(mapPath, dataUrl);

    while (this.thumbnailCache.size > MapThumbnailService.MAX_CACHE_ENTRIES) {
      const oldestKey = this.thumbnailCache.keys().next().value;
      if (!oldestKey) {
        break;
      }

      this.thumbnailCache.delete(oldestKey);
    }
  }
}
