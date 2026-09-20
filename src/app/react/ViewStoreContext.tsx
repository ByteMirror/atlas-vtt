import React, { createContext, useContext } from 'react';
import type { ViewAtlasState } from '../storeFactory';

// The context will hold the Zustand store hook directly
const ViewStoreContext = createContext<any>(null);

export const ViewStoreProvider: React.FC<{
  store: any; // The return value from create()
  children: React.ReactNode;
}> = ({ store, children }) => {
  if (!store) {
    console.error('[ViewStoreProvider] Store is null or undefined!');
  }
  return (
    <ViewStoreContext.Provider value={store}>
      {children}
    </ViewStoreContext.Provider>
  );
};

// This returns the actual Zustand hook for direct access (if needed)
export const useViewStoreHook = () => {
  const store = useContext(ViewStoreContext);
  if (!store) {
    throw new Error('useViewStoreHook must be used within a ViewStoreProvider');
  }
  return store;
};

// Safe version that returns null if not in context (for use in popout windows)
export const useViewStoreHookSafe = () => {
  const store = useContext(ViewStoreContext);
  return store || null;
};

// Hook that uses the Zustand store hook from context with selector
export const useViewStore = <T,>(selector: (state: ViewAtlasState) => T): T => {
  const store = useContext(ViewStoreContext);
  
  if (!store) {
    console.error('[useViewStore] Store is null/undefined in context');
    throw new Error('useViewStore must be used within a ViewStoreProvider');
  }
  
  // Call the Zustand hook with the selector
  return store(selector);
};

// We need to create a stable reference to avoid hook issues

// Hook that uses the Zustand store hook from context
export const useAtlasStore = <T,>(selector: (state: ViewAtlasState) => T): T => {
  const store = useContext(ViewStoreContext);
  
  if (!store) {
    console.error('[useAtlasStore] Store is null/undefined in context');
    throw new Error('useAtlasStore must be used within a ViewStoreProvider');
  }
  
  // Call the Zustand hook directly
  return store(selector);
};