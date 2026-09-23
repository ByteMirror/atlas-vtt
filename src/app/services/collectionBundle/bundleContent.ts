import type { BundleFile, BundleFileRole } from './bundleFormat';
import { remapPaths, type PathMap } from './pathRemap';

/** JSON files carry vault paths and asset ids that must follow the files and records they point at. */
const JSON_ROLES: ReadonlySet<BundleFileRole> = new Set<BundleFileRole>(['asset-file', 'scene-map']);

const encoder = new TextEncoder();
const decoder = new TextDecoder();

function toBuffer(text: string): ArrayBuffer {
  const bytes = encoder.encode(text);
  // Copy into a fresh ArrayBuffer: TextEncoder's view may sit on a shared or offset buffer.
  const buffer = new ArrayBuffer(bytes.byteLength);
  new Uint8Array(buffer).set(bytes);
  return buffer;
}

function rewriteJson(raw: ArrayBuffer, rewrites: PathMap): ArrayBuffer {
  try {
    const parsed: unknown = JSON.parse(decoder.decode(raw));
    const remapped = JSON.stringify(remapPaths(parsed, rewrites));
    return remapped === JSON.stringify(parsed) ? raw : toBuffer(remapped);
  } catch {
    return raw;
  }
}

const FRONTMATTER = /^(---\r?\n)([\s\S]*?)(\r?\n---)/;

/** Points the note's artwork field at where the artwork now lives; only a single-line value is rewritten. */
function relinkStatblockNote(file: BundleFile, raw: ArrayBuffer, rewrites: PathMap): ArrayBuffer {
  const image = file.statblockImage;
  const target = image && rewrites.get(image.path);
  if (!image || !target) return raw;
  const text = decoder.decode(raw);
  const frontmatter = FRONTMATTER.exec(text);
  const line = frontmatter && new RegExp(`^${image.key}:[ \\t]*\\S[^\\n]*$`, 'm').exec(frontmatter[2]!);
  if (!frontmatter || !line) return raw;
  const block = frontmatter[2]!.replace(line[0], `${image.key}: ${JSON.stringify(target)}`);
  return toBuffer(`${frontmatter[1]}${block}${text.slice(frontmatter[1]!.length + frontmatter[2]!.length)}`);
}

/**
 * `raw` with the paths and ids it refers to rewritten: JSON files follow moved
 * files and renamed records, statblock notes follow their artwork. Returns
 * `raw` itself when nothing changes, so unchanged files keep their exact bytes.
 */
export function rewriteContent(file: BundleFile, raw: ArrayBuffer, rewrites: PathMap): ArrayBuffer {
  if (rewrites.size === 0) return raw;
  if (JSON_ROLES.has(file.role)) return rewriteJson(raw, rewrites);
  if (file.role === 'statblock-note') return relinkStatblockNote(file, raw, rewrites);
  return raw;
}

/** Whether `rewriteContent` may change the file's bytes, so they must be read to know the result. */
export const mayRewrite = (file: BundleFile, rewrites: PathMap): boolean =>
  rewrites.size > 0 && (JSON_ROLES.has(file.role) || (file.role === 'statblock-note' && file.statblockImage !== undefined));
