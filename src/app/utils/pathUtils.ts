/**
 * Utility functions for handling file paths in Atlas VTT
 */

/**
 * Normalize an image path to ensure it's a relative vault path
 * Converts app:// URLs and absolute paths to relative vault paths
 */
export function normalizeImagePath(path: string): string {
  if (!path) return path;
  
  // If already a relative path, return as-is
  if (!path.startsWith('app://') && !path.startsWith('/')) {
    return path;
  }
  
  // Handle app:// URLs
  if (path.startsWith('app://')) {
    const match = path.match(/app:\/\/[^/]+\/(.+?)(?:\?|$)/);
    if (match && match[1]) {
      const fullPath = decodeURIComponent(match[1]);
      
      // Look for the last occurrence of 'atlas-vtt/' in the path
      // This handles cases where the path might have duplicated segments
      const lastAtlasIndex = fullPath.lastIndexOf('atlas-vtt/');
      if (lastAtlasIndex !== -1) {
        return fullPath.substring(lastAtlasIndex);
      }
      
      // Fallback patterns if atlas-vtt is not found
      const patterns = [
        /\/test-vault\/(.*)$/,
        /\/vault\/(.*)$/
      ];
      
      for (const pattern of patterns) {
        const patternMatch = fullPath.match(pattern);
        if (patternMatch && patternMatch[1]) {
          return patternMatch[1];
        }
      }
    }
  }
  
  // Handle absolute paths
  if (path.startsWith('/')) {
    // Look for the last occurrence of 'atlas-vtt/' in the path
    const lastAtlasIndex = path.lastIndexOf('atlas-vtt/');
    if (lastAtlasIndex !== -1) {
      return path.substring(lastAtlasIndex);
    }
    
    // Fallback patterns if atlas-vtt is not found
    const patterns = [
      /\/test-vault\/(.*)$/,
      /\/vault\/(.*)$/
    ];
    
    for (const pattern of patterns) {
      const match = path.match(pattern);
      if (match && match[1]) {
        return match[1];
      }
    }
  }
  
  // If we couldn't normalize it, return the original path
  console.warn(`[pathUtils] Could not normalize path: ${path}`);
  return path;
}

/**
 * Check if a path is an app:// URL
 */
export function isAppUrl(path: string): boolean {
  return path?.startsWith('app://') || false;
}

/**
 * Check if a path is absolute
 */
export function isAbsolutePath(path: string): boolean {
  return path?.startsWith('/') || false;
}

/**
 * Check if a path needs normalization
 */
export function needsPathNormalization(path: string): boolean {
  return isAppUrl(path) || isAbsolutePath(path);
}

/** The last segment of a vault path: `a/b/goblin.webp` → `goblin.webp`. */
export const baseName = (path: string): string => path.slice(path.lastIndexOf('/') + 1);

/** The folder of a vault path: `a/b/goblin.webp` → `a/b`; empty at the vault root. */
export const parentPath = (path: string): string => path.slice(0, Math.max(0, path.lastIndexOf('/')));
