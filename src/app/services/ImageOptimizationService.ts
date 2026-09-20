import { App, TFile, Notice } from 'obsidian';
import { optimizeImage, OPTIMIZATION_PRESETS, formatFileSize } from '../utils/imageOptimizer';

export interface OptimizationResult {
  originalPath: string;
  optimizedPath: string;
  originalSize: number;
  optimizedSize: number;
  compressionRatio: number;
  deleted: boolean;
}

export interface OptimizationOptions {
  deleteOriginals: boolean;
  targetDirectory?: string;
  preset?: 'token' | 'map' | 'thumbnail';
}

export class ImageOptimizationService {
  private app: App;

  constructor(app: App) {
    this.app = app;
  }

  /**
   * Optimize a single image file in the vault
   */
  async optimizeVaultImage(
    file: TFile, 
    options: OptimizationOptions = { deleteOriginals: true }
  ): Promise<OptimizationResult | null> {
    try {
      // Skip if already WebP
      if (file.extension.toLowerCase() === 'webp') {
        return null;
      }

      // Read the original file
      const arrayBuffer = await this.app.vault.readBinary(file);
      const blob = new Blob([arrayBuffer], { type: `image/${file.extension}` });
      const originalFile = new File([blob], file.name, { type: blob.type });

      // Get optimization preset
      const preset = options.preset || this.guessPresetFromPath(file.path);
      const optimizationOptions = OPTIMIZATION_PRESETS[preset];

      // Optimize the image
      const result = await optimizeImage(originalFile, optimizationOptions);

      // Generate new filename
      const directory = options.targetDirectory || file.parent?.path || '';
      const nameWithoutExt = file.basename.replace(/\.[^.]+$/, '');
      const optimizedFilename = `${nameWithoutExt}.webp`;
      const optimizedPath = directory ? `${directory}/${optimizedFilename}` : optimizedFilename;

      // Check if optimized file already exists
      const existingOptimized = this.app.vault.getAbstractFileByPath(optimizedPath);
      if (existingOptimized) {
        console.warn(`[ImageOptimizationService] Optimized file already exists: ${optimizedPath}`);
        return null;
      }

      // Save optimized file
      const optimizedArrayBuffer = await result.blob.arrayBuffer();
      await this.app.vault.createBinary(optimizedPath, optimizedArrayBuffer);

      // Delete original if requested and optimization was successful
      let deleted = false;
      if (options.deleteOriginals && result.compressionRatio > 10) { // Only delete if we saved >10%
        try {
          await this.app.fileManager.trashFile(file);
          deleted = true;
        } catch (error) {
          console.error(`[ImageOptimizationService] Failed to delete original: ${file.path}`, error);
        }
      }

      return {
        originalPath: file.path,
        optimizedPath,
        originalSize: result.originalSize,
        optimizedSize: result.optimizedSize,
        compressionRatio: result.compressionRatio,
        deleted
      };

    } catch (error) {
      console.error(`[ImageOptimizationService] Failed to optimize ${file.path}:`, error);
      return null;
    }
  }

  /**
   * Batch optimize multiple image files
   */
  async optimizeMultipleImages(
    files: TFile[],
    options: OptimizationOptions = { deleteOriginals: true },
    onProgress?: (completed: number, total: number, current: string) => void
  ): Promise<OptimizationResult[]> {
    const results: OptimizationResult[] = [];

    for (let i = 0; i < files.length; i++) {
      const file = files[i]!;
      
      if (onProgress) {
        onProgress(i, files.length, file.name);
      }

      const result = await this.optimizeVaultImage(file, options);
      if (result) {
        results.push(result);
      }
    }

    if (onProgress) {
      onProgress(files.length, files.length, '');
    }

    return results;
  }

  /**
   * Find all large images in the vault that could benefit from optimization
   */
  async findLargeImages(minSizeKB: number = 500): Promise<TFile[]> {
    const largeImages: TFile[] = [];
    const imageExtensions = ['png', 'jpg', 'jpeg', 'gif', 'bmp'];

    const files = this.app.vault.getFiles();
    for (const file of files) {
      // Skip if not an image or already WebP
      if (!imageExtensions.includes(file.extension.toLowerCase())) {
        continue;
      }

      // Check file size
      if (file.stat.size > minSizeKB * 1024) {
        largeImages.push(file);
      }
    }

    return largeImages.sort((a, b) => b.stat.size - a.stat.size);
  }

  /**
   * Optimize all images in a specific directory
   */
  async optimizeDirectory(
    directoryPath: string,
    options: OptimizationOptions = { deleteOriginals: true }
  ): Promise<{
    results: OptimizationResult[];
    totalOriginalSize: number;
    totalOptimizedSize: number;
    totalSaved: number;
  }> {
    const files = this.app.vault.getFiles().filter(file => 
      file.path.startsWith(directoryPath) && 
      ['png', 'jpg', 'jpeg', 'gif', 'bmp'].includes(file.extension.toLowerCase())
    );

    const results = await this.optimizeMultipleImages(files, options);

    const totalOriginalSize = results.reduce((sum, r) => sum + r.originalSize, 0);
    const totalOptimizedSize = results.reduce((sum, r) => sum + r.optimizedSize, 0);
    const totalSaved = totalOriginalSize - totalOptimizedSize;

    return {
      results,
      totalOriginalSize,
      totalOptimizedSize,
      totalSaved
    };
  }

  /**
   * Update all references to an image file after optimization
   */
  async updateImageReferences(oldPath: string, newPath: string): Promise<number> {
    let updatedCount = 0;

    // Find all markdown files
    const markdownFiles = this.app.vault.getMarkdownFiles();
    
    for (const file of markdownFiles) {
      try {
        const content = await this.app.vault.read(file);

        if (content.includes(oldPath)) {
          await this.app.vault.process(file, (latest) => latest.split(oldPath).join(newPath));
          updatedCount++;
        }
      } catch (error) {
        console.error(`[ImageOptimizationService] Failed to update references in ${file.path}:`, error);
      }
    }

    return updatedCount;
  }

  /**
   * Show optimization summary as a notice
   */
  showOptimizationSummary(results: OptimizationResult[]): void {
    if (results.length === 0) {
      new Notice('No images were optimized');
      return;
    }

    const totalOriginal = results.reduce((sum, r) => sum + r.originalSize, 0);
    const totalOptimized = results.reduce((sum, r) => sum + r.optimizedSize, 0);
    const totalSaved = totalOriginal - totalOptimized;
    const deletedCount = results.filter(r => r.deleted).length;

    const message = `Optimized ${results.length} images
Saved: ${formatFileSize(totalSaved)} (${Math.round((totalSaved / totalOriginal) * 100)}%)
${deletedCount > 0 ? `Deleted ${deletedCount} original files` : ''}`;

    new Notice(message, 5000);
  }

  /**
   * Guess optimization preset based on file path
   */
  private guessPresetFromPath(path: string): 'token' | 'map' | 'thumbnail' {
    const lowerPath = path.toLowerCase();
    
    if (lowerPath.includes('token') || lowerPath.includes('character') || lowerPath.includes('portrait')) {
      return 'token';
    } else if (lowerPath.includes('thumb') || lowerPath.includes('icon')) {
      return 'thumbnail';
    } else {
      return 'map';
    }
  }
}
