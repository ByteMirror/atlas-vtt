import { TFile, normalizePath, type App } from 'obsidian';
import { getFantasyStatblocksApi, resolveCreatureFromFence, resolveLayout, type FantasyStatblocksCreature } from './FantasyStatblocksService';
import { resolveStatblockNote } from './statblockNoteSource';
import type { TokenAsset } from './AssetService';

export type StatblockImportStatus = 'ready' | 'imported' | 'missing-image' | 'remote-image' | 'conflict';
export interface StatblockImportCandidate {
  path: string;
  name: string;
  status: StatblockImportStatus;
  detail: string;
  imagePath?: string;
  layoutName?: string;
  showRing?: boolean;
}

/** YAML interprets unquoted [[links]] as nested arrays. */
function imageReference(value: unknown): string | undefined {
  if (typeof value === 'string') return value.trim() || undefined;
  if (Array.isArray(value)) return value.flat(Infinity).find((item: unknown): item is string => typeof item === 'string' && Boolean(item.trim()))?.trim();
  return undefined;
}

function localImage(app: App, reference: string, sourcePath: string): TFile | null {
  const path = reference.replace(/^!?\[\[|\]\]$/g, '').split('|')[0]?.split('#')[0]?.trim();
  if (!path) return null;
  const resolved = app.metadataCache.getFirstLinkpathDest(path, sourcePath) ?? app.vault.getAbstractFileByPath(normalizePath(path));
  return resolved instanceof TFile && /^(png|jpe?g|webp|gif|bmp|svg|avif)$/i.test(resolved.extension) ? resolved : null;
}

export function requireResolvedBestiary(): FantasyStatblocksCreature[] {
  const api = getFantasyStatblocksApi();
  if (!api) throw new Error('Enable Fantasy Statblocks to import creatures.');
  if (!api.isResolved()) throw new Error('Fantasy Statblocks is still loading. Try scanning again in a moment.');
  return api.getBestiaryCreatures();
}

/** Identity is always the note path; a matching basename is not proof of a statblock. */
export async function statblockImportCandidate(
  app: App, file: TFile, assets: readonly TokenAsset[], bestiary: readonly FantasyStatblocksCreature[],
): Promise<StatblockImportCandidate | null> {
  const path = normalizePath(file.path);
  const entry = bestiary.find(creature => creature.path && normalizePath(creature.path) === path);
  const source = await resolveStatblockNote(app, file);
  if (!source && !entry) return null;
  const creature = source?.kind === 'codeblock'
    ? await resolveCreatureFromFence(app, source.params, path)
    : entry ?? app.metadataCache.getFileCache(file)?.frontmatter;
  const name = typeof creature?.name === 'string' && creature.name.trim() ? creature.name : file.basename;
  const requested = typeof creature?.layout === 'string' ? creature.layout :
    typeof creature?.statblock === 'string' && !['true', 'inline'].includes(creature.statblock) ? creature.statblock : undefined;
  const layout = resolveLayout(app, requested);
  const layoutName = requested ? (layout?.id === requested || layout?.name === requested ? layout.name : requested) : layout?.name ?? 'Unspecified';
  const row = { path, name, layoutName };
  const linked = assets.filter(asset => asset.statblockPath && normalizePath(asset.statblockPath) === path);
  if (linked.length > 1) return { ...row, status: 'conflict', detail: 'Multiple tokens already link to this note. Review their links first.' };
  const existing = linked[0];
  if (existing) return { ...row, status: 'imported', detail: 'An Atlas token already links to this note.', imagePath: existing.imagePath, showRing: existing.showRing !== false };
  if (!creature) return { ...row, status: 'conflict', detail: 'The statblock could not be resolved. Check its name or note reference.' };
  const image = imageReference(creature.image) ?? imageReference(creature['token-image']);
  if (!image) return { ...row, status: 'missing-image', detail: 'Add an image to this statblock to create a token.' };
  if (/^(?:[a-z][a-z0-9+.-]*:|\/\/)/i.test(image)) return { ...row, status: 'remote-image', detail: 'Save the image in your vault and link it from the statblock.' };
  const imageFile = localImage(app, image, path);
  if (!imageFile) return { ...row, status: 'missing-image', detail: 'The linked image is missing or its format is unsupported.' };
  return { ...row, status: 'ready', detail: 'Ready to create a linked token.', imagePath: imageFile.path };
}
