import { Component, type App } from 'obsidian';
import type { StatblockLayout } from '../react/components/statblock/statblockTypes';

const FANTASY_STATBLOCKS_PLUGIN_ID = 'obsidian-5e-statblocks';

/**
 * Minimal surface of the public API exposed by the Fantasy Statblocks plugin
 * (`obsidian-5e-statblocks`) on `window.FantasyStatblocks`.
 */
export interface FantasyStatblocksApi {
  render(creature: { name: string }, el: HTMLElement, display?: string): Component;
  getBestiaryCreatures(): FantasyStatblocksCreature[];
  getBestiaryNames(): string[];
  hasCreature(name: string): boolean;
  getCreatureFromBestiary(name: string): FantasyStatblocksCreature | null;
  isResolved(): boolean;
  onResolved(callback: () => void): void;
  /** Fires whenever the bestiary is re-parsed, e.g. after a note is edited. */
  onUpdated(callback: () => void): void;
}

export interface FantasyStatblocksCreature {
  name: string;
  /** Vault path of the note the creature was parsed from, if file-based. */
  path?: string;
  [key: string]: unknown;
}

export function getFantasyStatblocksApi(): FantasyStatblocksApi | null {
  return (window as Window & { FantasyStatblocks?: FantasyStatblocksApi }).FantasyStatblocks ?? null;
}

export function isFantasyStatblocksAvailable(): boolean {
  return getFantasyStatblocksApi() !== null;
}

/** Layout manager exposed on the Fantasy Statblocks plugin instance. */
interface LayoutManager {
  getLayout(id: string): StatblockLayout | null;
  getAllLayouts(): StatblockLayout[];
  getDefaultLayout(): StatblockLayout;
}

function getLayoutManager(app: App): LayoutManager | null {
  const plugin = (app as App & { plugins?: { plugins?: Record<string, { manager?: LayoutManager }> } })
    .plugins?.plugins?.[FANTASY_STATBLOCKS_PLUGIN_ID];
  return plugin?.manager ?? null;
}

/** Resolves a layout by name or id, falling back to the configured default. */
export function resolveLayout(app: App, nameOrId?: string): StatblockLayout | null {
  const manager = getLayoutManager(app);
  if (!manager) return null;

  if (nameOrId) {
    const match =
      manager.getAllLayouts().find((layout) => layout.name === nameOrId || layout.id === nameOrId) ??
      manager.getLayout(nameOrId);
    if (match) return match;
  }
  return manager.getDefaultLayout() ?? null;
}

/** The layout a creature should render with, honouring its own override. */
export function layoutForCreature(
  app: App,
  creature: FantasyStatblocksCreature,
): StatblockLayout | null {
  const requested =
    (typeof creature.layout === 'string' && creature.layout) ||
    (typeof creature.statblock === 'string' && creature.statblock) ||
    undefined;
  return resolveLayout(app, requested);
}

/**
 * Resolves a bestiary creature from a linked note path, falling back to
 * matching the note basename against creature names.
 */
export function findCreatureForNotePath(notePath: string): FantasyStatblocksCreature | null {
  const api = getFantasyStatblocksApi();
  if (!api) return null;

  const byPath = api.getBestiaryCreatures().find((creature) => creature.path === notePath);
  if (byPath) return byPath;

  const basename = notePath.split('/').pop()?.replace(/\.md$/, '') ?? '';
  return basename && api.hasCreature(basename) ? api.getCreatureFromBestiary(basename) : null;
}


/**
 * Builds the creature a ```statblock fence describes, mirroring Fantasy
 * Statblocks' own resolution order: a named bestiary creature underneath, the
 * referenced note's frontmatter over that, and the fence's own params on top.
 */
export async function resolveCreatureFromFence(
  app: App,
  params: Record<string, unknown>,
  sourcePath: string,
): Promise<FantasyStatblocksCreature | null> {
  const api = getFantasyStatblocksApi();
  if (!api) return null;

  const named = params.creature ?? params.monster;
  const base =
    typeof named === 'string' && api.hasCreature(named)
      ? api.getCreatureFromBestiary(named)
      : null;

  let fromNote: Record<string, unknown> = {};
  const note: unknown = Array.isArray(params.note) ? params.note.flat(Infinity).pop() : params.note;
  if (typeof note === 'string' && note.length) {
    const linkpath = note.replace(/(^\[\[|\]\]$)/g, '').split('|')[0] ?? '';
    const file = app.metadataCache.getFirstLinkpathDest(linkpath, sourcePath);
    if (file) {
      fromNote = (app.metadataCache.getFileCache(file)?.frontmatter ?? {});
    }
  }

  const creature = { ...(base ?? {}), ...fromNote, ...params } as FantasyStatblocksCreature;
  return creature.name ? creature : null;
}
