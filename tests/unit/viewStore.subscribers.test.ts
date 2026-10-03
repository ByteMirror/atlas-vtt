import { afterEach, describe, expect, it, vi } from 'vitest';
import { createInMemoryApp } from '../mocks/inMemoryVault';
import { createViewAtlasStore, type ViewAtlasState, type ViewAtlasStore } from '../../src/app/storeFactory';

function createStore(): { store: ViewAtlasStore; logged: ReturnType<typeof vi.spyOn> } {
  const logged = vi.spyOn(console, 'error').mockImplementation(() => {});
  return { store: createViewAtlasStore(createInMemoryApp().app, 'subscribers-test'), logged };
}

afterEach(() => vi.restoreAllMocks());

describe('a view store subscriber that throws', () => {
  it('does not stop the write, nor the subscribers after it from seeing the new state', () => {
    const { store } = createStore();
    const seen: Array<string | null> = [];
    store.subscribe((state) => state.dmNotePath, () => { throw new TypeError("Cannot read properties of null (reading 'x')"); });
    store.subscribe((state: ViewAtlasState, previous: ViewAtlasState) => {
      if (state.dmNotePath !== previous.dmNotePath) seen.push(state.dmNotePath);
    });

    expect(() => store.getState().setDMNotePath('notes/a.md')).not.toThrow();

    expect(seen).toEqual(['notes/a.md']);
    expect(store.getState().dmNotePath).toBe('notes/a.md');
  });

  it('is logged once per error message, not on every write and never silently', () => {
    const { store, logged } = createStore();
    let message = 'renderer lost its sprite';
    store.subscribe((state) => state.dmNotePath, () => { throw new Error(message); });

    store.getState().setDMNotePath('notes/a.md');
    store.getState().setDMNotePath('notes/b.md');
    expect(logged).toHaveBeenCalledTimes(1);
    expect(logged.mock.calls[0]?.[1]).toEqual(new Error('renderer lost its sprite'));

    message = 'another fault';
    store.getState().setDMNotePath('notes/c.md');
    expect(logged).toHaveBeenCalledTimes(2);
  });

  it('still unsubscribes', () => {
    const { store } = createStore();
    const listener = vi.fn();
    const unsubscribe = store.subscribe((state) => state.dmNotePath, listener);

    unsubscribe();
    store.getState().setDMNotePath('notes/a.md');

    expect(listener).not.toHaveBeenCalled();
  });
});
