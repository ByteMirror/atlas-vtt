/**
 * Initiative Tracker State Slice
 * Provides initiative actions that can be spread into the main store
 */

import type { Character } from '../types';
import type { InitiativeState, InitiativeEntry, InitiativeConfig } from '../types/initiativeTypes';
import { createDefaultInitiativeState } from '../types/initiativeTypes';

/**
 * Initiative slice state interface
 * These fields are added to ViewAtlasState
 */
export interface InitiativeSlice {
  // State
  initiative: InitiativeState;
  initiativeTrackerOpen: boolean;

  // Actions
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
}

/**
 * Store state type that the initiative actions need access to
 */
interface InitiativeStoreState {
  initiative: InitiativeState;
  initiativeTrackerOpen: boolean;
  objects: {
    tokens: Record<string, any>;
  };
}

/**
 * Immer set function type
 */
type ImmerSet = (fn: (draft: InitiativeStoreState) => void) => void;

/**
 * Create the initial initiative state
 */
export function createInitialInitiativeState(): Pick<InitiativeSlice, 'initiative' | 'initiativeTrackerOpen'> {
  return {
    initiative: createDefaultInitiativeState(),
    initiativeTrackerOpen: false,
  };
}

/**
 * Generate a unique initiative entry ID
 */
function generateInitiativeId(): string {
  return `init_${Date.now()}_${Math.random().toString(36).slice(2, 11)}`;
}

/**
 * Roll a d20 (1-20)
 */
function rollD20(): number {
  return Math.floor(Math.random() * 20) + 1;
}

/**
 * Update order indices for all entries after a modification
 */
function updateEntryOrders(entries: InitiativeEntry[]): void {
  entries.forEach((entry, index) => {
    entry.order = index;
  });
}

/**
 * Creates the initiative actions for the store
 * These are spread into the main store's immer state creator
 * @param set - The immer set function from the store
 * @param viewId - The view ID for logging purposes
 */
export function createInitiativeActions(
  set: ImmerSet,
  viewId: string
): Omit<InitiativeSlice, 'initiative' | 'initiativeTrackerOpen'> {
  return {
    setInitiativeTrackerOpen: (open) => set((draft) => {
      draft.initiativeTrackerOpen = open;
    }),

    addToInitiative: (entry) => {
      const id = generateInitiativeId();
      set((draft) => {
        // Clear from removed list so auto-sync won't block future adds
        if (!draft.initiative.removedTokenIds) draft.initiative.removedTokenIds = [];
        const rmIdx = draft.initiative.removedTokenIds.indexOf(entry.tokenId);
        if (rmIdx !== -1) draft.initiative.removedTokenIds.splice(rmIdx, 1);

        const order = draft.initiative.entries.length;
        const newEntry: InitiativeEntry = {
          ...entry,
          id,
          order,
          isActive: draft.initiative.entries.length === 0,
        };
        draft.initiative.entries.push(newEntry);
      });
      return id;
    },

    removeFromInitiative: (id) => set((draft) => {
      const index = draft.initiative.entries.findIndex(e => e.id === id);
      if (index === -1) return;

      const tokenId = draft.initiative.entries[index]!.tokenId;
      const wasActive = draft.initiative.entries[index]!.isActive;
      draft.initiative.entries.splice(index, 1);

      // Track removal so auto-sync doesn't re-add
      if (!draft.initiative.removedTokenIds) draft.initiative.removedTokenIds = [];
      if (!draft.initiative.removedTokenIds.includes(tokenId)) {
        draft.initiative.removedTokenIds.push(tokenId);
      }

      updateEntryOrders(draft.initiative.entries);

      // If removed entry was active, activate the next or previous entry
      if (wasActive && draft.initiative.entries.length > 0) {
        const newActiveIndex = Math.min(index, draft.initiative.entries.length - 1);
        draft.initiative.entries[newActiveIndex]!.isActive = true;
        draft.initiative.currentIndex = newActiveIndex;
      }

    }),

    updateInitiativeEntry: (id, updates) => set((draft) => {
      const entry = draft.initiative.entries.find(e => e.id === id);
      if (entry) {
        const initiativeChanged = updates.initiative !== undefined && updates.initiative !== entry.initiative;
        Object.assign(entry, updates);

        // Re-sort if initiative value changed and autoSort is enabled
        if (initiativeChanged && draft.initiative.config.autoSort) {
          draft.initiative.entries.sort((a, b) => b.initiative - a.initiative);
          updateEntryOrders(draft.initiative.entries);
        }
      }
    }),

    rollAllInitiative: () => set((draft) => {
      draft.initiative.entries.forEach(entry => {
        const roll = rollD20();
        entry.initiative = roll + entry.initiativeModifier;
      });

      // Sort by initiative if autoSort is enabled
      if (draft.initiative.config.autoSort) {
        draft.initiative.entries.sort((a, b) => b.initiative - a.initiative);
        updateEntryOrders(draft.initiative.entries);
      }

    }),

    rollEntryInitiative: (id) => set((draft) => {
      const entry = draft.initiative.entries.find(e => e.id === id);
      if (entry) {
        const roll = rollD20();
        entry.initiative = roll + entry.initiativeModifier;
      }
    }),

    nextTurn: () => set((draft) => {
      if (draft.initiative.entries.length === 0) return;

      // Deactivate current entry
      const currentEntry = draft.initiative.entries.find(e => e.isActive);
      if (currentEntry) {
        currentEntry.isActive = false;
      }

      // Find next entry (wrap around)
      let nextIndex = draft.initiative.currentIndex + 1;
      if (nextIndex >= draft.initiative.entries.length) {
        nextIndex = 0;
        draft.initiative.round++;
      }

      draft.initiative.currentIndex = nextIndex;
      const nextEntry = draft.initiative.entries[nextIndex];
      if (nextEntry) {
        nextEntry.isActive = true;
      }

    }),

    previousTurn: () => set((draft) => {
      if (draft.initiative.entries.length === 0) return;

      // Deactivate current entry
      const currentEntry = draft.initiative.entries.find(e => e.isActive);
      if (currentEntry) {
        currentEntry.isActive = false;
      }

      // Find previous entry (wrap around)
      let prevIndex = draft.initiative.currentIndex - 1;
      if (prevIndex < 0) {
        prevIndex = draft.initiative.entries.length - 1;
        if (draft.initiative.round > 1) {
          draft.initiative.round--;
        }
      }

      draft.initiative.currentIndex = prevIndex;
      const prevEntry = draft.initiative.entries[prevIndex];
      if (prevEntry) {
        prevEntry.isActive = true;
      }

    }),

    reorderInitiative: (fromIndex, toIndex) => set((draft) => {
      const { entries } = draft.initiative;
      if (fromIndex < 0 || fromIndex >= entries.length) return;
      if (toIndex < 0 || toIndex >= entries.length) return;

      const [movedEntry] = entries.splice(fromIndex, 1);
      if (!movedEntry) return;

      entries.splice(toIndex, 0, movedEntry);
      updateEntryOrders(entries);

      // Update currentIndex if the moved entry was active
      if (movedEntry.isActive) {
        draft.initiative.currentIndex = toIndex;
      }
    }),

    moveToFront: (id) => set((draft) => {
      const index = draft.initiative.entries.findIndex(e => e.id === id);
      if (index <= 0) return;

      const [entry] = draft.initiative.entries.splice(index, 1);
      if (!entry) return;

      draft.initiative.entries.unshift(entry);
      updateEntryOrders(draft.initiative.entries);

      if (entry.isActive) {
        draft.initiative.currentIndex = 0;
      }
    }),

    moveToBack: (id) => set((draft) => {
      const { entries } = draft.initiative;
      const index = entries.findIndex(e => e.id === id);
      if (index < 0 || index >= entries.length - 1) return;

      const [entry] = entries.splice(index, 1);
      if (!entry) return;

      entries.push(entry);
      updateEntryOrders(entries);

      if (entry.isActive) {
        draft.initiative.currentIndex = entries.length - 1;
      }
    }),

    startCombat: () => set((draft) => {
      draft.initiative.isActive = true;
      draft.initiative.round = 1;
      draft.initiative.currentIndex = 0;

      // Set first entry as active
      if (draft.initiative.entries.length > 0) {
        draft.initiative.entries.forEach(e => e.isActive = false);
        draft.initiative.entries[0]!.isActive = true;
      }

    }),

    endCombat: () => set((draft) => {
      draft.initiative.isActive = false;
      draft.initiative.round = 0;
      draft.initiative.currentIndex = -1;

      // Clear active state from all entries
      draft.initiative.entries.forEach(e => e.isActive = false);

    }),

    setInitiativeConfig: (config) => set((draft) => {
      draft.initiative.config = { ...draft.initiative.config, ...config };
    }),

    syncInitiativeWithTokens: () => set((draft) => {
      // Update initiative entries with current token HP values
      draft.initiative.entries.forEach(entry => {
        const token = draft.objects.tokens[entry.tokenId] as Character | undefined;
        if (!token) return;

        // Update HP from token
        if (typeof token.hp === 'object' && token.hp !== null) {
          entry.hp = { current: token.hp.current, max: token.hp.max };
        } else if (typeof token.hp === 'number') {
          entry.hp = { current: token.hp, max: token.hp };
        }

        // Update stress if present
        if (token.stress !== undefined) {
          if (typeof token.stress === 'object' && token.stress !== null) {
            entry.stress = { current: token.stress.current, max: token.stress.max };
          } else if (typeof token.stress === 'number') {
            entry.stress = { current: token.stress, max: token.maxStress ?? 10 };
          }
        }

        // Check defeated status
        entry.isDefeated = entry.hp.current <= 0;
      });
    }),
  };
}
