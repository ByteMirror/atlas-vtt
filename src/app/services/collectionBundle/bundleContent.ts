import type { BundleFile, BundleFileRole } from './bundleFormat';
import { remapPaths, type PathMap } from './pathRemap';

/** Text files carry vault paths and asset ids that must follow the files and records they point at. */
const REWRITTEN_ROLES: ReadonlySet<BundleFileRole> = new Set<BundleFileRole>(['asset-file', 'scene-map']);

const encoder = new TextEncoder();
const decoder = new TextDecoder();

/** `raw` with the paths and ids of JSON files rewritten; everything else is returned as is. */
export function rewriteContent(file: BundleFile, raw: ArrayBuffer, rewrites: PathMap): ArrayBuffer {
  if (!REWRITTEN_ROLES.has(file.role)) return raw;
  try {
    const bytes = encoder.encode(JSON.stringify(remapPaths(JSON.parse(decoder.decode(raw)), rewrites)));
    // Copy into a fresh ArrayBuffer: TextEncoder's view may sit on a shared or offset buffer.
    const buffer = new ArrayBuffer(bytes.byteLength);
    new Uint8Array(buffer).set(bytes);
    return buffer;
  } catch {
    return raw;
  }
}

/** Statblock notes are relinked to their artwork after writing, so their final bytes are only known afterwards. */
export const isContentPredictable = (file: BundleFile): boolean => file.role !== 'statblock-note';
