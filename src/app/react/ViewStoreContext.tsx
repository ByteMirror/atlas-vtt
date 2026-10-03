import React, { createContext, useContext, useSyncExternalStore } from 'react';
import { useStore, type StoreApi } from 'zustand';
import type { ViewAtlasState, ViewAtlasStore } from '../storeFactory';

const ViewStoreContext = createContext<ViewAtlasStore | null>(null);

/** What it takes to read a store and follow its changes. */
export type ReadableViewStore = Pick<StoreApi<ViewAtlasState>, 'getState' | 'subscribe'>;

const ReadableViewStoreContext = createContext<ReadableViewStore | null>(null);

/**
 * Lends a scene's store for reading to components outside its map view, such
 * as the player window's dice rolls, which show tokens of the presented scene.
 * Only `useOptionalAtlasStore` reads it: the hooks of a view's own store still
 * throw there, since nothing outside a view may edit its scene.
 */
export const ReadableViewStoreProvider: React.FC<{
  store: ReadableViewStore;
  children: React.ReactNode;
}> = ({ store, children }) => {
  return (
    <ReadableViewStoreContext.Provider value={store}>
      {children}
    </ReadableViewStoreContext.Provider>
  );
};

export const ViewStoreProvider: React.FC<{
  store: ViewAtlasStore;
  children: React.ReactNode;
}> = ({ store, children }) => {
  return (
    <ViewStoreContext.Provider value={store}>
      {children}
    </ViewStoreContext.Provider>
  );
};

/** The view's store instance, for imperative `getState()` / `subscribe()` access. */
export const useViewStoreHook = (): ViewAtlasStore => {
  const store = useContext(ViewStoreContext);
  if (!store) {
    throw new Error('useViewStoreHook must be used within a ViewStoreProvider');
  }
  return store;
};

/** Subscribes the component to a slice of the view's store. */
export const useAtlasStore = <T,>(selector: (state: ViewAtlasState) => T): T => {
  const store = useContext(ViewStoreContext);
  if (!store) {
    throw new Error('useAtlasStore must be used within a ViewStoreProvider');
  }
  return useStore(store, selector);
};

export const useViewStore = useAtlasStore;

const subscribeToNothing = (): (() => void) => () => {};

/**
 * Like `useAtlasStore`, for components that also render outside a map view, such as the global
 * asset manager. There it reads the store lent by `ReadableViewStoreProvider` and returns
 * `fallback` where none is lent.
 */
export const useOptionalAtlasStore = <T,>(selector: (state: ViewAtlasState) => T, fallback: T): T => {
  const viewStore = useContext(ViewStoreContext);
  const lentStore = useContext(ReadableViewStoreContext);
  const store: ReadableViewStore | null = viewStore ?? lentStore;
  return useSyncExternalStore(
    store ? store.subscribe : subscribeToNothing,
    () => (store ? selector(store.getState()) : fallback)
  );
};
