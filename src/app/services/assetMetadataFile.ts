import type { DataAdapter } from 'obsidian';
import type { AssetMetadata } from './AssetService';
import { isAssetMetadata, isLegacyAssetMetadata, type LegacyAssetMetadata } from './assetMetadataGuards';

/** What the asset index file on disk holds. */
export type StoredMetadata =
  | { kind: 'missing' }
  | { kind: 'current'; metadata: AssetMetadata }
  | { kind: 'legacy'; metadata: LegacyAssetMetadata }
  | { kind: 'unreadable'; path: string; error: unknown };

export interface ReadOptions {
  /** Further reads of a file that exists but cannot be used, e.g. while a sync tool rewrites it. */
  retries: number;
  retryDelayMs: number;
}

const wait = (ms: number): Promise<void> => new Promise((resolve) => window.setTimeout(resolve, ms));

/** Reads and parses the first of `paths` that exists, reading it again a few times before calling it unreadable. */
export async function readStoredMetadata(adapter: DataAdapter, paths: readonly string[], options: ReadOptions): Promise<StoredMetadata> {
  let path: string | undefined;
  for (const candidate of paths) {
    if (await adapter.exists(candidate)) {
      path = candidate;
      break;
    }
  }
  if (!path) return { kind: 'missing' };

  let error: unknown;
  for (let attempt = 0; attempt <= options.retries; attempt++) {
    if (attempt > 0) await wait(options.retryDelayMs);
    try {
      const parsed: unknown = JSON.parse(await adapter.read(path));
      if (isAssetMetadata(parsed)) return { kind: 'current', metadata: parsed };
      if (isLegacyAssetMetadata(parsed)) return { kind: 'legacy', metadata: parsed };
      error = new Error('The file does not hold an asset index');
    } catch (readError) {
      error = readError;
    }
  }
  return { kind: 'unreadable', path, error };
}

/** Copies an unreadable index next to itself, so rebuilding the index never destroys it. Returns the copy's path. */
export async function preserveUnreadableMetadata(adapter: DataAdapter, path: string, now = new Date()): Promise<string> {
  const stamp = now.toISOString().replace(/[:.]/g, '-');
  const copyPath = path.replace(/\.json$/, `.unreadable-${stamp}.json`);
  await adapter.copy(path, copyPath);
  return copyPath;
}
