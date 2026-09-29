import { normalizePath, TFolder, type App } from 'obsidian';
import { collectionFolderPath, INVALID_NAME_CHARACTERS } from '../services/assetPaths';
import { DEFAULT_DICE_PACK } from './dicePack';

/**
 * Dice packs are folders: `pack.json` describing the set, beside the face sheets
 * it names. A collection keeps its own under `<collection>/dice/<pack>/`, so
 * they move, export and delete with it; they are not in the asset index. The
 * pack Atlas ships with lives in the plugin folder and is always available.
 */
export interface DicePackInfo {
  /** Folder name within the collection's dice folder; '' for the built-in pack. */
  id: string;
  /** The name in its `pack.json`, else its folder name. */
  name: string;
  /** Vault path of the pack's folder. */
  root: string;
  builtIn: boolean;
  /** A face sheet to show as the pack's picture, when it has one. */
  previewUrl: string | null;
}

const PACK_FILE_TYPES = /\.(json|png|jpe?g|webp)$/i;

export function collectionDiceFolder(collectionId: string): string {
  return `${collectionFolderPath(collectionId)}/dice`;
}

/** Atlas' plugin folder, where the built-in pack ships. */
function atlasPluginDir(app: App): string {
  const plugins = (app as App & { plugins?: { plugins?: Record<string, { manifest?: { dir?: string } }> } }).plugins;
  return plugins?.plugins?.['atlas-vtt']?.manifest?.dir ?? `${app.vault.configDir}/plugins/atlas-vtt`;
}

export function builtInPackRoot(app: App): string {
  return `${atlasPluginDir(app)}/dice/${DEFAULT_DICE_PACK}`;
}

/** Where a collection's chosen pack lives; the built-in pack when it chose none or its pack is gone. */
export async function resolvePackRoot(app: App, collectionId: string | null, packId: string | undefined): Promise<string | null> {
  if (collectionId && packId) {
    const root = `${collectionDiceFolder(collectionId)}/${packId}`;
    if (await app.vault.adapter.exists(`${root}/pack.json`)) return root;
  }
  return builtInPackRoot(app);
}

/** The built-in pack first, then the collection's own, by name. */
export async function listDicePacks(app: App, collectionId: string | null): Promise<DicePackInfo[]> {
  const packs: DicePackInfo[] = [];
  const builtIn = builtInPackRoot(app);
  if (await app.vault.adapter.exists(`${builtIn}/pack.json`)) {
    packs.push(await describePack(app, '', builtIn, true, 'Default'));
  }
  if (!collectionId) return packs;

  const folder = collectionDiceFolder(collectionId);
  if (!(await app.vault.adapter.exists(folder))) return packs;
  const own: DicePackInfo[] = [];
  for (const root of (await app.vault.adapter.list(folder)).folders) {
    if (!(await app.vault.adapter.exists(`${root}/pack.json`))) continue;
    const id = root.split('/').pop() ?? root;
    own.push(await describePack(app, id, root, false, id));
  }
  own.sort((a, b) => a.name.localeCompare(b.name));
  return [...packs, ...own];
}

async function describePack(app: App, id: string, root: string, builtIn: boolean, fallbackName: string): Promise<DicePackInfo> {
  let name = fallbackName;
  let sheet = 'd20_Numbers.png';
  try {
    const pack = JSON.parse(await app.vault.adapter.read(`${root}/pack.json`)) as {
      name?: string;
      dice?: Record<string, { texture?: string }>;
    };
    if (pack.name && !builtIn) name = pack.name;
    sheet = pack.dice?.d20?.texture ?? sheet;
  } catch {
    // Listed by folder name; the table falls back to plain dice.
  }
  const preview = `${root}/${sheet}`;
  const previewUrl = await app.vault.adapter.exists(preview) ? app.vault.adapter.getResourcePath(preview) : null;
  return { id, name, root, builtIn, previewUrl };
}

/**
 * Copies a pack folder picked in the file dialog into the collection. `files`
 * come from a directory input, so each carries its path within the picked
 * folder. Returns the new pack's id.
 */
export async function importDicePack(app: App, collectionId: string, files: readonly File[]): Promise<string> {
  const manifest = files.find((file) => relativePathOf(file).split('/').pop() === 'pack.json');
  if (!manifest) throw new Error('The folder has no pack.json');

  // Everything is taken relative to the folder holding pack.json.
  const base = relativePathOf(manifest).split('/').slice(0, -1);
  const pickedName = base[base.length - 1] || manifest.name.replace(/\.json$/i, '');
  const id = await freePackId(app, collectionId, safeFolderName(pickedName));
  const root = normalizePath(`${collectionDiceFolder(collectionId)}/${id}`);

  await ensureFolder(app, root);
  const prefix = base.join('/');
  for (const file of files) {
    const path = relativePathOf(file);
    if (prefix && !path.startsWith(`${prefix}/`)) continue;
    const inner = prefix ? path.slice(prefix.length + 1) : path;
    if (!PACK_FILE_TYPES.test(inner)) continue;
    const target = normalizePath(`${root}/${inner}`);
    await ensureFolder(app, target.split('/').slice(0, -1).join('/'));
    await app.vault.createBinary(target, await file.arrayBuffer());
  }
  return id;
}

/** Moves a collection's pack to the trash. */
export async function deleteDicePack(app: App, collectionId: string, packId: string): Promise<void> {
  const folder = app.vault.getAbstractFileByPath(normalizePath(`${collectionDiceFolder(collectionId)}/${packId}`));
  if (folder instanceof TFolder) await app.fileManager.trashFile(folder);
}

function relativePathOf(file: File): string {
  return (file as File & { webkitRelativePath?: string }).webkitRelativePath || file.name;
}

function safeFolderName(name: string): string {
  const cleaned = name.replace(new RegExp(INVALID_NAME_CHARACTERS.source, 'g'), '').trim();
  return cleaned || 'Dice pack';
}

async function freePackId(app: App, collectionId: string, name: string): Promise<string> {
  const folder = collectionDiceFolder(collectionId);
  let id = name;
  for (let n = 2; await app.vault.adapter.exists(`${folder}/${id}`); n++) id = `${name} ${n}`;
  return id;
}

async function ensureFolder(app: App, path: string): Promise<void> {
  if (!path || app.vault.getAbstractFileByPath(path)) return;
  const parent = path.split('/').slice(0, -1).join('/');
  if (parent) await ensureFolder(app, parent);
  if (!app.vault.getAbstractFileByPath(path)) await app.vault.createFolder(path);
}
