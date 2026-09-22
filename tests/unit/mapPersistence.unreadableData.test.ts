import { describe, expect, it, vi } from 'vitest';
import type { TFile } from 'obsidian';
import { createInMemoryApp } from '../mocks/inMemoryVault';
import { createAtlasStorage } from '../../src/app/services/MapPersistence';

const MAP_PATH = 'maps/cave.atlasmap';

function createStorage(content: string): {
  storage: ReturnType<typeof createAtlasStorage>;
  files: Map<string, string>;
} {
  const { app, files } = createInMemoryApp({ files: { [MAP_PATH]: content } });
  app.vault.getFileByPath = app.vault.getAbstractFileByPath;
  app.vault.copy = vi.fn(async (file: TFile, newPath: string) => {
    files.set(newPath, files.get(file.path) ?? '');
    return file;
  });
  return { storage: createAtlasStorage(app, { getState: () => ({ mapPath: MAP_PATH }) }), files };
}

function backupsOf(files: Map<string, string>): string[] {
  return [...files.keys()].filter((path) => path.startsWith(`${MAP_PATH}.`) && path.endsWith('.bak'));
}

describe('map data that cannot be loaded', () => {
  it.each([
    ['invalid JSON', '{"state": {"objects": '],
    ['an unexpected structure', JSON.stringify({ version: 4, state: { objects: { tokens: ['not', 'a', 'record'] } } })],
  ])('keeps a copy of a file with %s before the empty store can replace it', async (_label, content) => {
    const { storage, files } = createStorage(content);

    expect(await storage.getItem('atlas')).toBeNull();

    const backups = backupsOf(files);
    expect(backups).toHaveLength(1);
    expect(files.get(backups[0]!)).toBe(content);
  });

  it('does not back up data it can load', async () => {
    const { storage, files } = createStorage(JSON.stringify({ version: 4, state: { mapPath: MAP_PATH, objects: { tokens: {} } } }));

    expect(await storage.getItem('atlas')).not.toBeNull();
    expect(backupsOf(files)).toHaveLength(0);
  });
});
