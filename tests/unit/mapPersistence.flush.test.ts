import { afterEach, describe, expect, it, vi } from 'vitest';
import { createAtlasStorage } from '../../src/app/services/MapPersistence';
import { createInMemoryApp } from '../mocks/inMemoryVault';

const path = 'maps/cave.atlasmap';
function deferred() {
  let resolve!: () => void;
  const promise = new Promise<void>(done => { resolve = done; });
  return { promise, resolve };
}

afterEach(() => { vi.useRealTimers(); vi.restoreAllMocks(); });

describe('map save flushing', () => {
  it.each([false, true])('waits for the file write before closing, already started: %s', async (alreadyStarted) => {
    vi.useFakeTimers();
    const { app, files } = createInMemoryApp({ files: { [path]: '{}' } });
    const started = deferred();
    const release = deferred();
    const process = vi.mocked(app.vault.process).getMockImplementation()!;
    vi.spyOn(app.vault, 'process').mockImplementation(async (file, change) => {
      started.resolve();
      await release.promise;
      return process(file, change);
    });
    const storage = createAtlasStorage(app, { getState: () => ({ mapPath: path }) });
    await storage.setItem('atlas', { state: { revision: 1 }, version: 4 });
    if (alreadyStarted) await vi.advanceTimersByTimeAsync(500);
    let finished = false;
    const flushing = storage.flush().then(() => { finished = true; });
    try {
      await started.promise;
      await Promise.resolve();
      expect(finished).toBe(false);
    } finally { release.resolve(); await flushing; }
    expect(JSON.parse(files.get(path)!)).toEqual({ state: { revision: 1 }, version: 4 });
  });

  it('serializes saves so a slow older write cannot replace a newer snapshot', async () => {
    vi.useFakeTimers();
    const { app, files } = createInMemoryApp({ files: { [path]: '{}' } });
    const started = deferred();
    const release = deferred();
    const process = vi.mocked(app.vault.process).getMockImplementation()!;
    const spy = vi.spyOn(app.vault, 'process').mockImplementationOnce(async (file, change) => {
      started.resolve();
      await release.promise;
      return process(file, change);
    });
    const storage = createAtlasStorage(app, { getState: () => ({ mapPath: path }) });
    await storage.setItem('atlas', { state: { revision: 1 }, version: 4 });
    await vi.advanceTimersByTimeAsync(500);
    await started.promise;
    await storage.setItem('atlas', { state: { revision: 2 }, version: 4 });
    const flushing = storage.flush();
    try {
      await vi.advanceTimersByTimeAsync(0);
      expect(spy).toHaveBeenCalledTimes(1);
    } finally { release.resolve(); await flushing; }
    expect(JSON.parse(files.get(path)!).state.revision).toBe(2);
  });

  it('does not recreate a map under its old name when it is renamed while a save waits', async () => {
    vi.useFakeTimers();
    const renamed = 'maps/cavern.atlasmap';
    const { app, files } = createInMemoryApp({ files: { [path]: '{}' } });
    const state = { mapPath: path };
    const storage = createAtlasStorage(app, { getState: () => state });

    await storage.setItem('atlas', { state: { revision: 1 }, version: 4 });
    await app.vault.rename(app.vault.getFileByPath(path)!, renamed);
    state.mapPath = renamed;
    await vi.advanceTimersByTimeAsync(500);

    expect(files.has(path)).toBe(false);
    expect(files.has(renamed)).toBe(true);
  });

  it('still creates the file of a new map on its first save', async () => {
    vi.useFakeTimers();
    const { app, files } = createInMemoryApp();
    const storage = createAtlasStorage(app, { getState: () => ({ mapPath: path }) });

    await storage.setItem('atlas', { state: { revision: 1 }, version: 4 });
    await vi.advanceTimersByTimeAsync(500);

    expect(JSON.parse(files.get(path)!)).toEqual({ state: { revision: 1 }, version: 4 });
  });
});
