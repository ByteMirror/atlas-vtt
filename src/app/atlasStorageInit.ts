import type { App } from 'obsidian';

// App instance for storage adapter
let app: App | null = null;

/**
 * Initialize the storage adapter with the Obsidian app instance.
 * Must be called during plugin load before first use of any stores.
 */
export async function initializeAtlasStorage(appInstance: App): Promise<void> {
  // Guard: avoid double-initialisation in hot-reload dev sessions
  if (app) {
    return;
  }

  app = appInstance;
}

/**
 * Get the app instance for storage operations
 */
export function getStorageApp(): App | null {
  return app;
}