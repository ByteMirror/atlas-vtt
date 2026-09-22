import { create } from "zustand";
import type { Mutate, StoreApi } from "zustand";
import { subscribeWithSelector, persist } from "zustand/middleware";
import type { StorageValue } from "zustand/middleware";
import { immer } from "zustand/middleware/immer";
import { temporal } from 'zundo';
import type { App, Plugin } from 'obsidian';
import type { TokenEntity, Character, NotePin, TextElement, DrawingStroke } from './types';
import type { FogOperation, FogOperationInput } from './types/fogTypes';
import type { WallSegment, WallInput, LightSource, LightInput } from './types/wallTypes';
import type { AudioSource, AudioInput } from './types/audioTypes';
import type { AnyWidget, WidgetSettings } from './types/widgetTypes';
import type { InitiativeState, InitiativeEntry, InitiativeConfig } from './types/initiativeTypes';
import { createDefaultInitiativeState } from './types/initiativeTypes';
import { CameraState, GridState, createAtlasStorage, ATLAS_SCHEMA, ATLAS_VERSION } from './services/MapPersistence';
import type { AtlasPersistStorage } from './services/MapPersistence';
import { normalizeImagePath } from './utils/pathUtils';
import { createInitiativeActions } from './stores/initiativeSlice';
import { createInitialUIState, createUIActions, type UISlice } from './stores/uiSlice';
import { createHistoryOptions } from './stores/history';
import type { DiceRollResult } from './tools/DiceTool';
import { isAtlasToolAvailable } from './tools/toolAvailability';
import { isPinLabelKind, nextPinLabel } from './tools/pinLabels';

// Individual store state interface (same as AtlasState but isolated)
export interface ViewAtlasState {
  // --- Non-persisted fields ---
  // Current map file path (for persistence)
  mapPath: string | null;
  setMapPath: (path: string | null) => void;
  
  // Per-store persistence control
  persistenceEnabled: boolean;
  setPersistenceEnabled: (enabled: boolean) => void;
  
  // Loading state
  isMapLoading: boolean;
  mapLoadingProgress?: number;
  mapLoadingMessage?: string;
  setMapLoading: (loading: boolean, progress?: number, message?: string) => void;

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
  setGridUnits: (units: { unitType: 'feet' | 'meters' | 'units'; unitDistance: number }) => void;
  setGridVisible: (visible: boolean) => void;
  setSnapToGrid: (snap: boolean) => void;
  
  // Object collections by type
  objects: {
    tokens: Record<string, TokenEntity>;
    fog: Record<string, FogOperation>;
    pins: Record<string, NotePin>;
    texts: Record<string, TextElement>;
    drawings: Record<string, DrawingStroke>;
    walls: Record<string, WallSegment>;
    lights: Record<string, LightSource>;
    audios: Record<string, AudioSource>;
  };
  
  // Camera state
  camera: CameraState;
  setCamera: (partial: Partial<CameraState>) => void;

  // Token actions
  addToken: (
    data: Omit<TokenEntity, 'id' | 'kind'> & { kind?: 'token' | 'character'; id?: string }
  ) => string;

  addCharacter: (data: {
    x: number;
    y: number;
    imagePath: string;
    name: string;
    hp: number;
    notePath?: string;
    snapped?: boolean;
    ringColor?: string;
  }) => string;

  addTokenWithId: (
    id: string,
    data: { x: number; y: number; imagePath: string; snapped?: boolean },
    extra: Pick<Character, 'name' | 'hp' | 'notePath'>
  ) => void;

  moveToken: (id: string, x: number, y: number) => void;
  updateToken: (id: string, updates: TokenUpdates) => void;
  /** Applies several token updates in one store write, so they form a single undo step. */
  updateTokens: (entries: Array<{ id: string; changes: TokenUpdates }>) => void;
  deleteToken: (id: string) => void;
  setTokens: (map: Record<string, TokenEntity>) => void;
  setTokenRing: (id: string, color: string | null) => void;
  addTokenCondition: (tokenId: string, conditionId: string) => void;
  removeTokenCondition: (tokenId: string, conditionId: string) => void;
  setTokenSize: (tokenId: string, size: number) => void;
  clearTokenConditions: (id: string) => void;
  killTokens: (ids: string[]) => void;
  resetTokens: (ids: string[]) => void;

  // Note Pin actions
  addNotePin: (x: number, y: number, notePath: string, icon?: string) => string;
  updateNotePin: (id: string, updates: Partial<Omit<NotePin, 'id' | 'kind'>>) => void;
  moveNotePin: (id: string, x: number, y: number) => void;
  deleteNotePin: (id: string) => void;

  // Text element actions
  addText: (data: Omit<TextElement, 'id' | 'kind'>) => string;
  updateText: (id: string, updates: Partial<Omit<TextElement, 'id' | 'kind'>>) => void;
  moveText: (id: string, x: number, y: number) => void;
  deleteText: (id: string) => void;
  setTexts: (texts: Record<string, TextElement>) => void;

  // Drawing actions
  addDrawing: (data: Omit<DrawingStroke, 'id' | 'kind' | 'timestamp'>) => string;
  moveDrawings: (ids: string[], dx: number, dy: number) => void;
  updateDrawings: (ids: string[], updates: Partial<Pick<DrawingStroke, 'color' | 'icon'>>) => void;
  /** Copies the drawings with a small offset and selects the copies. */
  duplicateDrawings: (ids: string[]) => void;
  deleteDrawing: (id: string) => void;
  clearDrawings: () => void;
  setDrawings: (drawings: Record<string, DrawingStroke>) => void;

  // Fog actions
  addFogOperation: (data: FogOperationInput) => string;
  deleteFogOperation: (id: string) => void;
  deleteFogOperations: (ids: string[]) => void;
  duplicateFogOperations: (ids: string[]) => void;
  setFogOperations: (fog: Record<string, FogOperation>) => void;
  clearFog: () => void;

  // Vision dirty flag (non-persisted)
  _visionDirty: boolean;
  markVisionDirty: () => void;
  consumeVisionDirty: () => boolean;

  // Wall actions
  addWall: (data: WallInput) => string;
  updateWall: (id: string, changes: Partial<WallSegment>) => void;
  deleteWall: (id: string) => void;
  deleteWalls: (ids: string[]) => void;
  toggleDoor: (id: string) => void;

  // Light actions
  addLight: (data: LightInput) => string;
  updateLight: (id: string, changes: Partial<LightSource>) => void;
  deleteLight: (id: string) => void;

  // Audio dirty flag (non-persisted)
  _audioDirty: boolean;
  markAudioDirty: () => void;
  consumeAudioDirty: () => boolean;

  // Audio actions
  addAudio: (data: AudioInput) => string;
  updateAudio: (id: string, changes: Partial<AudioSource>) => void;
  deleteAudio: (id: string) => void;

  // Tool and selection state
  activeTool: 'move' | 'select' | 'fog' | 'text' | 'measure' | 'measure-circle' | 'measure-cone' | 'eraser' | 'asset' | 'note-pin' | 'laser-pointer' | 'draw-pen' | 'draw-eraser' | 'draw-icon' | 'draw-line' | 'draw-rectangle' | 'draw-circle' | 'wall' | 'audio';
  setActiveTool: (tool: ViewAtlasState['activeTool']) => void;
  selectionMode: 'box' | 'lasso';
  setSelectionMode: (mode: ViewAtlasState['selectionMode']) => void;
  selectedIds: string[];
  setSelection: (ids: string[]) => void;
  clearSelection: () => void;
  moveTokensBulk: (ids: string[], dx: number, dy: number) => void;
  setTokenPositions: (positions: Array<{id: string, x: number, y: number}>) => void;
  deleteTokens: (ids: string[]) => void;
  /** Deletes every selected token and drawing in one undo step. */
  deleteSelected: () => void;
  
  // Drag state
  isDragging: boolean;
  setIsDragging: (dragging: boolean) => void;
  
  // Widget settings
  widgetSettings: WidgetSettings;
  widgetValues: Record<string, any>; // Widget values separate from definitions
  setWidgetSettings: (settings: WidgetSettings) => void;
  updateWidget: (widgetId: string, updates: Partial<AnyWidget>) => void;
  addWidget: (widget: AnyWidget) => void;
  removeWidget: (widgetId: string) => void;
  reorderWidgets: (widgetIds: string[]) => void;
  setWidgetValue: (widgetId: string, value: number) => void;
  
  // Player view state
  isPlayerView: boolean;

  // GM view toggle (semi-transparent fog vs fully opaque)
  isGMView: boolean;
  setGMView: (on: boolean) => void;

  // DM Dashboard state
  dmNotePath: string | null;
  setDMNotePath: (path: string | null) => void;

  // Duplication actions
  duplicateTokens: (ids: string[]) => void;
  duplicatePins: (ids: string[]) => void;

  // Map state management
  deleteMapObject: (type: 'token' | 'fog' | 'pin' | 'text' | 'drawing' | 'wall' | 'light' | 'audio', id: string) => void;
  clearMapState: () => void;
  
  // Collection management
  currentCollectionId?: string;
  plugin?: Plugin;
  
  // Token settings
  tokenSettings: {
    showNameplates: boolean;
    showHPBars: boolean;
    showStressBars: boolean;
    showInstanceBadges: boolean;
    tokenRingSize: number;
  };
  setTokenSettings: (settings: ViewAtlasState['tokenSettings']) => void;
  
  // --- Initiative Tracker ---
  initiative: InitiativeState;
  initiativeTrackerOpen: boolean;
  setInitiativeTrackerOpen: (open: boolean) => void;
  addToInitiative: (entry: Omit<InitiativeEntry, 'id' | 'order' | 'isActive'>) => string;
  removeFromInitiative: (id: string) => void;
  updateInitiativeEntry: (id: string, updates: Partial<InitiativeEntry>) => void;
  rollAllInitiative: () => void;
  rollEntryInitiative: (id: string) => void;
  nextTurn: () => void;
  previousTurn: () => void;
  reorderInitiative: (fromIndex: number, toIndex: number) => void;
  moveToFront: (id: string) => void;
  moveToBack: (id: string) => void;
  startCombat: () => void;
  endCombat: () => void;
  setInitiativeConfig: (config: Partial<InitiativeConfig>) => void;
  syncInitiativeWithTokens: () => void;

  // Dice roll log (persisted per map, capped at 20 entries)
  diceLog: DiceRollResult[];
  addDiceLogEntry: (entry: DiceRollResult) => void;
  clearDiceLog: () => void;

  // --- Per-view UI visibility (from uiSlice.ts, NOT persisted) ---
  isGridSettingsOpen: UISlice['isGridSettingsOpen'];
  isDMDashboardOpen: UISlice['isDMDashboardOpen'];
  isGridAlignmentOpen: UISlice['isGridAlignmentOpen'];
  isDiceLogOpen: UISlice['isDiceLogOpen'];
  isAssetManagerOpen: UISlice['isAssetManagerOpen'];
  assetManagerInitialTab?: UISlice['assetManagerInitialTab'];
  isCommandPaletteOpen: UISlice['isCommandPaletteOpen'];
  isDiceTrayOpen: UISlice['isDiceTrayOpen'];
  setGridSettingsOpen: UISlice['setGridSettingsOpen'];
  setDMDashboardOpen: UISlice['setDMDashboardOpen'];
  setGridAlignmentOpen: UISlice['setGridAlignmentOpen'];
  setDiceLogOpen: UISlice['setDiceLogOpen'];
  openAssetManager: UISlice['openAssetManager'];
  closeAssetManager: UISlice['closeAssetManager'];
  setCommandPaletteOpen: UISlice['setCommandPaletteOpen'];
  setDiceTrayOpen: UISlice['setDiceTrayOpen'];

  // Note: Undo/Redo functionality is added by temporal middleware
}

/** The subset of view state that is written to the map file. */
export type PersistedViewState = Partial<ViewAtlasState>;

/** Find the lowest unused instance number for tokens sharing the same imagePath. */
function computeNextInstanceNumber(
  tokens: Record<string, TokenEntity>,
  imagePath: string,
): number {
  const usedNumbers = new Set(
    Object.values(tokens)
      .filter((t) => t.imagePath === imagePath)
      .map((t) => t.instanceNumber)
      .filter((n): n is number => n != null)
  );
  let num = 1;
  while (usedNumbers.has(num)) num++;
  return num;
}

// Simple default widget settings
const createDefaultWidgets = (): WidgetSettings => ({
  widgets: {},
  globalVisible: true,
  position: 'top',
  scale: 1.0
});

// Initial state for each store instance
const createInitialState = (): Pick<ViewAtlasState, 'schema' | 'version' | 'mapPath' | 'background' | 'grid' | 'objects' | 'camera' | 'persistenceEnabled' | 'widgetSettings' | 'widgetValues' | 'dmNotePath' | 'tokenSettings' | 'initiative' | 'diceLog'> => ({
  schema: ATLAS_SCHEMA,
  version: ATLAS_VERSION,
  mapPath: null,
  background: null,
  grid: {
    enabled: true,
    visible: true,
    snapToGrid: true,
    type: 'square',
    size: 70,
    offsetX: 0,
    offsetY: 0,
    color: '#00FFFF',
    opacity: 0.5,
    lineType: 'solid',
    lineWidth: 1
  },
  objects: {
    tokens: {},
    fog: {},
    pins: {},
    texts: {},
    drawings: {},
    walls: {},
    lights: {},
    audios: {},
  },
  camera: { x: 0, y: 0, scale: 1 },
  persistenceEnabled: true,
  widgetSettings: createDefaultWidgets(),
  widgetValues: {}, // Widget values stored separately
  dmNotePath: null, // DM note linking
  tokenSettings: {
    showNameplates: false,
    showHPBars: true,
    showStressBars: true,
    showInstanceBadges: true,
    tokenRingSize: 1
  },
  initiative: createDefaultInitiativeState(),
  diceLog: [],
});

export type TokenUpdates = Partial<Omit<TokenEntity, 'id' | 'kind'>>;

/**
 * A view store as seen after its middleware stack: selector-aware `subscribe`,
 * the `persist` API, and the storage flush used for tab-switch save coordination.
 * Assignable to `StoreApi<ViewAtlasState>` for consumers that only need the basics.
 */
export type ViewAtlasStore = Mutate<
  StoreApi<ViewAtlasState>,
  [['zustand/subscribeWithSelector', never], ['zustand/persist', PersistedViewState]]
> & {
  flushStorage: () => Promise<void>;
};

function applyTokenUpdates(token: TokenEntity | undefined, updates: TokenUpdates): void {
  if (!token) return;
  const normalized = updates.imagePath
    ? { ...updates, imagePath: normalizeImagePath(updates.imagePath) }
    : updates;
  Object.assign(token, normalized);
}

/**
 * Creates an isolated Atlas store instance for a specific view
 */
export function createViewAtlasStore(app: App, viewId: string, plugin?: any, isPlayerView: boolean = false): ViewAtlasStore {
  // Create a storage factory that will access the store once it's created
  let storeRef: Pick<StoreApi<ViewAtlasState>, 'getState'> | null = null;

  // Keep a reference to the delayed storage so we can expose flush() on the store
  let delayedStorageRef: ReturnType<typeof createDelayedStorage> | null = null;

  const createDelayedStorage = () => {
    // Create storage lazily but only ONCE to preserve debounce state
    let currentStorage: AtlasPersistStorage<PersistedViewState> | null = null;

    const getOrCreateStorage = (): AtlasPersistStorage<PersistedViewState> | null => {
      if (!currentStorage && storeRef) {
        currentStorage = createAtlasStorage<ViewAtlasState, PersistedViewState>(app, storeRef, plugin);
      }
      return currentStorage;
    };

    // The persisted slice last handed to storage. Immer preserves references for
    // untouched branches, so a shallow key comparison tells us whether anything
    // that is actually persisted changed since the last write.
    let lastPersistedState: PersistedViewState | null = null;
    const persistedSliceChanged = (next: PersistedViewState): boolean => {
      if (!lastPersistedState) return true;
      const keys = Object.keys(next) as Array<keyof PersistedViewState>;
      if (keys.length !== Object.keys(lastPersistedState).length) return true;
      return keys.some((key) => next[key] !== lastPersistedState![key]);
    };

    const storage = {
      async getItem(name: string): Promise<StorageValue<PersistedViewState> | null> {
        if (!storeRef) {
          console.warn(`[ViewStore-${viewId}] Storage getItem called before store is ready`);
          return null;
        }
        const storage = getOrCreateStorage();
        return storage ? storage.getItem(name) : null;
      },
      async setItem(name: string, value: StorageValue<PersistedViewState>): Promise<void> {
        if (!storeRef) {
          console.warn(`[ViewStore-${viewId}] Storage setItem called before store is ready`);
          return;
        }

        // Check per-store persistence control
        const state = storeRef.getState();
        if (!state.persistenceEnabled) {
          return;
        }

        if (!persistedSliceChanged(value.state)) {
          return;
        }
        lastPersistedState = value.state;

        const storage = getOrCreateStorage();
        if (storage) {
          await storage.setItem(name, value);
        }
      },
      async removeItem(name: string): Promise<void> {
        if (!storeRef) {
          console.warn(`[ViewStore-${viewId}] Storage removeItem called before store is ready`);
          return;
        }
        const storage = getOrCreateStorage();
        if (storage) {
          await storage.removeItem(name);
        }
      },
      // Add flush method to handle pending saves
      async flush(): Promise<void> {
        if (currentStorage && typeof currentStorage.flush === 'function') {
          await currentStorage.flush();
        }
      }
    };
    delayedStorageRef = storage;
    return storage;
  };
  
  const store = create<ViewAtlasState>()(
    temporal(
      subscribeWithSelector(
        persist(
          immer<ViewAtlasState>((set, get) => ({
          // Initialize with default state
          ...createInitialState(),
          
          // Player view state (set during creation)
          isPlayerView: isPlayerView,
          isGMView: true,

          // Selection and tool state (not persisted)
          selectedIds: [],
          activeTool: 'move',
          selectionMode: 'box' as const,
          isDragging: false,
          
          // Collection management (not persisted)
          plugin: plugin,
          currentCollectionId: 'default', // Default to 'default' collection
          
          // DM Dashboard state
          dmNotePath: null,
          
          // Token settings
          tokenSettings: {
            showNameplates: false,
            showHPBars: true,
            showStressBars: false,
            showInstanceBadges: true,
            tokenRingSize: 1
          },
          
          // Per-store persistence control (not persisted)
          persistenceEnabled: true,
          setPersistenceEnabled: (enabled) => set((draft) => {
            draft.persistenceEnabled = enabled;
          }),
          
          // Loading state (not persisted)
          isMapLoading: false,
          setMapLoading: (loading, progress, message) => set((draft) => {
            draft.isMapLoading = loading;
            if (progress !== undefined) draft.mapLoadingProgress = progress;
            if (message !== undefined) draft.mapLoadingMessage = message;
          }),

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
          
          // Set grid units
          setGridUnits: (units) => set((draft) => {
            if (draft.grid) {
              draft.grid.unitType = units.unitType;
              draft.grid.unitDistance = units.unitDistance;
            }
          }),
          
          // Set grid visibility
          setGridVisible: (visible) => set((draft) => {
            if (!draft.grid) {
              // Initialize grid with defaults if it doesn't exist
              draft.grid = {
                enabled: true,
                visible: visible,
                snapToGrid: true,
                size: 70,
                offsetX: 0,
                offsetY: 0,
                color: '#00FFFF',
                opacity: 0.5,
                lineType: 'solid',
                lineWidth: 1
              };
            } else {
              draft.grid.visible = visible;
            }
          }),
          
          // Set snap to grid
          setSnapToGrid: (snap) => set((draft) => {
            if (!draft.grid) {
              // Initialize grid with defaults if it doesn't exist
              draft.grid = {
                enabled: true,
                visible: true,
                snapToGrid: snap,
                size: 70,
                offsetX: 0,
                offsetY: 0,
                color: '#00FFFF',
                opacity: 0.5,
                lineType: 'solid',
                lineWidth: 1
              };
            } else {
              draft.grid.snapToGrid = snap;
            }
          }),

          // Add a new token and return its ID
          addToken: (data) => {
            const id = data.id ?? `tok_${Date.now()}_${Math.random().toString(36).slice(2, 11)}`;
            const kind = data.kind ?? 'token';
            
            // Normalize the image path to prevent app:// URLs
            const normalizedData = {
              ...data,
              imagePath: normalizeImagePath(data.imagePath)
            };

            const instanceNumber = computeNextInstanceNumber(get().objects.tokens, normalizedData.imagePath);

            set((draft) => {
              const tokenEntity = { id, kind, ...normalizedData, instanceNumber } as TokenEntity;

              draft.objects.tokens[id] = tokenEntity;
              draft._visionDirty = true;
            });

            return id;
          },

          // Add a new character and return its ID
          addCharacter: (data) => {
            const id = `char_${Date.now()}_${Math.random().toString(36).slice(2, 11)}`;
            const normalizedImagePath = normalizeImagePath(data.imagePath);

            const instanceNumber = computeNextInstanceNumber(get().objects.tokens, normalizedImagePath);

            const token: Character = {
              id,
              kind: 'character',
              x: data.x,
              y: data.y,
              imagePath: normalizedImagePath,
              name: data.name,
              hp: data.hp,
              instanceNumber,
              ...(data.notePath && { notePath: data.notePath }),
              ...(data.snapped !== undefined && { snapped: data.snapped }),
              ...(data.ringColor && { ringColor: data.ringColor }),
            };
            set((draft) => {
              draft.objects.tokens[id] = token;
            });
            return id;
          },

          addTokenWithId: (id, data, extra) => {
            const normalizedImagePath = normalizeImagePath(data.imagePath);
            const instanceNumber = computeNextInstanceNumber(get().objects.tokens, normalizedImagePath);

            set((draft) => {
              const char: Character = {
                id,
                kind: 'character',
                x: data.x,
                y: data.y,
                imagePath: normalizedImagePath,
                name: extra.name,
                hp: extra.hp,
                instanceNumber,
                ...(extra.notePath && { notePath: extra.notePath }),
                ...(data.snapped !== undefined && { snapped: data.snapped }),
              };
              draft.objects.tokens[id] = char;
            });
          },

          moveToken: (id, x, y) => set((draft) => {
            const token = draft.objects.tokens[id];
            if (token) {
              token.x = x;
              token.y = y;
              draft._visionDirty = true;
              draft._audioDirty = true;
            }
          }),

          updateToken: (id, updates) => set((draft) => {
            applyTokenUpdates(draft.objects.tokens[id], updates);
          }),

          updateTokens: (entries) => set((draft) => {
            for (const { id, changes } of entries) {
              applyTokenUpdates(draft.objects.tokens[id], changes);
            }
          }),

          deleteToken: (id) => set((draft) => {
            delete draft.objects.tokens[id];
            draft._visionDirty = true;
          }),

          setTokens: (map) => set((draft) => {
            // Filter out tokens with blob URLs and normalize image paths
            const filteredTokens: Record<string, TokenEntity> = {};
            
            for (const [id, token] of Object.entries(map)) {
              if (token.imagePath && token.imagePath.startsWith('blob:')) {
                console.warn(`[ViewAtlasStore] Skipping token with blob URL: ${id}`);
              } else {
                // Normalize the image path and ensure the token maintains all its properties
                const normalizedToken = {
                  ...token,
                  imagePath: normalizeImagePath(token.imagePath)
                };
                filteredTokens[id] = normalizedToken;
              }
            }
            
            draft.objects.tokens = filteredTokens;
          }),


          // Tool and selection state
          setActiveTool: (tool) => set((draft) => {
            if (!isAtlasToolAvailable(tool)) {
              return;
            }
            draft.activeTool = tool;
          }),

          setSelectionMode: (mode) => set((draft) => {
            draft.selectionMode = mode;
          }),

          setSelection: (ids) => set((draft) => {
            draft.selectedIds = ids;
          }),

          clearSelection: () => set((draft) => {
            draft.selectedIds = [];
          }),
          
          setIsDragging: (dragging) => set((draft) => {
            draft.isDragging = dragging;
          }),

          setGMView: (on) => set((draft) => {
            draft.isGMView = on;
          }),

          // Widget settings
          setWidgetSettings: (settings) => set((draft) => {
            draft.widgetSettings = settings;
          }),
          
          updateWidget: (widgetId, updates) => set((draft) => {
            if (draft.widgetSettings.widgets[widgetId]) {
              Object.assign(draft.widgetSettings.widgets[widgetId], updates);
            }
          }),
          
          addWidget: (widget) => set((draft) => {
            draft.widgetSettings.widgets[widget.id] = widget;
          }),
          
          removeWidget: (widgetId) => set((draft) => {
            delete draft.widgetSettings.widgets[widgetId];
            delete draft.widgetValues[widgetId];
          }),
          
          reorderWidgets: (widgetIds) => set((draft) => {
            if (!widgetIds || !Array.isArray(widgetIds)) {
              console.warn(`[ViewStore-${viewId}] Invalid widgetIds provided to reorderWidgets:`, widgetIds);
              return;
            }
            widgetIds.forEach((id, index) => {
              if (draft.widgetSettings.widgets[id]) {
                draft.widgetSettings.widgets[id].order = index;
              }
            });
          }),
          
          setWidgetValue: (widgetId, value) => set((draft) => {
            // Store value separately from definition
            draft.widgetValues[widgetId] = value;
            
            // Also update in widgetSettings for backward compatibility
            if (draft.widgetSettings.widgets[widgetId]) {
              draft.widgetSettings.widgets[widgetId].value = value;
            }
          }),
          

          moveTokensBulk: (ids, dx, dy) => set((draft) => {
            if (!ids || !Array.isArray(ids)) {
              console.warn(`[ViewStore-${viewId}] Invalid ids provided to moveTokensBulk:`, ids);
              return;
            }
            ids.forEach(id => {
              const token = draft.objects.tokens[id];
              if (token) {
                token.x += dx;
                token.y += dy;
              }
            });
            draft._visionDirty = true;
            draft._audioDirty = true;
          }),

          setTokenPositions: (positions) => set((draft) => {
            if (!positions || !Array.isArray(positions)) {
              console.warn(`[ViewStore-${viewId}] Invalid positions provided to setTokenPositions:`, positions);
              return;
            }
            positions.forEach(({id, x, y}) => {
              const token = draft.objects.tokens[id];
              if (token) {
                token.x = x;
                token.y = y;
              }
            });
            draft._visionDirty = true;
            draft._audioDirty = true;
          }),

          deleteTokens: (ids) => set((draft) => {
            if (!ids || !Array.isArray(ids)) {
              console.warn(`[ViewStore-${viewId}] Invalid ids provided to deleteTokens:`, ids);
              return;
            }
            ids.forEach(id => delete draft.objects.tokens[id]);
            
            // Remove deleted token IDs from selection
            draft.selectedIds = draft.selectedIds.filter(selectedId => !ids.includes(selectedId));
          }),

          deleteSelected: () => set((draft) => {
            const { tokens, drawings } = draft.objects;
            draft.selectedIds = draft.selectedIds.filter((id) => {
              if (!tokens[id] && !drawings[id]) return true;
              delete tokens[id];
              delete drawings[id];
              return false;
            });
          }),

          // Token duplication
          duplicateTokens: (ids) => set((draft) => {
            if (!ids || !Array.isArray(ids)) {
              console.warn(`[ViewStore-${viewId}] Invalid ids provided to duplicateTokens:`, ids);
              return;
            }
            const newIds: string[] = [];
            ids.forEach(id => {
              const original = draft.objects.tokens[id];
              if (original) {
                const newId = `tok_${Date.now()}_${Math.random().toString(36).slice(2, 11)}`;
                const offset = 20;

                const instanceNumber = computeNextInstanceNumber(
                  draft.objects.tokens,
                  original.imagePath,
                );

                draft.objects.tokens[newId] = {
                  ...original,
                  id: newId,
                  x: original.x + offset,
                  y: original.y + offset,
                  instanceNumber,
                };
                newIds.push(newId);
              }
            });
            draft.selectedIds = newIds;
          }),

          duplicatePins: (ids) => set((draft) => {
            if (!ids || !Array.isArray(ids)) {
              console.warn(`[ViewStore-${viewId}] Invalid ids provided to duplicatePins:`, ids);
              return;
            }
            const newIds: string[] = [];
            ids.forEach(id => {
              const original = draft.objects.pins[id];
              if (original) {
                const newId = `pin_${Date.now()}_${Math.random().toString(36).slice(2, 11)}`;
                const offset = 20;
                const copy: NotePin = {
                  ...original,
                  id: newId,
                  x: original.x + offset,
                  y: original.y + offset
                };
                if (isPinLabelKind(copy.icon)) {
                  copy.label = nextPinLabel(draft.objects.pins, copy.icon);
                }
                draft.objects.pins[newId] = copy;
                newIds.push(newId);
              }
            });
            draft.selectedIds = newIds;
          }),

          deleteMapObject: (type: 'token' | 'fog' | 'pin' | 'text' | 'drawing' | 'wall' | 'light' | 'audio', id: string) => set((draft) => {
            switch (type) {
              case 'token':
                if (draft.objects.tokens[id]) {
                  delete draft.objects.tokens[id];
                  // Remove from selection if selected
                  draft.selectedIds = draft.selectedIds.filter(selectedId => selectedId !== id);
                }
                break;
              case 'fog':
                if (draft.objects.fog[id]) {
                  delete draft.objects.fog[id];
                  draft.selectedIds = draft.selectedIds.filter(selectedId => selectedId !== id);
                }
                break;
              case 'pin':
                if (draft.objects.pins[id]) {
                  delete draft.objects.pins[id];
                  // Remove from selection if selected
                  draft.selectedIds = draft.selectedIds.filter(selectedId => selectedId !== id);
                }
                break;
              case 'text':
                if (draft.objects.texts[id]) {
                  delete draft.objects.texts[id];
                  // Remove from selection if selected
                  draft.selectedIds = draft.selectedIds.filter(selectedId => selectedId !== id);
                }
                break;
              case 'drawing':
                if (draft.objects.drawings[id]) {
                  delete draft.objects.drawings[id];
                  // Remove from selection if selected
                  draft.selectedIds = draft.selectedIds.filter(selectedId => selectedId !== id);
                }
                break;
              case 'wall':
                if (draft.objects.walls[id]) {
                  delete draft.objects.walls[id];
                  draft.selectedIds = draft.selectedIds.filter(selectedId => selectedId !== id);
                  draft._visionDirty = true;
                }
                break;
              case 'light':
                if (draft.objects.lights[id]) {
                  delete draft.objects.lights[id];
                  draft.selectedIds = draft.selectedIds.filter(selectedId => selectedId !== id);
                  draft._visionDirty = true;
                }
                break;
              case 'audio':
                if (draft.objects.audios[id]) {
                  delete draft.objects.audios[id];
                  draft.selectedIds = draft.selectedIds.filter(selectedId => selectedId !== id);
                  draft._audioDirty = true;
                }
                break;
              default:
                break;
            }
          }),
          
          // DM Dashboard actions
          setDMNotePath: (path) => set((draft) => {
            draft.dmNotePath = path;
          }),

          // Token settings
          setTokenSettings: (settings) => set((draft) => {
            draft.tokenSettings = settings;
          }),

          // Note Pin actions
          addNotePin: (x, y, notePath, icon) => {
            const id = `pin_${Date.now()}_${Math.random().toString(36).slice(2, 11)}`;
            set((draft) => {
              const newPin: NotePin = { 
                id, 
                kind: 'pin',
                x, 
                y, 
                notePath
              };
              if (icon) {
                newPin.icon = icon;
              }
              if (isPinLabelKind(icon)) {
                newPin.label = nextPinLabel(draft.objects.pins, icon);
              }
              draft.objects.pins[id] = newPin;
            });
            return id;
          },

          updateNotePin: (id, updates) => set((draft) => {
            const pin = draft.objects.pins[id];
            if (pin) {
              const kindChanged = updates.icon !== undefined && updates.icon !== pin.icon;
              Object.assign(pin, updates);
              // A pin keeps its label for life; only moving it to another sequence re-labels it
              if (kindChanged) {
                delete pin.label;
                if (isPinLabelKind(pin.icon)) {
                  pin.label = nextPinLabel(draft.objects.pins, pin.icon);
                }
              }
            }
          }),

          moveNotePin: (id, x, y) => set((draft) => {
            const pin = draft.objects.pins[id];
            if (pin) {
              pin.x = x;
              pin.y = y;
            }
          }),

          deleteNotePin: (id) => set((draft) => {
            if (draft.objects.pins[id]) {
              delete draft.objects.pins[id];
              draft.selectedIds = draft.selectedIds.filter(selectedId => selectedId !== id);
            }
          }),

          // Text element actions
          addText: (data) => {
            const id = `text_${Date.now()}_${Math.random().toString(36).slice(2, 11)}`;
            set((draft) => {
              const textElement: TextElement = {
                id,
                kind: 'text',
                ...data
              };
              draft.objects.texts[id] = textElement;
            });
            return id;
          },

          updateText: (id, updates) => set((draft) => {
            const text = draft.objects.texts[id];
            if (text) {
              Object.assign(text, updates);
            }
          }),

          moveText: (id, x, y) => set((draft) => {
            const text = draft.objects.texts[id];
            if (text) {
              text.x = x;
              text.y = y;
            }
          }),

          deleteText: (id) => set((draft) => {
            if (draft.objects.texts[id]) {
              delete draft.objects.texts[id];
              draft.selectedIds = draft.selectedIds.filter(selectedId => selectedId !== id);
            }
          }),

          setTexts: (texts) => set((draft) => {
            draft.objects.texts = texts;
          }),

          // Drawing actions
          addDrawing: (data) => {
            const id = `drawing_${Date.now()}_${Math.random().toString(36).slice(2, 11)}`;
            set((draft) => {
              const drawingStroke: DrawingStroke = {
                id,
                kind: 'drawing',
                timestamp: Date.now(),
                ...data,
                // Create a deep copy of points array to avoid frozen object issues
                points: data.points.map((p: { x: number; y: number }) => ({ x: p.x, y: p.y }))
              };
              draft.objects.drawings[id] = drawingStroke;
            });
            return id;
          },

          moveDrawings: (ids, dx, dy) => set((draft) => {
            for (const id of ids) {
              const drawing = draft.objects.drawings[id];
              if (!drawing) continue;
              for (const point of drawing.points) {
                point.x += dx;
                point.y += dy;
              }
            }
          }),

          updateDrawings: (ids, updates) => set((draft) => {
            for (const id of ids) {
              const drawing = draft.objects.drawings[id];
              if (drawing) Object.assign(drawing, updates);
            }
          }),

          duplicateDrawings: (ids) => set((draft) => {
            const offset = 20;
            const newIds: string[] = [];
            for (const id of ids) {
              const original = draft.objects.drawings[id];
              if (!original) continue;
              const newId = `drawing_${Date.now()}_${Math.random().toString(36).slice(2, 11)}`;
              draft.objects.drawings[newId] = {
                ...original,
                id: newId,
                timestamp: Date.now(),
                points: original.points.map((p) => ({ x: p.x + offset, y: p.y + offset })),
              };
              newIds.push(newId);
            }
            if (newIds.length > 0) draft.selectedIds = newIds;
          }),

          deleteDrawing: (id) => set((draft) => {
            if (draft.objects.drawings[id]) {
              delete draft.objects.drawings[id];
              draft.selectedIds = draft.selectedIds.filter(selectedId => selectedId !== id);
            }
          }),

          clearDrawings: () => set((draft) => {
            draft.objects.drawings = {};
          }),

          setDrawings: (drawings) => set((draft) => {
            // Create a new object to ensure Immer detects the change
            draft.objects.drawings = { ...drawings };
          }),

          // Fog actions
          addFogOperation: (data) => {
            const id = `fog_${Date.now()}_${Math.random().toString(36).slice(2, 11)}`;
            set((draft) => {
              const op: FogOperation = {
                id,
                kind: 'fog',
                timestamp: Date.now(),
                ...data,
              };
              draft.objects.fog[id] = op;
            });
            return id;
          },

          deleteFogOperation: (id) => set((draft) => {
            if (draft.objects.fog[id]) {
              delete draft.objects.fog[id];
              draft.selectedIds = draft.selectedIds.filter(sid => sid !== id);
            }
          }),

          deleteFogOperations: (ids) => set((draft) => {
            for (const id of ids) {
              delete draft.objects.fog[id];
            }
            draft.selectedIds = draft.selectedIds.filter(sid => !ids.includes(sid));
          }),

          duplicateFogOperations: (ids) => set((draft) => {
            if (!ids || !Array.isArray(ids)) return;
            const newIds: string[] = [];
            ids.forEach(id => {
              const original = draft.objects.fog[id];
              if (original && !original.isErasing) {
                const newId = `fog_${Date.now()}_${Math.random().toString(36).slice(2, 11)}`;
                const offset = 40;
                draft.objects.fog[newId] = {
                  ...original,
                  id: newId,
                  timestamp: Date.now(),
                  offsetX: (original.offsetX ?? 0) + offset,
                  offsetY: (original.offsetY ?? 0) + offset,
                };
                newIds.push(newId);
              }
            });
            draft.selectedIds = newIds;
          }),

          setFogOperations: (fog) => set((draft) => {
            draft.objects.fog = { ...fog };
          }),

          clearFog: () => set((draft) => {
            draft.objects.fog = {};
          }),

          // Vision dirty flag (non-persisted)
          _visionDirty: false,
          markVisionDirty: () => set((draft) => { draft._visionDirty = true; }),
          consumeVisionDirty: () => {
            const dirty = get()._visionDirty;
            if (dirty) set((draft) => { draft._visionDirty = false; });
            return dirty;
          },

          // Audio dirty flag
          _audioDirty: false,
          markAudioDirty: () => set((draft) => { draft._audioDirty = true; }),
          consumeAudioDirty: () => {
            const dirty = get()._audioDirty;
            if (dirty) set((draft) => { draft._audioDirty = false; });
            return dirty;
          },

          // Wall actions
          addWall: (data) => {
            const id = `wall_${Date.now()}_${Math.random().toString(36).slice(2, 11)}`;
            set((draft) => {
              draft.objects.walls[id] = { id, kind: 'wall', ...data };
              draft._visionDirty = true;
              draft._audioDirty = true;
            });
            return id;
          },

          updateWall: (id, changes) => set((draft) => {
            const wall = draft.objects.walls[id];
            if (wall) {
              Object.assign(wall, changes);
              draft._visionDirty = true;
              draft._audioDirty = true;
            }
          }),

          deleteWall: (id) => set((draft) => {
            delete draft.objects.walls[id];
            draft.selectedIds = draft.selectedIds.filter(sid => sid !== id);
            draft._visionDirty = true;
            draft._audioDirty = true;
          }),

          deleteWalls: (ids) => set((draft) => {
            for (const id of ids) {
              delete draft.objects.walls[id];
            }
            draft.selectedIds = draft.selectedIds.filter(sid => !ids.includes(sid));
            draft._visionDirty = true;
            draft._audioDirty = true;
          }),

          toggleDoor: (id) => set((draft) => {
            const wall = draft.objects.walls[id];
            if (wall && (wall.type === 'door' || wall.type === 'secret-door')) {
              wall.closed = !(wall.closed ?? true);
              draft._visionDirty = true;
              draft._audioDirty = true;
            }
          }),

          // Light actions
          addLight: (data) => {
            const id = `light_${Date.now()}_${Math.random().toString(36).slice(2, 11)}`;
            set((draft) => {
              draft.objects.lights[id] = { id, kind: 'light', ...data };
              draft._visionDirty = true;
            });
            return id;
          },

          updateLight: (id, changes) => set((draft) => {
            const light = draft.objects.lights[id];
            if (light) {
              Object.assign(light, changes);
              draft._visionDirty = true;
            }
          }),

          deleteLight: (id) => set((draft) => {
            delete draft.objects.lights[id];
            draft.selectedIds = draft.selectedIds.filter(sid => sid !== id);
            draft._visionDirty = true;
          }),

          // Audio actions
          addAudio: (data) => {
            const id = `audio_${Date.now()}_${Math.random().toString(36).slice(2, 11)}`;
            set((draft) => {
              draft.objects.audios[id] = { id, kind: 'audio', ...data };
              draft._audioDirty = true;
            });
            return id;
          },

          updateAudio: (id, changes) => set((draft) => {
            const audio = draft.objects.audios[id];
            if (audio) {
              Object.assign(audio, changes);
              draft._audioDirty = true;
            }
          }),

          deleteAudio: (id) => set((draft) => {
            delete draft.objects.audios[id];
            draft.selectedIds = draft.selectedIds.filter(sid => sid !== id);
            draft._audioDirty = true;
          }),

          // Clear all map state when switching maps
          clearMapState: () => set((draft) => {
            // Preserve the mapPath as it's needed for storage operations
            
            // Create completely fresh empty objects to ensure no state bleeds through
            draft.objects = {
              tokens: {},
              fog: {},
              pins: {},
              texts: {},
              drawings: {},
              walls: {},
              lights: {},
              audios: {},
            };
            // Reset grid to defaults
            draft.grid = {
              enabled: true,
              visible: true,
              snapToGrid: true,
              type: 'square',
              size: 70,
              offsetX: 0,
              offsetY: 0,
              color: '#00FFFF',
              opacity: 0.5,
              lineType: 'solid',
              lineWidth: 1
            };
            // Reset camera to origin
            draft.camera = { x: 0, y: 0, scale: 1 };
            draft.selectedIds = [];
            draft.dmNotePath = null;
            // Maps without saved widgets must not inherit the previous map's
            draft.widgetSettings = createDefaultWidgets();
            draft.widgetValues = {};

            // Note: We don't clear background here - it will be set by the new map
            // Note: We don't clear mapPath - it must be preserved for storage adapter
            
          }),

          // Token ring actions
          setTokenRing: (id, color) => set((draft) => {
            const existing = draft.objects.tokens[id];
            if (!existing) {
              console.warn(`[ViewStore-${viewId}] setTokenRing: token not found`, id);
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
            };
          }),
          
          // Token condition actions
          addTokenCondition: (tokenId, conditionId) => set((draft) => {
            const token = draft.objects.tokens[tokenId];
            if (!token) {
              console.warn(`[ViewStore-${viewId}] addTokenCondition: token not found`, tokenId);
              return;
            }

            const current = token.conditions ?? [];
            if (!current.includes(conditionId)) {
              token.conditions = [...current, conditionId];
            }
          }),

          removeTokenCondition: (tokenId, conditionId) => set((draft) => {
            const token = draft.objects.tokens[tokenId];
            if (!token) {
              console.warn(`[ViewStore-${viewId}] removeTokenCondition: token not found`, tokenId);
              return;
            }

            const current = (token.conditions ?? []).filter((c: string) => c !== conditionId);
            if (current.length > 0) {
              token.conditions = current;
            } else {
              delete token.conditions;
            }
          }),

          setTokenSize: (tokenId, size) => set((draft) => {
            const token = draft.objects.tokens[tokenId];
            if (!token) {
              console.warn(`[ViewStore-${viewId}] setTokenSize: token not found`, tokenId);
              return;
            }
            token.size = size;
          }),

          clearTokenConditions: (id) => set((draft) => {
            const token = draft.objects.tokens[id];
            if (!token) {
              console.warn(`[ViewStore-${viewId}] clearTokenConditions: token not found`, id);
              return;
            }

            delete token.conditions;
          }),

          // Kill tokens - set HP to 0
          killTokens: (ids) => set((draft) => {
            if (!ids || !Array.isArray(ids)) {
              console.warn(`[ViewStore-${viewId}] Invalid ids provided to killTokens:`, ids);
              return;
            }

            const updatedTokens = { ...draft.objects.tokens };
            ids.forEach(id => {
              const existing = updatedTokens[id];
              if (existing) {
                const updated = { ...existing } as any;
                
                // Set HP to 0 - handle both number and object formats
                if (typeof updated.hp === 'object' && updated.hp !== null) {
                  updated.hp = { ...updated.hp, current: 0 };
                } else {
                  updated.hp = 0;
                }
                
                updatedTokens[id] = updated;
              }
            });

            draft.objects.tokens = updatedTokens;
          }),

          // Reset tokens - restore HP and stress, clear statuses
          resetTokens: (ids) => set((draft) => {
            if (!ids || !Array.isArray(ids)) {
              console.warn(`[ViewStore-${viewId}] Invalid ids provided to resetTokens:`, ids);
              return;
            }

            const updatedTokens = { ...draft.objects.tokens };
            ids.forEach(id => {
              const existing = updatedTokens[id];
              if (existing) {
                const updated = { ...existing } as any;
                
                // Reset HP to max - handle both number and object formats
                if (typeof updated.hp === 'object' && updated.hp !== null && updated.hp.max) {
                  updated.hp = { ...updated.hp, current: updated.hp.max };
                } else if (typeof updated.hp === 'number') {
                  // For number format, we can't know the original max, so keep current value
                  // This case is mainly for backward compatibility
                }
                
                // Reset stress to 0
                updated.stress = 0;
                
                // Clear all conditions
                delete updated.conditions;
                
                updatedTokens[id] = updated;
              }
            });

            draft.objects.tokens = updatedTokens;
          }),

          // --- Initiative Tracker State & Actions (from initiativeSlice.ts) ---
          initiative: createDefaultInitiativeState(),
          initiativeTrackerOpen: false,
          ...createInitiativeActions(set, viewId),

          // --- Dice Roll Log (persisted per map) ---
          diceLog: [],
          addDiceLogEntry: (entry: DiceRollResult) => set((draft) => {
            draft.diceLog.unshift(entry);
            if (draft.diceLog.length > 20) {
              draft.diceLog = draft.diceLog.slice(0, 20);
            }
          }),
          clearDiceLog: () => set((draft) => {
            draft.diceLog = [];
          }),

          // --- Per-view UI visibility (from uiSlice.ts) ---
          ...createInitialUIState(),
          ...createUIActions(set),

        })),
        {
          name: `atlas-view-${viewId}`,
          
          // Create a unique storage adapter for this view that uses this store instance
          storage: createDelayedStorage(),
          
          // Store version for migrations
          version: ATLAS_VERSION,
          
          // Skip automatic hydration on store creation
          skipHydration: true,
          
          // Only persist relevant parts of state (check per-store persistence control)
          partialize: (state): PersistedViewState => {
            // Use per-store persistence control instead of global
            if (!state.persistenceEnabled) {
              return {};
            }
            
            return {
              schema: state.schema,
              version: state.version,
              mapPath: state.mapPath, // Include mapPath to verify data belongs to correct map
              background: state.background,
              grid: state.grid,
              objects: state.objects,
              camera: state.camera,
              widgetValues: state.widgetValues, // Only persist widget values, not definitions
              widgetSettings: state.widgetSettings, // Keep for backward compatibility
              dmNotePath: state.dmNotePath, // DM note linking
              tokenSettings: state.tokenSettings, // Token display settings
              initiative: state.initiative, // Initiative tracker state
              initiativeTrackerOpen: state.initiativeTrackerOpen, // Initiative tracker open/closed state
              diceLog: state.diceLog, // Dice roll history (last 20 per map)
            };
          },
          
          onRehydrateStorage: () => {
            return (_state, error) => {
              if (error) {
                console.error(`[ViewStore-${viewId}] Hydration failed:`, error);
              }
            };
          }
        }
      )
    ),
    // Undo/redo tracks objects, grid, background and widgetValues only;
    // selection, camera, tool and loading state never enter the history.
    // storeRef is assigned right after creation, before any history call.
    createHistoryOptions<ViewAtlasState>(() => storeRef!.getState())
  )
);

  // Set the store reference after creation
  storeRef = store;

  // Immer types `setState` with draft updaters, and WritableDraft<ViewAtlasState> is not
  // assignable back to ViewAtlasState because the state holds the Obsidian `plugin`.
  // The public type keeps the plain StoreApi `setState`, which the Immer store also honours.
  const publicStore = store as unknown as Omit<ViewAtlasStore, 'flushStorage'>;

  // Expose the storage flush method on the store for tab-switch save coordination
  return Object.assign(publicStore, {
    flushStorage: async (): Promise<void> => {
      if (delayedStorageRef && typeof delayedStorageRef.flush === 'function') {
        await delayedStorageRef.flush();
      }
    },
  });
}
