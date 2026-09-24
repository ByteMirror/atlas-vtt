import { App, FileSystemAdapter, Menu, TFile, Notice, type EventRef } from 'obsidian';
import { openContextMenuGlobal, type ContextMenuEntry } from '../react/root/ContextMenuContext';
import { PlayerWindowService } from './PlayerWindowService';
import { playImageEnter, playImageExit } from './imageDisplayMotion';
import './image-display.scss';

/** An image overlay in the player window. */
interface ImageDisplay {
  container: HTMLDivElement;
  stage: HTMLDivElement;
  imageUrl: string;
}

export class ImageDisplayService {
  private app: App;
  private static instance: ImageDisplayService | null = null;
  private imageContainer: HTMLDivElement | null = null;
  private currentImage: HTMLImageElement | null = null;
  /** Wraps the image so the entrance can animate while the image's own transform pans and zooms. */
  private imageStage: HTMLDivElement | null = null;
  /** Overlays still fading out after being closed or replaced. */
  private leavingDisplays = new Set<ImageDisplay>();
  private currentScale: number = 1;
  private isDragging: boolean = false;
  private dragStartX: number = 0;
  private dragStartY: number = 0;
  private imageX: number = 0;
  private imageY: number = 0;
  private boundHandleContextMenu: (event: MouseEvent) => void;
  private boundStoreContextMenuTarget: (event: MouseEvent) => void;
  private lastContextMenuTarget: HTMLElement | null = null;
  private contextMenuEventRefs: EventRef[] = [];
  private contextMenuRegistered = false;
  private activePlayerDocument: Document | null = null;
  private containerWheelHandler: ((event: WheelEvent) => void) | null = null;
  private containerMouseDownHandler: ((event: MouseEvent) => void) | null = null;
  private containerDoubleClickHandler: (() => void) | null = null;
  private documentMouseMoveHandler: ((event: MouseEvent) => void) | null = null;
  private documentMouseUpHandler: (() => void) | null = null;
  private documentKeyDownHandler: ((event: KeyboardEvent) => void) | null = null;

  constructor(app: App) {
    this.app = app;
    ImageDisplayService.instance = this;
    this.boundHandleContextMenu = this.handleContextMenu.bind(this);
    this.boundStoreContextMenuTarget = (e: MouseEvent): void => { this.lastContextMenuTarget = e.target as HTMLElement; };
  }

  public static getInstance(): ImageDisplayService | null {
    return ImageDisplayService.instance;
  }

  /**
   * Register context menu handler for image files
   */
  public registerContextMenu(): void {
    if (this.contextMenuRegistered) {
      return;
    }

    this.contextMenuRegistered = true;

    // Register for file menu (in file explorer)
    const fileMenuRef = this.app.workspace.on('file-menu', (menu, file) => {
      if (file instanceof TFile && this.isImageFile(file)) {
        this.addImageDisplayMenuItem(menu, file);
      }
    });
    this.contextMenuEventRefs.push(fileMenuRef);

    // Register for link context menu (unofficial Obsidian event)
    const linkMenuRef = this.app.workspace.on('link-menu', (menu, linktext, sourcePath) => {
      const file = this.app.metadataCache.getFirstLinkpathDest(linktext, sourcePath);
      if (file instanceof TFile && this.isImageFile(file)) {
        this.addImageDisplayMenuItem(menu, file);
      }
    });
    this.contextMenuEventRefs.push(linkMenuRef);

    // Capture-phase listener to track right-click target (runs before Obsidian's handlers)
    document.addEventListener('contextmenu', this.boundStoreContextMenuTarget, true);

    // Register for editor context menu (fires on right-click in markdown views)
    // This adds our item to Obsidian's native menu for rendered image embeds (![[image.png]])
    const editorMenuRef = this.app.workspace.on('editor-menu', (menu: Menu) => {
      const target = this.lastContextMenuTarget;
      // Holding the element would keep its whole (possibly closed) view in memory
      this.lastContextMenuTarget = null;
      if (!target) return;

      const result = this.resolveImageFromTarget(target);
      if (!result) return;

      this.addImageDisplayMenuItem(menu, result.file);
      menu.addItem((item) => {
        item.setTitle('Copy image').setIcon('copy').onClick(() => this.copyImageToClipboard(result.imgElement));
      });
      menu.addItem((item) => {
        item.setTitle('Open in default app').setIcon('external-link').onClick(() => this.app.openWithDefaultApp(result.file.path));
      });
    });
    this.contextMenuEventRefs.push(editorMenuRef);

    // Fallback: listen for context menu events on direct image views (non-editor contexts)
    document.addEventListener('contextmenu', this.boundHandleContextMenu, false);
  }


  /**
   * Resolve a right-click target to an image file and its IMG element.
   * Handles rendered embeds (![[image.png]]) and direct IMG clicks.
   */
  private resolveImageFromTarget(target: HTMLElement): { file: TFile; imgElement: HTMLImageElement } | null {
    if (target.closest('[class*="atlas-"]') || target.closest('.modal-container')) return null;

    let imgElement: HTMLImageElement | null = null;

    if (target.tagName === 'IMG') {
      imgElement = target as HTMLImageElement;
    }

    const imageEmbed = target.closest('.internal-embed.image-embed');
    if (!imgElement && imageEmbed) {
      imgElement = imageEmbed.querySelector('img');
    }

    if (!imgElement) return null;

    // Method 1: Extract from src URL
    const filePath = this.extractFilePathFromSrc(imgElement.src);
    if (filePath) {
      const file = this.app.vault.getAbstractFileByPath(filePath);
      if (file instanceof TFile && this.isImageFile(file)) return { file, imgElement };
    }

    // Method 2: Resolve from embed's src/data-src attribute via metadata cache
    if (imageEmbed) {
      const dataSrc = imageEmbed.getAttribute('src') || imageEmbed.getAttribute('data-src');
      if (dataSrc) {
        const resolved = this.app.metadataCache.getFirstLinkpathDest(dataSrc, '');
        if (resolved instanceof TFile && this.isImageFile(resolved)) return { file: resolved, imgElement };

        const file = this.app.vault.getAbstractFileByPath(dataSrc);
        if (file instanceof TFile && this.isImageFile(file)) return { file, imgElement };
      }
    }

    return null;
  }

  /**
   * Fallback handler for direct image views (non-editor contexts like viewing an image file).
   * Rendered image embeds in markdown are handled by the editor-menu handler instead.
   */
  private handleContextMenu(event: MouseEvent): void {
    const target = event.target as HTMLElement;

    if (target.closest('[class*="atlas-"]') || target.closest('.modal-container')) return;

    // In markdown views, the editor-menu handler adds items to Obsidian's native menu
    const isInMarkdownView = target.closest('.markdown-preview-view') ||
                            target.closest('.markdown-source-view') ||
                            target.closest('.markdown-reading-view');
    if (isInMarkdownView) return;

    // Only handle direct image viewing (e.g. clicking an image file in a tab)
    const viewContent = target.closest('.view-content');
    if (!viewContent || target.closest('.atlas-vtt')) return;

    if (!viewContent.closest('.workspace-leaf')) return;

    const imgElement = viewContent.querySelector('img');
    if (!imgElement) return;

    // Try to resolve the image file
    let imageFile: TFile | null = null;

    const filePath = this.extractFilePathFromSrc(imgElement.src);
    if (filePath) {
      const file = this.app.vault.getAbstractFileByPath(filePath);
      if (file instanceof TFile) imageFile = file;
    }

    if (!imageFile) {
      const activeFile = this.app.workspace.getActiveFile();
      if (activeFile && this.isImageFile(activeFile)) {
        const leafEl = target.closest('.workspace-leaf');
        const activeLeafEl = document.querySelector('.workspace-leaf.mod-active');
        if (leafEl === activeLeafEl) imageFile = activeFile;
      }
    }

    if (imageFile) {
      event.preventDefault();
      event.stopPropagation();

      const file = imageFile;
      const entries: ContextMenuEntry[] = [
        { type: 'item', label: 'Display on player view', icon: 'monitor', onClick: () => this.displayImageOnPlayerView(file) },
        { type: 'separator' },
        { type: 'item', label: 'Copy image', icon: 'copy', onClick: () => this.copyImageToClipboard(imgElement) },
        { type: 'item', label: 'Open in Default App', icon: 'external-link', onClick: () => this.app.openWithDefaultApp(file.path) },
      ];

      openContextMenuGlobal(entries, { x: event.clientX, y: event.clientY });
    }
  }
  
  /**
   * Copy image to clipboard
   */
  private async copyImageToClipboard(imgElement: HTMLImageElement): Promise<void> {
    try {
      const blob = await this.renderImageAsPng(imgElement.src);
      await navigator.clipboard.write([new ClipboardItem({ 'image/png': blob })]);
      new Notice('Image copied to clipboard');
    } catch (error) {
      console.error('Failed to copy image:', error);
      new Notice('Failed to copy image');
    }
  }

  /** Re-encodes an image as PNG, the only image type the clipboard accepts. */
  private renderImageAsPng(src: string): Promise<Blob> {
    return new Promise((resolve, reject) => {
      const image = new Image();
      image.crossOrigin = 'anonymous';
      image.onload = (): void => {
        const canvas = createEl('canvas');
        canvas.width = image.naturalWidth;
        canvas.height = image.naturalHeight;
        const ctx = canvas.getContext('2d');
        if (!ctx) {
          reject(new Error('Canvas 2D context is unavailable'));
          return;
        }
        ctx.drawImage(image, 0, 0);
        canvas.toBlob((blob) => (blob ? resolve(blob) : reject(new Error('Failed to encode the image'))), 'image/png');
      };
      image.onerror = (): void => reject(new Error(`Failed to load image ${src}`));
      image.src = src;
    });
  }

  /**
   * Add menu item to display image on player view
   */
  private addImageDisplayMenuItem(menu: Menu, file: TFile): void {
    menu.addItem((item) => {
      item
        .setTitle('Display on player view')
        .setIcon('monitor')
        .onClick(async () => {
          await this.displayImageOnPlayerView(file);
        });
    });
  }

  /**
   * Display image on the player view window
   */
  public async displayImageOnPlayerView(file: TFile): Promise<void> {
    const playerWindowService = PlayerWindowService.getInstance();
    
    if (!playerWindowService || !playerWindowService.isWindowOpen()) {
      new Notice('Player window is not open. Please open it first.');
      return;
    }

    try {
      // Read the image file
      const arrayBuffer = await this.app.vault.readBinary(file);
      const blob = new Blob([arrayBuffer], { type: this.getMimeType(file.extension) });
      const imageUrl = URL.createObjectURL(blob);

      // Get the player window
      const playerWindow = playerWindowService.getWindow();
      if (!playerWindow) {
        new Notice('Player window is not available');
        return;
      }

      // Create or update the image display
      this.createImageDisplay(playerWindow, imageUrl, file.name);
      
    } catch (error) {
      console.error('[ImageDisplayService] Error displaying image:', error);
      new Notice('Failed to display image on player view');
    }
  }

  /**
   * Create the image display overlay in the player window
   */
  private createImageDisplay(playerWindow: Window, imageUrl: string, fileName: string): void {
    const doc = playerWindow.document;
    const previous = this.detachImageDisplay();

    this.imageContainer = doc.body.createDiv({ cls: 'atlas-image-display' });
    this.imageStage = this.imageContainer.createDiv({ cls: 'atlas-image-display__stage' });
    this.currentImage = this.imageStage.createEl('img', { cls: 'atlas-image-display__image' });
    this.currentImage.src = imageUrl;

    // Reset scale and position
    this.currentScale = 1;
    this.imageX = 0;
    this.imageY = 0;
    this.updateImageTransform();

    // Add close button
    const closeButton = this.imageContainer.createEl('button', { cls: 'atlas-image-display__close', text: '×' });
    closeButton.setAttribute('aria-label', 'Close');
    
    closeButton.addEventListener('click', () => {
      this.closeImageDisplay();
    });

    // Add event listeners
    this.setupEventListeners(playerWindow);

    // A replaced image leaves above the new one, so the scrim stays dark while they crossfade
    previous?.container.before(this.imageContainer);
    const entrance = playImageEnter(this.imageContainer, this.imageStage, this.currentImage, previous !== null);
    // The previous image stays until the new one can paint, so the crossfade never shows an empty scrim
    if (previous) void this.leave(previous, entrance);
  }

  /**
   * Setup event listeners for zoom and pan
   */
  private setupEventListeners(playerWindow: Window): void {
    if (!this.imageContainer) return;

    const doc = playerWindow.document;
    this.activePlayerDocument = doc;

    // Mouse wheel for zoom
    this.containerWheelHandler = (e: WheelEvent) => {
      e.preventDefault();
      
      const delta = e.deltaY < 0 ? 1.1 : 0.9;
      const newScale = this.currentScale * delta;
      
      // Limit scale between 0.1 and 5
      this.currentScale = Math.max(0.1, Math.min(5, newScale));
      this.updateImageTransform();
    };
    this.imageContainer.addEventListener('wheel', this.containerWheelHandler);

    // Mouse drag for pan
    this.containerMouseDownHandler = (e: MouseEvent) => {
      if (e.button === 0) { // Left click only
        this.isDragging = true;
        this.dragStartX = e.clientX - this.imageX;
        this.dragStartY = e.clientY - this.imageY;
        this.imageContainer!.classList.add('is-dragging');
      }
    };
    this.imageContainer.addEventListener('mousedown', this.containerMouseDownHandler);

    this.documentMouseMoveHandler = (e: MouseEvent) => {
      if (this.isDragging && this.imageContainer) {
        this.imageX = e.clientX - this.dragStartX;
        this.imageY = e.clientY - this.dragStartY;
        this.updateImageTransform();
      }
    };
    doc.addEventListener('mousemove', this.documentMouseMoveHandler);

    this.documentMouseUpHandler = () => {
      if (this.isDragging && this.imageContainer) {
        this.isDragging = false;
        this.imageContainer.classList.remove('is-dragging');
      }
    };
    doc.addEventListener('mouseup', this.documentMouseUpHandler);

    // ESC key to close
    this.documentKeyDownHandler = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && this.imageContainer) {
        this.closeImageDisplay();
      }
    };
    doc.addEventListener('keydown', this.documentKeyDownHandler);

    // Double-click to reset
    this.containerDoubleClickHandler = () => {
      this.currentScale = 1;
      this.imageX = 0;
      this.imageY = 0;
      this.updateImageTransform();
    };
    this.imageContainer.addEventListener('dblclick', this.containerDoubleClickHandler);
  }

  /**
   * Update image transform based on current scale and position
   */
  private updateImageTransform(): void {
    if (!this.currentImage) return;
    
    this.currentImage.style.transform = `translate(${this.imageX}px, ${this.imageY}px) scale(${this.currentScale})`;
  }

  /**
   * Close the image display
   */
  public closeImageDisplay(): void {
    const display = this.detachImageDisplay();
    if (!display) return;
    new Notice('Image display closed');
    void this.leave(display);
  }
  
  /**
   * Check if an image is currently being displayed
   */
  public isImageDisplayed(): boolean {
    return this.imageContainer !== null;
  }

  /**
   * Check if file is an image
   */
  private isImageFile(file: TFile): boolean {
    const imageExtensions = ['png', 'jpg', 'jpeg', 'gif', 'bmp', 'svg', 'webp'];
    return imageExtensions.includes(file.extension.toLowerCase());
  }

  /**
   * Extract file path from image src URL
   */
  private extractFilePathFromSrc(src: string): string | null {
    try {
      // Handle app://local URLs
      if (src.startsWith('app://')) {
        // Remove query parameters first
        const cleanSrc = src.split('?')[0] ?? src;
        
        // Extract everything after app://[hash]/
        const appMatch = cleanSrc.match(/app:\/\/[^/]+\/(.+)/);
        if (appMatch?.[1]) {
          let fullPath = decodeURIComponent(appMatch[1]);
          
          // Get the vault path
          const adapter = this.app.vault.adapter;
          const vaultPath = adapter instanceof FileSystemAdapter ? adapter.getBasePath() : '';
          
          // Normalize paths by ensuring they start with /
          const normalizedFullPath = fullPath.startsWith('/') ? fullPath : '/' + fullPath;
          const normalizedVaultPath = vaultPath.startsWith('/') ? vaultPath : '/' + vaultPath;
          
          // If the full path includes the vault path, extract the relative part
          if (normalizedFullPath.includes(normalizedVaultPath)) {
            const startIndex = normalizedFullPath.indexOf(normalizedVaultPath);
            if (startIndex !== -1) {
              // Get everything after the vault path
              let relativePath = normalizedFullPath.substring(startIndex + normalizedVaultPath.length);
              // Remove leading slash if present
              if (relativePath.startsWith('/')) {
                relativePath = relativePath.substring(1);
              }
              return relativePath;
            }
          }
          
          // If we couldn't extract relative path, return the full path
          return fullPath;
        }
      }
      
      // Handle vault:// URLs
      const vaultMatch = src.match(/vault:\/\/(.+)/);
      if (vaultMatch?.[1]) {
        return decodeURIComponent(vaultMatch[1]);
      }
      
      // Handle Obsidian's custom protocols (obsidian://...)
      if (src.startsWith('obsidian://')) {
        const url = new URL(src);
        const path = url.searchParams.get('path');
        if (path) {
          return decodeURIComponent(path);
        }
      }
      
      // Handle data URLs by looking at the alt attribute or other metadata
      if (src.startsWith('data:')) {
        // For data URLs, we can't extract a file path directly
        // We'll need to handle this case differently
        return null;
      }
      
      // Handle relative paths
      if (!src.includes('://')) {
        return decodeURIComponent(src);
      }
    } catch (e) {
      console.error('Error extracting file path from src:', e);
    }
    
    return null;
  }

  /**
   * Get MIME type for file extension
   */
  private getMimeType(extension: string): string {
    const mimeTypes: Record<string, string> = {
      'png': 'image/png',
      'jpg': 'image/jpeg',
      'jpeg': 'image/jpeg',
      'gif': 'image/gif',
      'bmp': 'image/bmp',
      'svg': 'image/svg+xml',
      'webp': 'image/webp'
    };
    
    return mimeTypes[extension.toLowerCase()] || 'image/png';
  }

  /**
   * Destroy the service
   */
  public destroy(): void {
    this.disposeImageDisplay();

    document.removeEventListener('contextmenu', this.boundStoreContextMenuTarget, true);
    document.removeEventListener('contextmenu', this.boundHandleContextMenu, false);
    this.lastContextMenuTarget = null;

    this.contextMenuEventRefs.forEach((eventRef) => {
      this.app.workspace.offref(eventRef);
    });
    this.contextMenuEventRefs = [];
    this.contextMenuRegistered = false;

    ImageDisplayService.instance = null;
  }

  /** Removes every overlay at once, including ones still fading out. */
  private disposeImageDisplay(): void {
    const display = this.detachImageDisplay();
    if (display) this.removeImageDisplay(display);
    for (const leaving of this.leavingDisplays) this.removeImageDisplay(leaving);
    this.leavingDisplays.clear();
  }

  /** Stops the shown overlay from reacting to input and hands it back for its exit, or null when none is shown. */
  private detachImageDisplay(): ImageDisplay | null {
    if (!this.imageContainer || !this.imageStage || !this.currentImage) return null;
    this.teardownImageEventListeners();
    const display: ImageDisplay = { container: this.imageContainer, stage: this.imageStage, imageUrl: this.currentImage.src };
    // A leaving overlay may sit above the next image; let input reach that one
    display.container.addClass('is-leaving');
    this.imageContainer = null;
    this.imageStage = null;
    this.currentImage = null;
    this.currentScale = 1;
    this.imageX = 0;
    this.imageY = 0;
    this.isDragging = false;
    return display;
  }

  private async leave(display: ImageDisplay, after?: Promise<void>): Promise<void> {
    this.leavingDisplays.add(display);
    await after;
    // Removed at once meanwhile (destroy)
    if (!this.leavingDisplays.has(display)) return;
    await playImageExit(display.container, display.stage);
    if (!this.leavingDisplays.delete(display)) return;
    this.removeImageDisplay(display);
  }

  private removeImageDisplay(display: ImageDisplay): void {
    display.container.remove();
    URL.revokeObjectURL(display.imageUrl);
  }

  private teardownImageEventListeners(): void {
    if (this.imageContainer && this.containerWheelHandler) {
      this.imageContainer.removeEventListener('wheel', this.containerWheelHandler);
    }
    if (this.imageContainer && this.containerMouseDownHandler) {
      this.imageContainer.removeEventListener('mousedown', this.containerMouseDownHandler);
    }
    if (this.imageContainer && this.containerDoubleClickHandler) {
      this.imageContainer.removeEventListener('dblclick', this.containerDoubleClickHandler);
    }
    if (this.activePlayerDocument && this.documentMouseMoveHandler) {
      this.activePlayerDocument.removeEventListener('mousemove', this.documentMouseMoveHandler);
    }
    if (this.activePlayerDocument && this.documentMouseUpHandler) {
      this.activePlayerDocument.removeEventListener('mouseup', this.documentMouseUpHandler);
    }
    if (this.activePlayerDocument && this.documentKeyDownHandler) {
      this.activePlayerDocument.removeEventListener('keydown', this.documentKeyDownHandler);
    }

    this.activePlayerDocument = null;
    this.containerWheelHandler = null;
    this.containerMouseDownHandler = null;
    this.containerDoubleClickHandler = null;
    this.documentMouseMoveHandler = null;
    this.documentMouseUpHandler = null;
    this.documentKeyDownHandler = null;
  }
}
