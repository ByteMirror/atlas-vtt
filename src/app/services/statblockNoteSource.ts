/**
 * Identifies statblock notes the way Fantasy Statblocks does.
 *
 * Fantasy Statblocks recognises a statblock through two independent routes:
 *
 * 1. Frontmatter `statblock: true | "true" | "inline"` — its watcher parses the
 *    note into the bestiary, keyed by the note's path.
 * 2. A ```statblock code fence — its code block processor renders whatever the
 *    fence contains. The fence may name a bestiary creature (`creature:` /
 *    `monster:`), point at another note (`note:`), or define the creature
 *    inline.
 *
 * Only the first route puts the creature in the bestiary, so the second has to
 * be resolved from the fence itself.
 */

import { TFile, parseYaml, type App } from 'obsidian';

/** A ```statblock fence, capturing its body. */
const STATBLOCK_FENCE = /^[ \t]*(?:```+|~~~+)\s*statblock\s*$([\s\S]*?)^[ \t]*(?:```+|~~~+)\s*$/m;

export type StatblockNoteSource =
  /** Parsed into the bestiary from this note's frontmatter. */
  | { kind: 'frontmatter' }
  /** Defined by a code fence in this note. */
  | { kind: 'codeblock'; params: Record<string, unknown> };

/**
 * Matches Fantasy Statblocks' watcher: only these exact values cause a note to
 * be parsed into the bestiary. Note that `statblock: <layout name>` is valid
 * frontmatter for choosing a layout and does *not* make the note a bestiary
 * entry.
 */
export function hasBestiaryFrontmatter(app: App, file: TFile): boolean {
  const statblock: unknown = app.metadataCache.getFileCache(file)?.frontmatter?.statblock;
  return statblock === true || statblock === 'true' || statblock === 'inline';
}

/** Extracts the params from the first ```statblock fence, if there is one. */
export function parseStatblockFence(content: string): Record<string, unknown> | null {
  const match = STATBLOCK_FENCE.exec(content);
  if (!match) return null;

  try {
    const params: unknown = parseYaml(match[1] ?? '');
    return params && typeof params === 'object' ? (params as Record<string, unknown>) : {};
  } catch {
    // A malformed fence is still a statblock fence; Fantasy Statblocks renders
    // an error for it rather than ignoring the block.
    return {};
  }
}

/**
 * Resolves how a note defines its statblock, or null when it defines none.
 * Reads the file only when the frontmatter marker is absent.
 */
export async function resolveStatblockNote(
  app: App,
  file: TFile,
): Promise<StatblockNoteSource | null> {
  if (file.extension !== 'md') return null;
  if (hasBestiaryFrontmatter(app, file)) return { kind: 'frontmatter' };

  const params = parseStatblockFence(await app.vault.cachedRead(file));
  return params ? { kind: 'codeblock', params } : null;
}
