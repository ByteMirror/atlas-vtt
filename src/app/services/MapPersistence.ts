import type { PersistStorage, StorageValue } from 'zustand/middleware';
import { App, TFile } from 'obsidian';
import type { TokenEntity, TextElement, DrawingStroke } from '../types';
import { migrateWidgetsToCollection, needsWidgetMigration } from '../utils/widgetMigration';
import { normalizeImagePath } from '../utils/pathUtils';
import { fixMapTokenPaths } from '../utils/fixMapPaths';
import { getDataFilePath } from '../utils/dataFileMigration';
import { ensureFolder } from '../plugin/vaultFolders';

// Type definitions
export interface CameraState {
  x: number;
  y: number;
  scale: number;
}

export interface GridState {
  enabled: boolean;
  visible?: boolean; // Grid visibility (separate from enabled)
  snapToGrid?: boolean; // Whether tokens snap to grid
  type?: 'square' | 'hex-horizontal' | 'hex-vertical';
  size: number;
  offsetX: number;
  offsetY: number;
  color: string;
  opacity: number;
  scale?: number;
  mapScale?: number; // Scale factor used during grid alignment
  unitType?: 'feet' | 'meters' | 'units';
  unitDistance?: number;
  lineType?: 'solid' | 'dashed' | 'dotted'; // Grid line style
  lineWidth?: number; // Grid line width in pixels
  measurementType?: 'units' | 'abstract'; // Measurement system to use
}

import type { FogOperation } from '../types/fogTypes';

// Placeholder types until properly defined elsewhere
export type FogPatch = FogOperation;
export type Pin = any;

// Add constants for schema identification and versioning
export const ATLAS_SCHEMA = 'atlas-vtt' as const;
export const ATLAS_VERSION = 4;

/**
 * Defines the structure of the persisted .atlasmap file.
 */
export interface MapFile {
  schema: typeof ATLAS_SCHEMA;
  version: number; // bump on breaking change
  background: string | null;
  grid: GridState | null;
  objects: {
    tokens: Record<string, TokenEntity>;
    fog: Record<string, FogPatch>;
    pins: Record<string, Pin>;
    texts: Record<string, TextElement>;
    drawings: Record<string, DrawingStroke>;
    walls: Record<string, any>;
    lights: Record<string, any>;
  };
  camera: CameraState;
}

// Debounce helper
function debounce<T extends (...args: any[]) => any>(func: T, wait: number): T & { flush: () => void } {
  let timeout: number | null = null;
  let lastArgs: Parameters<T> | null = null;
  
  const debounced = (...args: Parameters<T>) => {
    lastArgs = args;
    if (timeout) window.clearTimeout(timeout);
    
    timeout = window.setTimeout(() => {
      timeout = null;
      if (lastArgs) {
        func(...lastArgs);
      }
    }, wait);
  };
  
  // Add flush method to force immediate execution
  debounced.flush = () => {
    if (timeout) {
      window.clearTimeout(timeout);
      timeout = null;
      if (lastArgs) {
        func(...lastArgs);
      }
    }
  };
  
  return debounced as T & { flush: () => void };
}

export type AtlasPersistStorage<S> = PersistStorage<S> & { flush: () => Promise<void> };

/**
 * Creates a Zustand PersistStorage adapter that reads/writes to the
 * current map file path stored in the provided store.
 *
 * Values are exchanged as objects, not strings: serialization only happens
 * inside the debounced save, so frequent store writes (drags, selection)
 * never pay for a full-map JSON.stringify.
 */
export function createAtlasStorage<T extends { mapPath: string | null }, S = unknown>(
  app: App, 
  store: { getState: () => T },
  plugin?: any
): AtlasPersistStorage<S> {
  // Create a map of debounced save functions per file path
  const debouncedSavers = new Map<string, ReturnType<typeof debounce>>();
  
  return {
    /**
     * Reads and parses the map file based on the current mapPath in the store.
     * Returns null if path is unset, the file is missing, or it is not valid JSON.
     */
    async getItem(name: string): Promise<StorageValue<S> | null> {
      // 'name' is unused here as we derive the path from the store state
      const mapPath = store.getState().mapPath;
      if (!mapPath) {
        console.warn('[AtlasStorage] getItem called with no mapPath set.');
        return null;
      }

      try {
        const mapFile = app.vault.getFileByPath(getDataFilePath(mapPath));
        if (!mapFile) {
          // Nothing persisted yet, which is expected for a new map
          return null;
        }
        const content = await app.vault.read(mapFile);
        // Attempt to parse to ensure it's valid JSON before returning
        try {
          let parsed = JSON.parse(content);
        
        // Check if widget migration is needed
        if (plugin && needsWidgetMigration(parsed)) {
          // Get collection ID from the map path (e.g., atlas-vtt/collections/default/maps/...)
          const pathParts = mapPath.split('/');
          const collectionIndex = pathParts.indexOf('collections');
          const collectionId = (collectionIndex >= 0 && pathParts[collectionIndex + 1]) ? pathParts[collectionIndex + 1] : 'default';
          
          try {
            parsed = await migrateWidgetsToCollection(plugin, parsed, collectionId!);
            // Save the migrated data back to the file
            const dataPath = getDataFilePath(mapPath);
            const fileToModify = app.vault.getAbstractFileByPath(dataPath);
            if (fileToModify instanceof TFile) {
              const serializedData = JSON.stringify(parsed);
              if (serializedData) {
                await app.vault.process(fileToModify, () => serializedData);
              }
            }
          } catch (error) {
            console.error(`[AtlasStorage] Error migrating widgets:`, error);
          }
        }
          
          // v3 → v4 migration: add walls and lights if missing
          if (parsed?.state?.objects && !parsed.state.objects.walls) {
            parsed.state.objects.walls = {};
          }
          if (parsed?.state?.objects && !parsed.state.objects.lights) {
            parsed.state.objects.lights = {};
          }
          if (parsed?.state?.version && parsed.state.version < 4) {
            parsed.state.version = 4;
          }

          // Verify the loaded data belongs to this map
          // This prevents loading stale data from wrong maps
          if (parsed?.state?.mapPath && parsed.state.mapPath !== mapPath) {
            console.warn(`[AtlasStorage] Loaded data has wrong mapPath. Expected: ${mapPath}, Got: ${parsed.state.mapPath}`);
            console.warn(`[AtlasStorage] Rejecting mismatched data to prevent cross-map contamination`);
            return null;
          }
          
          return parsed as StorageValue<S>;
        } catch (parseError) {
          console.error(`[AtlasStorage] Failed to parse JSON from ${mapPath}:`, parseError);
          return null; // Don't return corrupted data
        }
      } catch (error) {
        console.warn(`[AtlasStorage] Error reading map file ${mapPath}:`, error);
        // File might not exist yet, which is okay on first load/new map
        return null;
      }
    },

    /**
     * Schedules a debounced write of the persisted state to the current map file.
     */
    async setItem(name: string, value: StorageValue<S>): Promise<void> {
      // 'name' is unused
      const mapPath = store.getState().mapPath;
      if (!mapPath) {
        console.warn('[AtlasStorage] setItem called with no mapPath set.');
        return;
      }
      
      // Skip persistence for streamed maps
      if (mapPath.startsWith('streamed_')) {
        return;
      }

      // Get or create a debounced saver for this path
      if (!debouncedSavers.has(mapPath)) {
        const saveFunction = async (path: string, value: StorageValue<S>) => {
          try {
            const data = JSON.stringify(value);

            // Check if file exists
            const dataPath = getDataFilePath(path);
            
            await ensureFolder(app, dataPath.substring(0, dataPath.lastIndexOf('/')));

            const existingFile = app.vault.getAbstractFileByPath(dataPath);
            if (existingFile instanceof TFile) {
              await app.vault.process(existingFile, () => data);
            } else {
              // Create new file
              await app.vault.create(dataPath, data);
            }
          } catch (error) {
            console.error(`[AtlasStorage] Error writing map file ${path}:`, error);
          }
        };
        
        // Create debounced version with 500ms delay
        debouncedSavers.set(mapPath, debounce(saveFunction, 500));
      }
      
      // Call the debounced save function
      const debouncedSave = debouncedSavers.get(mapPath)!;
      debouncedSave(mapPath, value);
      
      // Clean up old debounced savers to prevent memory leaks
      // Keep only the most recent 5 map paths
      if (debouncedSavers.size > 5) {
        const pathsToKeep = new Set([mapPath]);
        const allPaths = Array.from(debouncedSavers.keys());
        // Keep the 4 most recently added (excluding current)
        for (let i = allPaths.length - 1; i >= 0 && pathsToKeep.size < 5; i--) {
          const path = allPaths[i];
          if (path) {
            pathsToKeep.add(path);
          }
        }
        // Remove old entries
        for (const path of allPaths) {
          if (!pathsToKeep.has(path)) {
            debouncedSavers.delete(path);
          }
        }
      }
    },

    /**
     * Required by StateStorage interface, but we don't need to delete maps this way.
     */
    async removeItem(name: string): Promise<void> {
      // 'name' is unused
      // No-op: We don't want Zustand deleting the map file via this mechanism.
    },
    
    /**
     * Flush any pending debounced saves immediately
     */
    async flush(): Promise<void> {
      // Flush ALL pending saves, not just the current map path
      // This is important when switching maps to ensure old map saves complete
      for (const [, debouncedSave] of debouncedSavers.entries()) {
        if (debouncedSave && typeof debouncedSave.flush === 'function') {
          debouncedSave.flush();
        }
      }
    },
  };
}


/**
 * Migrate tokens to use relative paths instead of app:// URLs
 */
function migrateTokenPaths(tokens: Record<string, TokenEntity>): Record<string, TokenEntity> {
  const migratedTokens: Record<string, TokenEntity> = {};
  
  for (const [id, token] of Object.entries(tokens)) {
    const migratedToken = { ...token };

    // Normalize the image path (handles app:// URLs and absolute paths)
    if (migratedToken.imagePath) {
      const normalizedPath = normalizeImagePath(migratedToken.imagePath);
      if (normalizedPath !== migratedToken.imagePath) {
        migratedToken.imagePath = normalizedPath;
      }
    }

    // Migrate legacy 'statuses' field to 'conditions'
    if ((migratedToken as any).statuses && !migratedToken.conditions) {
      migratedToken.conditions = (migratedToken as any).statuses;
      delete (migratedToken as any).statuses;
    }

    migratedTokens[id] = migratedToken;
  }
  
  return migratedTokens;
}

/**
 * Migrate legacy fog data to the new operation-based model.
 * Old format: `{ textureData: string, bounds: ... }` or an array of FogCircle/FogPolygon.
 * New format: `Record<string, FogOperation>`.
 */
function migrateFogData(fogData: unknown): Record<string, FogOperation> {
  if (!fogData || typeof fogData !== 'object') return {};

  // Legacy base64 texture format — cannot be converted, discard
  if ('textureData' in (fogData as Record<string, unknown>)) {
    return {};
  }

  // Legacy array format — cannot be converted, discard
  if (Array.isArray(fogData)) {
    return {};
  }

  // Already in the new keyed record format — validate and pass through
  const record = fogData as Record<string, unknown>;
  const firstValue = Object.values(record)[0];
  if (firstValue && typeof firstValue === 'object' && 'kind' in (firstValue as Record<string, unknown>) && (firstValue as Record<string, unknown>).kind === 'fog') {
    return record as Record<string, FogOperation>;
  }

  // Unknown format — discard
  return {};
}

/**
 * Migrate persisted state from older versions to current MapFile shape.
 */
export function migrateMapFile(persisted: any, version: number): MapFile {
  // Provide a base initial MapFile
  const initial: MapFile = {
    schema: ATLAS_SCHEMA,
    version: ATLAS_VERSION,
    background: null,
    grid: null,
    objects: {
      tokens: {},
      fog: {},
      pins: {},
      texts: {},
      drawings: {},
      walls: {},
      lights: {},
    },
    camera: { x: 0, y: 0, scale: 1 }
  };

  if (!persisted) return initial;
  
  // Fix any duplicated path segments first
  fixMapTokenPaths(persisted);
  // Migrate token paths from app:// URLs to relative paths
  const migratedTokens = persisted.objects?.tokens 
    ? migrateTokenPaths(persisted.objects.tokens)
    : {};
  
  // Merge persisted over initial, ensuring all fields present
  const result = {
    ...initial,
    ...persisted,
    schema: ATLAS_SCHEMA,
    version: ATLAS_VERSION,
    // Deeply merge nested objects
    objects: {
      tokens: migratedTokens,
      fog: migrateFogData(persisted.objects?.fog),
      pins: persisted.objects?.pins || {},
      texts: persisted.objects?.texts || {},
      drawings: persisted.objects?.drawings || {},
      walls: persisted.objects?.walls || {},
      lights: persisted.objects?.lights || {},
    },
    grid: persisted.grid || initial.grid,
    camera: persisted.camera || initial.camera
  };
  
  // Migrate legacy 'daggerheart' -> 'abstract'
  if ((result.grid?.measurementType as string) === 'daggerheart') {
    (result.grid as GridState).measurementType = 'abstract';
  }
  
  return result;
} 
