/**
 * Utility to fix token image paths in map files that have duplicated path segments
 */

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
export function fixMapTokenPaths(mapData: any): boolean {
  let modified = false;
  
  // Handle both direct mapData and wrapped in state
  const data = mapData.state || mapData;
  
  if (data.objects && data.objects.tokens) {
    for (const tokenId in data.objects.tokens) {
      const token = data.objects.tokens[tokenId];
      if (token.imagePath) {
        const fixedPath = fixDuplicatedPath(token.imagePath);
        if (fixedPath !== token.imagePath) {
          token.imagePath = fixedPath;
          modified = true;
        }
      }
    }
  }
  
  return modified;
}
