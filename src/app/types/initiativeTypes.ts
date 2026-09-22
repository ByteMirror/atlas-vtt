/**
 * Initiative Tracker Types
 * Baldur's Gate 3-inspired initiative system for combat tracking
 */

/**
 * Configuration for the initiative tracker
 */
export interface InitiativeConfig {
  /** Whether to auto-sort entries by initiative value after rolling */
  autoSort: boolean;
}

/**
 * A single entry in the initiative tracker
 */
export interface InitiativeEntry {
  /** Unique identifier for this entry */
  id: string;

  /** Reference to the token on the map */
  tokenId: string;

  /** Display name */
  name: string;

  /** Rolled initiative value (after modifiers) */
  initiative: number;

  /** Initiative modifier from statblock/character */
  initiativeModifier: number;

  /** Health points */
  hp: {
    current: number;
    max: number;
  };

  /** Stress points (optional, for systems like Daggerheart); `undefined` clears them when patched */
  stress?: {
    current: number;
    max: number;
  } | undefined;

  /** Path to token image for avatar display */
  imagePath: string;

  /** Path to linked statblock note (for CMD+hover preview); `undefined` clears it when patched */
  statblockPath?: string | undefined;

  /** Whether this entry has the current turn */
  isActive: boolean;

  /** Whether the entry is defeated (HP <= 0) */
  isDefeated: boolean;

  /** Whether this is an NPC (vs player character) */
  isNPC: boolean;

  /** Order in the initiative list (for manual reordering) */
  order: number;
}

/**
 * Full state for the initiative tracker
 */
export interface InitiativeState {
  /** All entries in the initiative order */
  entries: InitiativeEntry[];

  /** Index of the currently active entry */
  currentIndex: number;

  /** Current combat round number */
  round: number;

  /** Whether combat is currently active */
  isActive: boolean;

  /** Configuration for initiative calculation */
  config: InitiativeConfig;

  /** Token IDs explicitly removed — auto-sync skips these */
  removedTokenIds: string[];
}

/**
 * Default configuration for initiative
 */
export const DEFAULT_INITIATIVE_CONFIG: InitiativeConfig = {
  autoSort: true,
};

/**
 * Default empty initiative state
 */
export const createDefaultInitiativeState = (): InitiativeState => ({
  entries: [],
  currentIndex: -1,
  round: 0,
  isActive: false,
  config: { ...DEFAULT_INITIATIVE_CONFIG },
  removedTokenIds: [],
});
