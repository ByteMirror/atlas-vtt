/**
 * Utility to fix token image paths in map files that have duplicated path segments
 */

import type { LegacyMapFile } from '../services/MapPersistence';

/**
 * Fix a single image path that may have duplicated segments
 */
export function fixDuplicatedPath(path: string): string {
  if (!path) return path;
  
  // Pattern to match paths like: atlas-vtt/test-vault/atlas-vtt/assets/...
  // We want to remove the first atlas-vtt/test-vault/ part
  const match = path.match(/^atlas-vtt\/[^/]+\/(atlas-vtt\/.+)$/);
  if (match && match[1]) {
    return match[1];
  }
  
  // Also handle atlas-vtt/atlas-vtt/... duplications
  if (path.startsWith('atlas-vtt/atlas-vtt/')) {
    const fixed = path.replace('atlas-vtt/atlas-vtt/', 'atlas-vtt/');
    return fixed;
  }
  
  return path;
}

/**
 * Fix all token paths in a map data object
 */
export function fixMapTokenPaths(mapData: LegacyMapFile): boolean {
  let modified = false;

  for (const token of Object.values(mapData.objects?.tokens ?? {})) {
    if (token.imagePath) {
      const fixedPath = fixDuplicatedPath(token.imagePath);
      if (fixedPath !== token.imagePath) {
        token.imagePath = fixedPath;
        modified = true;
      }
    }
  }

  return modified;
}
