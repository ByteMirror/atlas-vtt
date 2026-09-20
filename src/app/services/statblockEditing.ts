/**
 * Write-back for statblock values.
 *
 * Fantasy Statblocks creatures parsed from notes are backed by that note's YAML
 * frontmatter, so editing a value means rewriting the frontmatter key. Fantasy
 * Statblocks' own watcher re-parses the note afterwards and updates its
 * bestiary, which is what refreshes the rendered statblock.
 */

import { TFile, type App } from 'obsidian';

/** Coerces edited text back to the type the frontmatter already held. */
export function coerceToExisting(text: string, existing: unknown): unknown {
  const trimmed = text.trim();

  if (typeof existing === 'number') {
    const parsed = Number(trimmed);
    return Number.isFinite(parsed) ? parsed : trimmed;
  }

  if (typeof existing === 'boolean') {
    if (/^(true|yes)$/i.test(trimmed)) return true;
    if (/^(false|no)$/i.test(trimmed)) return false;
    return trimmed;
  }

  // Untyped values that look numeric are stored as numbers so downstream
  // consumers (HP bars, CR sorting) keep working.
  if (existing == null && trimmed.length && Number.isFinite(Number(trimmed))) {
    return Number(trimmed);
  }

  return trimmed;
}

/**
 * Writes `value` to `key` in the note's frontmatter.
 * `path` segments address nested values, e.g. `['actions', 0, 'desc']`.
 */
export async function writeStatblockValue(
  app: App,
  notePath: string,
  path: Array<string | number>,
  value: string,
): Promise<boolean> {
  const file = app.vault.getAbstractFileByPath(notePath);
  if (!(file instanceof TFile) || !path.length) return false;

  try {
    await app.fileManager.processFrontMatter(file, (frontmatter) => {
      let target: Record<string | number, unknown> = frontmatter;

      for (const segment of path.slice(0, -1)) {
        const next = target[segment];
        if (next == null || typeof next !== 'object') return;
        target = next as Record<string | number, unknown>;
      }

      const key = path[path.length - 1]!;
      target[key] = coerceToExisting(value, target[key]);
    });
    return true;
  } catch (error) {
    console.error('[Statblock] Failed to write value:', error);
    return false;
  }
}

/** True when the creature is backed by an editable note in this vault. */
export function isEditableNote(app: App, notePath: string | undefined): boolean {
  return Boolean(notePath) && app.vault.getAbstractFileByPath(notePath!) instanceof TFile;
}
