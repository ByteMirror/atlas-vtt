import type { PersistStorage, StorageValue } from 'zustand/middleware';
import { App, Notice, TFile } from 'obsidian';
import type { TokenEntity, TextElement, DrawingStroke, NotePin } from '../types';
import type { WallSegment, LightSource } from '../types/wallTypes';
import type { WidgetSettings } from '../types/widgetTypes';
import type AtlasVTTPlugin from '../../../main';
import { debounce, type DebouncedFunction } from '../../utils/debounce';
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
  /** Hex colour of the grid lines. Unset lets the grid pick black or white from the map's brightness. */
  color?: string;
  opacity: number;
  scale?: number;
  mapScale?: number; // Scale factor used during grid alignment
  unitType?: 'feet' | 'meters' | 'units';
  unitDistance?: number;
  lineType?: 'solid' | 'dashed' | 'dotted'; // Grid line style
  lineWidth?: number; // Grid line width in pixels
  measurementType?: 'units' | 'abstract'; // Measurement system to use
  /** Set on new scenes: align the grid to the map image on the first load, then cleared. */
  autoDetect?: boolean;
}

import type { FogOperation } from '../types/fogTypes';

// Placeholder types until properly defined elsewhere
export type FogPatch = FogOperation;
export type Pin = NotePin;

// Add constants for schema identification and versioning
export const ATLAS_SCHEMA = 'atlas-vtt' as const;
export const ATLAS_VERSION = 4;

/**
 * Defines the structure of the persisted .atlasmap file.
 */
export interface MapFile {
  schema: typeof ATLAS_SCHEMA;
  version: number; // bump on breaking change
  /** Human-readable map name, written when the map is created (absent in older files) */
  name?: string;
  background: string | null;
  grid: GridState | null;
  objects: {
    tokens: Record<string, TokenEntity>;
    fog: Record<string, FogPatch>;
    pins: Record<string, Pin>;
    texts: Record<string, TextElement>;
    drawings: Record<string, DrawingStroke>;
    walls: Record<string, WallSegment>;
    lights: Record<string, LightSource>;
  };
  camera: CameraState;
}

/** A token as found in older map files, where conditions were still called `statuses`. */
export type LegacyToken = TokenEntity & { statuses?: string[] };

/** Grid settings as found in older map files ('daggerheart' was renamed to 'abstract'). */
export type LegacyGridState = Omit<GridState, 'measurementType'> & {
  measurementType?: NonNullable<GridState['measurementType']> | 'daggerheart';
};

/**
 * Map data as read from disk before migration: any field may be missing and
 * some still use an older format.
 */
export interface LegacyMapFile extends Partial<Omit<MapFile, 'objects' | 'grid' | 'camera'>> {
  grid?: LegacyGridState | null;
  camera?: CameraState | null;
  objects?: (Partial<Omit<MapFile['objects'], 'tokens' | 'fog'>> & {
    tokens?: Record<string, LegacyToken>;
    /** Validated separately by `migrateFogData`; several incompatible formats existed. */
    fog?: unknown;
  }) | null;
}

/** The zustand `persist` envelope as stored in the map data file, before migration. */
export interface PersistedMapEnvelope {
  version?: number;
  state?: LegacyMapFile & {
    mapPath?: string | null;
    widgetSettings?: Partial<WidgetSettings>;
    widgetValues?: Record<string, number>;
  };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function isOptionalRecord(value: unknown): boolean {
  return value === undefined || value === null || isRecord(value);
}

/**
 * Trust boundary for parsed map JSON: checks that the containers the migrations
 * walk into are objects. Field-level upgrades are left to `migrateMapFile`.
 */
export function isLegacyMapFile(value: unknown): value is LegacyMapFile {
  if (!isRecord(value)) return false;
  const { objects, grid, camera } = value;
  if (!isOptionalRecord(objects) || !isOptionalRecord(camera) || !isOptionalRecord(grid)) return false;
  return !isRecord(objects) || isOptionalRecord(objects.tokens);
}

/** Trust boundary for the persisted envelope (`{ state, version }`) read from a map data file. */
export function isPersistedMapEnvelope(value: unknown): value is PersistedMapEnvelope {
  if (!isRecord(value)) return false;
  const { state, version } = value;
  if (version !== undefined && typeof version !== 'number') return false;
  return state === undefined || isLegacyMapFile(state);
}

/**
 * Keeps a copy of a map data file that cannot be loaded. The store starts empty in
 * that case and its next save replaces the file, which would otherwise destroy
 * whatever the user could still have recovered from it.
 */
async function preserveUnreadableMapData(app: App, file: TFile, reason: string): Promise<void> {
  const backupPath = `${file.path}.${Date.now()}.bak`;
  try {
    await app.vault.copy(file, backupPath);
    new Notice(`Atlas VTT could not read ${file.name} (${reason}). A copy was kept at ${backupPath}.`, 0);
  } catch (error) {
    console.error(`[AtlasStorage] Could not back up ${file.path}:`, error);
  }
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
  plugin?: AtlasVTTPlugin
): AtlasPersistStorage<S> {
  const pendingWrites = new Map<string, Promise<void>>();
  // Create a map of debounced save functions per file path
  const debouncedSavers = new Map<string, DebouncedFunction<[path: string, value: StorageValue<S>]>>();
  
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
          const raw: unknown = JSON.parse(content);
          if (!isPersistedMapEnvelope(raw)) {
            console.error(`[AtlasStorage] Map data in ${mapPath} has an unexpected structure`);
            await preserveUnreadableMapData(app, mapFile, 'unexpected structure');
            return null;
          }
          let parsed = raw;

          if (plugin && needsWidgetMigration(parsed)) {
            try {
              parsed = migrateWidgetsToCollection(parsed);
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
          const state = parsed.state;
          if (state?.objects && !state.objects.walls) {
            state.objects.walls = {};
          }
          if (state?.objects && !state.objects.lights) {
            state.objects.lights = {};
          }
          if (state?.version && state.version < ATLAS_VERSION) {
            state.version = ATLAS_VERSION;
          }
          // The state was upgraded in place above. zustand discards any state whose
          // envelope version differs from the store's, which would load the map empty.
          if (parsed.version !== undefined && parsed.version < ATLAS_VERSION) {
            parsed.version = ATLAS_VERSION;
          }

          // Verify the loaded data belongs to this map
          // This prevents loading stale data from wrong maps
          if (state?.mapPath && state.mapPath !== mapPath) {
            console.warn(`[AtlasStorage] Loaded data has wrong mapPath. Expected: ${mapPath}, Got: ${state.mapPath}`);
            console.warn(`[AtlasStorage] Rejecting mismatched data to prevent cross-map contamination`);
            return null;
          }

          // Validated above; `S` is the caller's view of the same persisted envelope.
          return parsed as StorageValue<S>;
        } catch (parseError) {
          console.error(`[AtlasStorage] Failed to parse JSON from ${mapPath}:`, parseError);
          await preserveUnreadableMapData(app, mapFile, 'invalid JSON');
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
        const saveFunction = async (path: string, value: StorageValue<S>): Promise<void> => {
          try {
            const data = JSON.stringify(value);

            // Check if file exists
            const dataPath = getDataFilePath(path);
            
            await ensureFolder(app, dataPath.substring(0, dataPath.lastIndexOf('/')));

            const existingFile = app.vault.getAbstractFileByPath(dataPath);
            if (existingFile instanceof TFile) {
              await app.vault.process(existingFile, () => data);
            } else if (store.getState().mapPath === path) {
              await app.vault.create(dataPath, data);
            }
            // Otherwise the map was renamed while this save waited; the store has
            // already scheduled its state for the new path, so recreating the old
            // file would only leave a stale copy under the old name.
          } catch (error) {
            console.error(`[AtlasStorage] Error writing map file ${path}:`, error);
          }
        };
        
        // Create debounced version with 500ms delay
        debouncedSavers.set(mapPath, debounce((path, snapshot) => {
          // Preserve snapshot order even when a previous disk write is still running.
          const previous = pendingWrites.get(path) ?? Promise.resolve();
          const write = previous.then(() => saveFunction(path, snapshot));
          pendingWrites.set(path, write);
          void write.then(() => {
            if (pendingWrites.get(path) === write) pendingWrites.delete(path);
          });
        }, 500));
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
            debouncedSavers.get(path)?.flush();
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
      for (const debouncedSave of debouncedSavers.values()) {
        debouncedSave.flush();
      }
      // A timer may already have started a save before flush was called.
      while (pendingWrites.size > 0) {
        await Promise.all(pendingWrites.values());
      }
    },
  };
}


/**
 * Migrate tokens to use relative paths instead of app:// URLs
 */
function migrateTokenPaths(tokens: Record<string, LegacyToken>): Record<string, TokenEntity> {
  const migratedTokens: Record<string, TokenEntity> = {};
  
  for (const [id, token] of Object.entries(tokens)) {
    const { statuses, ...migratedToken } = token;

    // Normalize the image path (handles app:// URLs and absolute paths)
    if (migratedToken.imagePath) {
      const normalizedPath = normalizeImagePath(migratedToken.imagePath);
      if (normalizedPath !== migratedToken.imagePath) {
        migratedToken.imagePath = normalizedPath;
      }
    }

    // Migrate legacy 'statuses' field to 'conditions'
    if (statuses && !migratedToken.conditions) {
      migratedToken.conditions = statuses;
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

/** Every map saved before automatic grid colours carries this default; nobody chose it, so it becomes automatic. */
const LEGACY_DEFAULT_GRID_COLOR = '#00FFFF';

function migrateGrid(grid: LegacyGridState): GridState {
  const { measurementType, color, ...rest } = grid;
  const migrated: GridState = color === undefined || color.toUpperCase() === LEGACY_DEFAULT_GRID_COLOR ? rest : { ...rest, color };
  if (measurementType === undefined) return migrated;
  return { ...migrated, measurementType: measurementType === 'daggerheart' ? 'abstract' : measurementType };
}

/**
 * Migrate persisted state from older versions to current MapFile shape.
 */
export function migrateMapFile(persisted: unknown): MapFile {
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

  if (!isLegacyMapFile(persisted)) return initial;

  // Fix any duplicated path segments first
  fixMapTokenPaths(persisted);
  // Migrate token paths from app:// URLs to relative paths
  const migratedTokens = persisted.objects?.tokens
    ? migrateTokenPaths(persisted.objects.tokens)
    : {};

  // Merge persisted over initial, ensuring all fields present
  return {
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
    grid: persisted.grid ? migrateGrid(persisted.grid) : initial.grid,
    camera: persisted.camera || initial.camera
  };
}
