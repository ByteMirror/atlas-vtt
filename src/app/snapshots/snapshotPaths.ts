/** A scene's snapshots live next to its map file: `Cave.atlasmap` keeps them in `Cave.snapshots/`. */
export const snapshotFolderFor = (mapPath: string): string => `${mapPath.replace(/\.atlasmap$/, '')}.snapshots`;

export const snapshotFilePath = (folder: string, id: string): string => `${folder}/${id}.json`;

export const snapshotThumbnailPath = (folder: string, id: string): string => `${folder}/${id}.jpg`;

/** Whether `path` is a snapshot file inside a scene's snapshot folder. */
export const isSnapshotFilePath = (path: string): boolean => /\.snapshots\/[^/]+\.json$/.test(path);
