import { vi } from 'vitest';
import { App, TFile, TFolder, type TAbstractFile } from 'obsidian';

export interface InMemoryVaultSeed {
  /** Vault-relative path → text content. */
  files?: Record<string, string>;
  folders?: string[];
}

export interface InMemoryApp {
  app: App;
  files: Map<string, string>;
  folders: Set<string>;
}

const ALREADY_EXISTS = 'File already exists.';

const parentOf = (path: string): string => path.slice(0, path.lastIndexOf('/'));

/** Obsidian does not index dot-folders, so they are only reachable through the adapter. */
const isHiddenPath = (path: string): boolean => path.split('/').some((segment) => segment.startsWith('.'));

/**
 * An Obsidian `App` backed by an in-memory file map. Covers the vault, adapter,
 * file manager and metadata cache calls the services under test make; every
 * method is a spy so tests can assert on it.
 */
export function createInMemoryApp(seed: InMemoryVaultSeed = {}): InMemoryApp {
  const files = new Map<string, string>(Object.entries(seed.files ?? {}));
  const folders = new Set<string>(['atlas-vtt', ...(seed.folders ?? [])]);

  const addParentFolders = (path: string): void => {
    for (let parent = parentOf(path); parent; parent = parentOf(parent)) {
      folders.add(parent);
    }
  };
  const assertFree = (path: string): void => {
    if (files.has(path) || folders.has(path)) throw new Error(ALREADY_EXISTS);
  };
  const writeFile = (path: string, content: string): void => {
    addParentFolders(path);
    files.set(path, content);
  };

  for (const path of files.keys()) addParentFolders(path);

  const app = new App();

  app.vault = {
    adapter: {
      exists: vi.fn(async (path: string) => files.has(path) || folders.has(path)),
      mkdir: vi.fn(async (path: string) => {
        assertFree(path);
        addParentFolders(path);
        folders.add(path);
      }),
      write: vi.fn(async (path: string, content: string) => writeFile(path, content)),
      read: vi.fn(async (path: string) => files.get(path) ?? ''),
    },
    getFiles: vi.fn(() => Array.from(files.keys(), (path) => new TFile(path))),
    getAbstractFileByPath: vi.fn((path: string): TAbstractFile | null => {
      if (isHiddenPath(path)) return null;
      if (files.has(path)) return new TFile(path);
      if (folders.has(path)) return new TFolder(path);
      return null;
    }),
    getFolderByPath: vi.fn((path: string): TFolder | null => (folders.has(path) && !isHiddenPath(path) ? new TFolder(path) : null)),
    createFolder: vi.fn(async (path: string) => {
      assertFree(path);
      folders.add(path);
    }),
    create: vi.fn(async (path: string, content: string) => {
      assertFree(path);
      writeFile(path, content);
    }),
    process: vi.fn(async (file: TFile, fn: (data: string) => string) => {
      files.set(file.path, fn(files.get(file.path) ?? ''));
    }),
    read: vi.fn(async (file: TFile) => files.get(file.path) ?? ''),
    readBinary: vi.fn(async (file: TFile) => new TextEncoder().encode(files.get(file.path) ?? '').buffer),
    createBinary: vi.fn(async (path: string, content: ArrayBuffer) => {
      assertFree(path);
      writeFile(path, new TextDecoder().decode(content));
      return new TFile(path);
    }),
    modifyBinary: vi.fn(async (file: TFile, content: ArrayBuffer) => {
      files.set(file.path, new TextDecoder().decode(content));
    }),
  };

  app.fileManager = {
    trashFile: vi.fn(async (file: TAbstractFile) => {
      files.delete(file.path);
      folders.delete(file.path);
    }),
  };

  app.metadataCache = {
    on: vi.fn(() => ({})),
    offref: vi.fn(),
    getFileCache: vi.fn(() => null),
  };

  return { app, files, folders };
}
