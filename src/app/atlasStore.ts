import { create } from "zustand";
import { subscribeWithSelector, persist } from "zustand/middleware";
import type { StorageValue } from "zustand/middleware";
import { immer } from "zustand/middleware/immer";
import type { TokenEntity, Character, NotePin } from './types';
import { CameraState, GridState, createAtlasStorage, ATLAS_SCHEMA, ATLAS_VERSION, migrateMapFile } from './services/MapPersistence';
import { getStorageApp } from './atlasStorageInit';
import { isAtlasToolAvailable } from './tools/toolAvailability';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface AtlasState {
  // --- Non-persisted fields ---
  // Current map file path (for persistence)
  mapPath: string | null;
  setMapPath: (path: string | null) => void;

  // --- Persisted fields ---
  // Schema identifier and version for migrations
  schema: 'atlas-vtt';
  version: number;
  
  // Map background image path
  background: string | null;
  setBackground: (bg: string | null) => void;
  
  // Grid configuration
  grid: GridState | null;
  setGrid: (grid: GridState) => void;
  
  // Object collections by type
  objects: {
    tokens: Record<string, TokenEntity>;
    fog: Record<string, any>;
    pins: Record<string, NotePin>;
    // Add more object types as needed
  };
  
  // Camera/viewport state
  camera: CameraState;

  // --- Actions ---
  // Camera actions
  setCamera: (c: Partial<CameraState>) => void;
  
  // Token actions
  addToken: (
    data: Omit<TokenEntity, 'id' | 'kind'> & { kind?: 'token' | 'character'; id?: string }
  ) => string;
  promoteToCharacter: (
    id: string,
    extra: Pick<Character, 'name' | 'hp' | 'notePath'>
  ) => void;
  moveToken: (id: string, x: number, y: number) => void;
  updateToken: (id: string, updates: Partial<Omit<TokenEntity, 'id' | 'kind'>>) => void;
  deleteToken: (id: string) => void;
  setTokens: (map: Record<string, TokenEntity>) => void;
  /** Update or clear ring colour for a token */
  setTokenRing: (id: string, color: string | null) => void;

  // Note Pin actions
  addNotePin: (x: number, y: number, notePath: string, icon?: string) => string;
  updateNotePin: (id: string, updates: Partial<Omit<NotePin, 'id' | 'kind'>>) => void;
  moveNotePin: (id: string, x: number, y: number) => void;
  deleteNotePin: (id: string) => void;

  // Tool and selection state
  activeTool: 'move' | 'select' | 'fog' | 'text' | 'measure' | 'measure-circle' | 'measure-cone' | 'eraser' | 'asset' | 'note-pin' | 'laser-pointer' | 'wall' | 'draw-pen' | 'draw-eraser' | 'draw-icon' | 'draw-line' | 'draw-rectangle' | 'draw-circle' | 'audio';
  setActiveTool: (tool: AtlasState['activeTool']) => void;
  selectedIds: string[];
  setSelection: (ids: string[]) => void;
  clearSelection: () => void;
  moveTokensBulk: (ids: string[], dx: number, dy: number) => void;
  deleteTokens: (ids: string[]) => void;

  // New actions
  deleteMapObject: (type: 'token' | 'fog' | 'pin', id: string) => void;
  
  // Clear all map state when switching maps
  clearMapState: () => void;
}

// Initial state for the store (persisted fields only)
const initialState: Pick<AtlasState, 'schema' | 'version' | 'mapPath' | 'background' | 'grid' | 'objects' | 'camera'> = {
  schema: ATLAS_SCHEMA,
  version: ATLAS_VERSION,
  mapPath: null as string | null,
  background: null as string | null,
  grid: {
    enabled: true,
    size: 70,
    offsetX: 0,
    offsetY: 0,
    color: '#00FFFF',
    opacity: 0.5
  } as GridState,
  objects: {
    tokens: {} as Record<string, TokenEntity>,
    fog: {},
    pins: {} as Record<string, NotePin>,
  },
  camera: { x: 0, y: 0, scale: 1 } as CameraState,
};

// Global persistence control flag (outside of store to avoid triggering saves)
let globalPersistenceEnabled = true;

/**
 * Control persistence without triggering state changes
 */
export function setPersistenceEnabled(enabled: boolean): void {
  globalPersistenceEnabled = enabled;
}

/**
 * Get current persistence state
 */
export function isPersistenceEnabled(): boolean {
  return globalPersistenceEnabled;
}

// Custom type for our storage implementation

// Create a custom storage adapter that initializes on demand
function createCustomStorage() {
  // Lightweight in-memory fallback used before the plugin provides the App
  // instance. This prevents noisy console errors during module evaluation
  // while still satisfying the StateStorage contract expected by Zustand.
  const memoryFallback = new Map<string, string>();
  const localStoreAvailable = typeof window !== 'undefined' && !!window.localStorage;

  return {
    getItem: async (name: string): Promise<StorageValue<Partial<AtlasState>> | null> => {
      const app = getStorageApp();
      if (!app) {
        // Plugin not initialised yet – fall back to localStorage / memory to
        // avoid console errors during initial module load. This data will be
        // superseded once the proper vault storage kicks in after init.
        const raw = localStoreAvailable ? window.localStorage.getItem(name) : memoryFallback.get(name);
        return raw ? (JSON.parse(raw) as unknown as StorageValue<Partial<AtlasState>>) : null;
      }
      const storage = createAtlasStorage<AtlasState, Partial<AtlasState>>(app, _deprecatedAtlasStore);
      return storage.getItem(name);
    },
    setItem: async (name: string, value: StorageValue<Partial<AtlasState>>): Promise<void> => {
      // Check if persistence is enabled before saving
      if (!globalPersistenceEnabled) {
        return;
      }
      
      const app = getStorageApp();
      if (!app) {
        // Persist to fallback so that early writes (unlikely but possible)
        // are not lost.
        const raw = JSON.stringify(value);
        if (localStoreAvailable) {
          window.localStorage.setItem(name, raw);
        } else {
          memoryFallback.set(name, raw);
        }
        return;
      }
      const storage = createAtlasStorage<AtlasState, Partial<AtlasState>>(app, _deprecatedAtlasStore);
      await storage.setItem(name, value);
    },
    removeItem: async (name: string): Promise<void> => {
      const app = getStorageApp();
      if (!app) {
        if (localStoreAvailable) {
          window.localStorage.removeItem(name);
        } else {
          memoryFallback.delete(name);
        }
        return;
      }
      const storage = createAtlasStorage(app, _deprecatedAtlasStore);
      await storage.removeItem(name);
    }
  };
}

// DEPRECATED: This global store should not be used
// Use createViewAtlasStore from storeFactory.ts instead
// This is kept temporarily for backward compatibility
const _deprecatedAtlasStore = create<AtlasState>()(
  subscribeWithSelector(
    persist(
      immer<AtlasState>((set) => ({
        // Initialize with default state
        ...initialState,
        // Selection and tool state
        selectedIds: [] as string[],
        activeTool: 'move' as AtlasState['activeTool'],

        // Set the map path - this drives persistence
        setMapPath: (path) => set((draft) => {
          draft.mapPath = path;
        }),

        // Update camera state
        setCamera: (partial) => set((draft) => {
          draft.camera = { ...draft.camera, ...partial };
        }),

        // Set background image path
        setBackground: (bg) => set((draft) => {
          draft.background = bg;
        }),

        // Set grid state
        setGrid: (grid) => set((draft) => {
          draft.grid = grid;
        }),

        // Add a new token and return its ID
        addToken: (data) => {
          const id = data.id ?? crypto.randomUUID();
          const kind = data.kind ?? 'token';
          
          set((draft) => {
            const tokenEntity = { id, kind, ...data } as TokenEntity;
            draft.objects.tokens[id] = tokenEntity;
          });
          
          return id;
        },

        // Promote a token to a character
        promoteToCharacter: (id, extra) => set((draft) => {
          const existing = draft.objects.tokens[id];
          if (existing) {
            draft.objects.tokens[id] = { 
              ...existing, 
              kind: 'character', 
              ...extra 
            } as Character;
          }
        }),

        // Move a token to new coordinates
        moveToken: (id, x, y) => set((draft) => {
          const token = draft.objects.tokens[id];
          if (token) {
            token.x = x;
            token.y = y;
          }
        }),

        // Update a token with partial data
        updateToken: (id, updates) => set((draft) => {
          const token = draft.objects.tokens[id];
          if (token) {
            // Merge updates, but don't allow changing id or kind directly via this action
            const { id: _id, kind: _kind, ...safeUpdates } = updates as any; 
            draft.objects.tokens[id] = { ...token, ...safeUpdates };
          }
        }),

        // Duplicate a token and return the new token's ID
        duplicateToken: (id: string, offsetX = 50, offsetY = 50) => {
          const originalToken = _deprecatedAtlasStore.getState().objects.tokens[id];
          
          if (!originalToken) {
            console.warn(`[AtlasStore] Cannot duplicate token: ${id} not found`);
            return null;
          }
          
          const newId = crypto.randomUUID();
          const duplicatedToken = {
            ...originalToken,
            id: newId,
            x: originalToken.x + offsetX,
            y: originalToken.y + offsetY,
          };
          
          set((draft) => {
            draft.objects.tokens[newId] = duplicatedToken;
          });
          
          return newId;
        },

        // Delete a token
        deleteToken: (id) => set((draft) => {
          if (draft.objects.tokens[id]) {
            delete draft.objects.tokens[id];
          }
        }),

        // Set all tokens (bulk update)
        setTokens: (map) => set((draft) => {
          // Filter out tokens with blob URLs
          const filteredTokens: Record<string, TokenEntity> = {};
          
          for (const [id, token] of Object.entries(map)) {
            if (token.imagePath && token.imagePath.startsWith('blob:')) {
              console.warn(`[AtlasStore] Skipping token with blob URL: ${id}`);
            } else {
              // Ensure the token maintains all its properties including statblockPath
              // This is important when loading from persisted state
              filteredTokens[id] = token as TokenEntity;
            }
          }
          
          draft.objects.tokens = filteredTokens;
        }),

        // Add a new note pin
        addNotePin: (x, y, notePath, icon) => {
          const id = crypto.randomUUID();
          
          set((draft) => {
            const newPin: NotePin = { 
              id, 
              kind: 'pin',
              x, 
              y, 
              notePath
            };
            
            // Only add icon if it exists
            if (icon) {
              newPin.icon = icon;
            }
            
            draft.objects.pins[id] = newPin;
          });
          
          return id;
        },

        // Update a note pin
        updateNotePin: (id, updates) => set((draft) => {
          const pin = draft.objects.pins[id];
          if (pin) {
            draft.objects.pins[id] = { 
              ...pin, 
              ...updates 
            };
          }
        }),

        // Move a note pin
        moveNotePin: (id, x, y) => set((draft) => {
          const pin = draft.objects.pins[id];
          if (pin) {
            pin.x = x;
            pin.y = y;
          }
        }),

        // Delete a note pin
        deleteNotePin: (id) => set((draft) => {
          if (draft.objects.pins[id]) {
            delete draft.objects.pins[id];
          }
        }),

        // Duplicate a pin and return the new pin's ID
        duplicatePin: (id: string, offsetX = 30, offsetY = 30) => {
          const originalPin = _deprecatedAtlasStore.getState().objects.pins[id];
          
          if (!originalPin) {
            console.warn(`[AtlasStore] Cannot duplicate pin: ${id} not found`);
            return null;
          }
          
          const newId = crypto.randomUUID();
          const duplicatedPin = {
            ...originalPin,
            id: newId,
            x: originalPin.x + offsetX,
            y: originalPin.y + offsetY,
          };
          
          set((draft) => {
            draft.objects.pins[newId] = duplicatedPin;
          });
          
          return newId;
        },

        // Run migrations for older file versions
        migrate: migrateMapFile,

        // Tool and selection state
        setActiveTool: (tool) => {
          if (!isAtlasToolAvailable(tool)) {
            return;
          }
          set((draft) => { 
            draft.activeTool = tool;
          });
        },
        setSelection: (ids) => set((draft) => { draft.selectedIds = ids; }),
        clearSelection: () => set((draft) => { draft.selectedIds = []; }),
        moveTokensBulk: (ids, dx, dy) => set((draft) => {
          ids.forEach((id) => {
            const token = draft.objects.tokens[id];
            if (token) {
              token.x += dx;
              token.y += dy;
            }
          });
        }),
        deleteTokens: (ids) => set((draft) => {
          ids.forEach((id) => {
            if (draft.objects.tokens[id]) {
              delete draft.objects.tokens[id];
            }
          });
        }),

        // New actions
        deleteMapObject: (type: 'token' | 'fog' | 'pin', id: string) => set((draft) => {
          switch (type) {
            case 'token':
              if (draft.objects.tokens[id]) delete draft.objects.tokens[id];
              break;
            case 'fog':
              if (draft.objects.fog[id]) delete draft.objects.fog[id];
              break;
            case 'pin':
              if (draft.objects.pins[id]) delete draft.objects.pins[id];
              break;
            default:
              break;
          }
        }),
        
        // Clear all map state when switching maps
        clearMapState: () => set((draft) => {
          draft.background = null;
          draft.grid = initialState.grid;
          draft.objects = {
            tokens: {},
            fog: {},
            pins: {}
          };
          draft.camera = { x: 0, y: 0, scale: 1 };
          draft.selectedIds = [];
        }),

        // Token ring actions
        setTokenRing: (id, color) => set((draft) => {
          const existing = draft.objects.tokens[id];
          if (!existing) {
            console.warn('[AtlasStore] setTokenRing: token not found', id);
            return;
          }

          // Create new token object so Reactivity triggers
          const updated = { ...existing } as any;
          if (color === null) {
            delete updated.ringColor;
          } else {
            updated.ringColor = color;
          }

          // Replace in map and also replace the map reference so Zustand selector fires
          draft.objects.tokens = {
            ...draft.objects.tokens,
            [id]: updated,
          } as any;
        }),
      })),
      {
        name: 'atlas-map',
        
        storage: createCustomStorage(),
        
        // Store version for migrations
        version: ATLAS_VERSION,
        
        // Skip automatic hydration on store creation. We will manually rehydrate.
        skipHydration: true,
        
        // Only persist relevant parts of state
        partialize: (state): Partial<AtlasState> => {
          // If persistence is disabled, return null to prevent saving
          if (!globalPersistenceEnabled) {
            return {} as Partial<AtlasState>;
          }
          
          return {
            schema: state.schema,
            version: state.version,
            background: state.background,
            grid: state.grid,
            objects: state.objects,
            camera: state.camera
          } as Partial<AtlasState>;
        },
        
        onRehydrateStorage: () => {
          return (_state, error) => {
            if (error) {
              console.error('[AtlasStore] Hydration failed:', error);
            }
          };
        }
      }
    )
  )
);

// DEPRECATED: These exports should not be used
// They are kept temporarily for backward compatibility
// Use createViewAtlasStore from storeFactory.ts instead

// Export for tests that might still reference this
export const atlasStore = _deprecatedAtlasStore;
export const atlasStorePersist = _deprecatedAtlasStore.persist;

// This export name is misleading - it's not actually a hook
// Real React components should use useAtlasStore from ViewStoreContext
export const useAtlasStore = _deprecatedAtlasStore; 
