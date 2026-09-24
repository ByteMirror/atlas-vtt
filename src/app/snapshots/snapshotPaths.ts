/** Dot-folder beside the maps of a folder; Obsidian does not index it. */
export const SNAPSHOTS_DIR = '.snapshots';

/** The folder a vault path lives in, '' for the vault root. */
export const parentFolderOf = (path: string): string => path.slice(0, Math.max(0, path.lastIndexOf('/')));

/**
 * A scene's snapshots live in a hidden folder beside its map file:
 * `scenes/Cave.atlasmap` keeps them in `scenes/.snapshots/Cave/`. They never
 * show up in the file explorer or the asset manager, yet stay inside the
 * collection folder, so they move with it.
 */
export function snapshotFolderFor(mapPath: string): string {
  const folder = parentFolderOf(mapPath);
  const name = mapPath.slice(mapPath.lastIndexOf('/') + 1).replace(/\.atlasmap$/, '');
  return `${folder ? `${folder}/` : ''}${SNAPSHOTS_DIR}/${name}`;
}

export const snapshotFilePath = (folder: string, id: string): string => `${folder}/${id}.json`;

export const snapshotThumbnailPath = (folder: string, id: string): string => `${folder}/${id}.jpg`;
