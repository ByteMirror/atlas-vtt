import { normalizeImagePath } from '../utils/pathUtils';

/** Whether `candidate` names `path`, in raw or normalized form. */
export function pathMatches(candidate: string | null | undefined, path: string): boolean {
  if (!candidate) return false;
  return candidate === path || normalizeImagePath(candidate) === normalizeImagePath(path);
}

/** A pin target (`path` or `path#heading`) moved to `newPath`, or null when it points elsewhere. */
function renamedPinTarget(target: string, oldPath: string, newPath: string): string | null {
  const hash = target.indexOf('#');
  const path = hash === -1 ? target : target.slice(0, hash);
  return pathMatches(path, oldPath) ? newPath + (hash === -1 ? '' : target.slice(hash)) : null;
}

interface TokenPaths {
  imagePath?: string | undefined;
  statblockPath?: string | null | undefined;
}

interface PinPaths {
  notePath?: string | undefined;
}

/** The parts of a map that point at vault files, in a saved map file or a live store draft. */
export interface MapFileReferences {
  tokens?: Record<string, TokenPaths> | null | undefined;
  pins?: Record<string, PinPaths> | null | undefined;
}

/**
 * Points token art, token statblocks and pin targets that name `oldPath` at
 * `newPath`, in place. Returns whether anything changed.
 */
export function rewriteMapReferences(objects: MapFileReferences | null | undefined, oldPath: string, newPath: string): boolean {
  let changed = false;
  for (const token of Object.values(objects?.tokens ?? {})) {
    if (pathMatches(token.imagePath, oldPath)) {
      token.imagePath = newPath;
      changed = true;
    }
    if (pathMatches(token.statblockPath, oldPath)) {
      token.statblockPath = newPath;
      changed = true;
    }
  }
  for (const pin of Object.values(objects?.pins ?? {})) {
    const target = pin.notePath ? renamedPinTarget(pin.notePath, oldPath, newPath) : null;
    if (target) {
      pin.notePath = target;
      changed = true;
    }
  }
  return changed;
}
