import { toError } from './errors';
/**
 * Image optimization utilities for Atlas VTT
 * Handles compression, format conversion, and intelligent resizing
 */

export interface ImageOptimizationOptions {
  maxWidth?: number;
  maxHeight?: number;
  quality?: number; // 0-1 for WebP/JPEG
  format?: 'webp' | 'png' | 'jpeg';
  forceResize?: boolean;
}

export interface OptimizedImageResult {
  blob: Blob;
  width: number;
  height: number;
  originalSize: number;
  optimizedSize: number;
  compressionRatio: number;
}

/**
 * Default optimization settings based on use case
 */
export const OPTIMIZATION_PRESETS = {
  token: {
    maxWidth: 400,
    maxHeight: 400,
    quality: 0.85,
    format: 'webp' as const
  },
  map: {
    maxWidth: 8192,
    maxHeight: 8192,
    quality: 0.80,
    format: 'webp' as const
  },
  thumbnail: {
    maxWidth: 200,
    maxHeight: 200,
    quality: 0.75,
    format: 'webp' as const
  }
} as const;

/**
 * Optimizes an image file with compression, format conversion, and resizing
 */
export async function optimizeImage(
  file: File,
  options: ImageOptimizationOptions = {}
): Promise<OptimizedImageResult> {
  const {
    maxWidth = 2048,
    maxHeight = 2048,
    quality = 0.85,
    format = 'webp',
    forceResize = false
  } = options;

  return new Promise((resolve, reject) => {
    const img = new Image();
    const canvas = createEl('canvas');
    const ctx = canvas.getContext('2d');

    if (!ctx) {
      reject(new Error('Failed to get canvas context'));
      return;
    }

    const objectUrl = URL.createObjectURL(file);

    img.onload = () => {
      URL.revokeObjectURL(objectUrl);
      try {
        const { width: originalWidth, height: originalHeight } = img;
        
        // Calculate optimal dimensions
        const { width: targetWidth, height: targetHeight } = calculateOptimalDimensions(
          originalWidth,
          originalHeight,
          maxWidth,
          maxHeight,
          forceResize
        );

        // Set canvas dimensions
        canvas.width = targetWidth;
        canvas.height = targetHeight;

        // Enable high-quality scaling
        ctx.imageSmoothingEnabled = true;
        ctx.imageSmoothingQuality = 'high';

        // Draw and scale the image
        ctx.drawImage(img, 0, 0, targetWidth, targetHeight);

        // Convert to optimized format
        canvas.toBlob(
          (blob) => {
            if (!blob) {
              reject(new Error('Failed to create optimized image blob'));
              return;
            }

            const result: OptimizedImageResult = {
              blob,
              width: targetWidth,
              height: targetHeight,
              originalSize: file.size,
              optimizedSize: blob.size,
              compressionRatio: Math.round((1 - blob.size / file.size) * 100)
            };

            resolve(result);
          },
          `image/${format}`,
          quality
        );
      } catch (error) {
        reject(toError(error, 'Image optimization failed'));
      }
    };

    img.onerror = () => {
      URL.revokeObjectURL(objectUrl);
      reject(new Error('Failed to load image for optimization'));
    };

    // Load the image
    img.src = objectUrl;
  });
}

/**
 * Calculate optimal dimensions for resizing while maintaining aspect ratio
 */
function calculateOptimalDimensions(
  originalWidth: number,
  originalHeight: number,
  maxWidth: number,
  maxHeight: number,
  forceResize: boolean = false
): { width: number; height: number } {
  // If image is already smaller than max and we're not forcing resize, keep original
  if (!forceResize && originalWidth <= maxWidth && originalHeight <= maxHeight) {
    return { width: originalWidth, height: originalHeight };
  }

  // Calculate scaling ratio to fit within bounds
  const widthRatio = maxWidth / originalWidth;
  const heightRatio = maxHeight / originalHeight;
  const ratio = Math.min(widthRatio, heightRatio);

  return {
    width: Math.round(originalWidth * ratio),
    height: Math.round(originalHeight * ratio)
  };
}

/**
 * Batch optimize multiple images with progress callback
 */
export async function optimizeImages(
  files: File[],
  options: ImageOptimizationOptions = {},
  onProgress?: (completed: number, total: number, currentFile: string) => void
): Promise<OptimizedImageResult[]> {
  const results: OptimizedImageResult[] = [];
  
  for (let i = 0; i < files.length; i++) {
    const file = files[i]!;

    if (onProgress) {
      onProgress(i, files.length, file.name);
    }

    try {
      const result = await optimizeImage(file, options);
      results.push(result);
    } catch (error) {
      console.error(`Failed to optimize image ${file.name}:`, error);
      // Continue with other images even if one fails
    }
  }

  if (onProgress) {
    onProgress(files.length, files.length, '');
  }

  return results;
}

/**
 * Check if an image file needs optimization based on size and dimensions
 */
export async function shouldOptimizeImage(
  file: File,
  options: ImageOptimizationOptions = {}
): Promise<{ shouldOptimize: boolean; reason: string }> {
  const { maxWidth = 2048, maxHeight = 2048 } = options;
  
  // Check file size (optimize if > 1MB)
  if (file.size > 1024 * 1024) {
    return { shouldOptimize: true, reason: 'File size exceeds 1MB' };
  }

  // Check if it's not WebP format
  if (!file.type.includes('webp')) {
    return { shouldOptimize: true, reason: 'Converting to WebP format' };
  }

  // Check image dimensions
  return new Promise((resolve) => {
    const img = new Image();
    const objectUrl = URL.createObjectURL(file);
    img.onload = () => {
      URL.revokeObjectURL(objectUrl);
      if (img.width > maxWidth || img.height > maxHeight) {
        resolve({ shouldOptimize: true, reason: `Dimensions exceed ${maxWidth}x${maxHeight}` });
      } else {
        resolve({ shouldOptimize: false, reason: 'Image is already optimized' });
      }
    };
    img.onerror = () => {
      URL.revokeObjectURL(objectUrl);
      resolve({ shouldOptimize: true, reason: 'Could not read image dimensions' });
    };
    img.src = objectUrl;
  });
}

/**
 * Get optimization statistics for a set of files
 */
export async function getOptimizationStats(
  results: OptimizedImageResult[]
): Promise<{
  totalOriginalSize: number;
  totalOptimizedSize: number;
  totalSavings: number;
  averageCompression: number;
}> {
  const totalOriginalSize = results.reduce((sum, r) => sum + r.originalSize, 0);
  const totalOptimizedSize = results.reduce((sum, r) => sum + r.optimizedSize, 0);
  const totalSavings = totalOriginalSize - totalOptimizedSize;
  const averageCompression = results.reduce((sum, r) => sum + r.compressionRatio, 0) / results.length;

  return {
    totalOriginalSize,
    totalOptimizedSize,
    totalSavings,
    averageCompression: Math.round(averageCompression)
  };
}

/**
 * Format file size for display
 */
export function formatFileSize(bytes: number): string {
  if (bytes === 0) return '0 Bytes';
  
  const k = 1024;
  const sizes = ['Bytes', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  
  return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
}