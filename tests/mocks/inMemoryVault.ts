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

/** Minimal `key: value` frontmatter, enough for the statblock fields the services read. */
export function parseFrontmatter(content: string): Record<string, unknown> | undefined {
  const match = /^---\n([\s\S]*?)\n---/.exec(content);
  if (!match) return undefined;
  const frontmatter: Record<string, unknown> = {};
  for (const line of (match[1] ?? '').split('\n')) {
    const colon = line.indexOf(':');
    if (colon > 0) frontmatter[line.slice(0, colon).trim()] = line.slice(colon + 1).trim().replace(/^"|"$/g, '');
  }
  return frontmatter;
}

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
  /** A folder handle whose `children` list what lies directly inside it, as Obsidian's does. */
  const folderAt = (path: string): TFolder => {
    const folder = new TFolder(path);
    const inside = (candidate: string): boolean => parentOf(candidate) === path;
    folder.children = [
      ...[...folders].filter(inside).map((child) => new TFolder(child)),
      ...[...files.keys()].filter(inside).map((child) => new TFile(child)),
    ];
    return folder;
  };
  /** Moves a file, or a folder with everything inside it. */
  const move = (from: string, to: string): void => {
    assertFree(to);
    const moved = (path: string): string => to + path.slice(from.length);
    const within = (path: string): boolean => path === from || path.startsWith(`${from}/`);
    for (const path of [...files.keys()].filter(within)) {
      writeFile(moved(path), files.get(path) ?? '');
      files.delete(path);
    }
    for (const path of [...folders].filter(within)) {
      folders.delete(path);
      folders.add(moved(path));
    }
    addParentFolders(to);
  };

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
      writeBinary: vi.fn(async (path: string, content: ArrayBuffer) => writeFile(path, new TextDecoder().decode(content))),
      readBinary: vi.fn(async (path: string) => new TextEncoder().encode(files.get(path) ?? '').buffer),
      remove: vi.fn(async (path: string) => { files.delete(path); }),
    },
    getFiles: vi.fn(() => Array.from(files.keys()).filter((path) => !isHiddenPath(path)).map((path) => new TFile(path))),
    getAbstractFileByPath: vi.fn((path: string): TAbstractFile | null => {
      if (isHiddenPath(path)) return null;
      if (files.has(path)) return new TFile(path);
      if (folders.has(path)) return folderAt(path);
      return null;
    }),
    getFileByPath: vi.fn((path: string): TFile | null => (files.has(path) && !isHiddenPath(path) ? new TFile(path) : null)),
    getFolderByPath: vi.fn((path: string): TFolder | null => (folders.has(path) && !isHiddenPath(path) ? folderAt(path) : null)),
    rename: vi.fn(async (file: TAbstractFile, newPath: string) => move(file.path, newPath)),
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
    renameFile: vi.fn(async (file: TAbstractFile, newPath: string) => {
      const content = files.get(file.path);
      if (content === undefined) return;
      files.delete(file.path);
      writeFile(newPath, content);
    }),
    trashFile: vi.fn(async (file: TAbstractFile) => {
      const within = (path: string): boolean => path === file.path || path.startsWith(`${file.path}/`);
      for (const path of [...files.keys()].filter(within)) files.delete(path);
      for (const path of [...folders].filter(within)) folders.delete(path);
    }),
    processFrontMatter: vi.fn(async (file: TFile, fn: (frontmatter: Record<string, unknown>) => void) => {
      const content = files.get(file.path) ?? '';
      const frontmatter = parseFrontmatter(content) ?? {};
      fn(frontmatter);
      const body = content.replace(/^---\n[\s\S]*?\n---\n?/, '');
      const yaml = Object.entries(frontmatter).map(([key, value]) => `${key}: ${String(value)}`).join('\n');
      files.set(file.path, `---\n${yaml}\n---\n${body}`);
    }),
  };

  app.workspace = {
    getLeavesOfType: vi.fn(() => []),
    on: vi.fn(() => ({})),
    offref: vi.fn(),
    trigger: vi.fn(),
  };

  app.metadataCache = {
    on: vi.fn(() => ({})),
    offref: vi.fn(),
    getFileCache: vi.fn(() => null),
    getFirstLinkpathDest: vi.fn((linkpath: string): TFile | null => {
      const path = [...files.keys()].find((candidate) => candidate === linkpath || candidate.endsWith(`/${linkpath}`));
      return path ? new TFile(path) : null;
    }),
  };

  return { app, files, folders };
}
