// types.ts
// Shared interfaces and types for Atlas VTT

import type { FogOperation } from './types/fogTypes';


/**
 * Note pin object that links to an Obsidian note
 */
export interface NotePin {
  id: string;
  kind: 'pin';
  x: number;
  y: number;
  notePath: string;
  icon?: string; // Optional icon for customized pins
  label?: string; // Auto-assigned sequence label shown by 'number' / 'letter' pins
  gmOnly?: boolean; // Whether the pin is only visible to the GM
}

export interface AtlasMapData {
  version: number;
  /** Human-readable map name (may be absent in legacy files) */
  name?: string;
  /** Path to background image – preferred canonical field */
  background?: string;
  /** @deprecated Temporary alias for background used by historic code */
  mapImagePath?: string;
  width?: number; // Add optional map width (world width)
  height?: number; // Add optional map height (world height)
  grid?: {
    enabled: boolean;
    size: number;
    offsetX?: number;
    offsetY?: number;
    color?: string;
    opacity?: number;
    mapScale?: number; // Scale factor applied to map during grid alignment
  };
  tokens?: TokenData[];
  pins?: any[];
  fog?: Record<string, FogOperation>;
  textElements?: any[];
}

/** A bounded resource value saved on an individual map token. */
export interface TokenResourceValue {
  current: number;
  max: number;
}

/** Base interface for any token entity. */
export interface BaseToken {
  /** Per-instance resources imported from a statblock beyond HP, stress and hope. */
  statblockResources?: Record<string, TokenResourceValue>;
  id: string;
  x: number;
  y: number;
  imagePath: string;
  tags?: string[];
  /** Hex colour for status ring; undefined ⇢ no ring */
  ringColor?: string;
  /** Active condition IDs referencing ConditionDefinition.id from collection settings */
  conditions?: string[];
  /** Whether the token is hidden (visible to DM but not players) */
  isHidden?: boolean;
  /** Whether this token generates a vision source (player character tokens) */
  hasVision?: boolean;
  /** Whether to show the nameplate (defaults to false) */
  showNameplate?: boolean;
  /** Rotation in degrees (0-360) */
  rotation?: number;
  /** Token size in logical cells (default 1: 1=1x1, 1.5=2x2, 2=3x3, 2.5=4x4, 3=5x5, etc.) */
  size?: number;
  /** Layer for z-ordering (higher values appear on top) */
  layer?: number;
  /** Override collection default inner vision radius (world pixels) */
  visionInnerRadius?: number;
  /** Override collection default outer vision radius (world pixels) */
  visionOuterRadius?: number;
  /** Instance number for distinguishing multiple tokens of the same type (same imagePath) */
  instanceNumber?: number;
}

/**
 * Simple token without character data
 */
export interface Token extends BaseToken {
  kind: 'token';
}

/**
 * Character with HP, name, and optional note link
 */
export interface Character extends BaseToken {
  kind: 'character';
  name: string;
  hp: number | { current: number; max: number }; // Support both simple and complex HP
  stress?: number | { current: number; max: number }; // Current stress level
  maxStress?: number; // Maximum stress (defaults to 10)
  hope?: number | { current: number; max: number }; // Hope tokens for player characters
  difficulty?: string; // CR or tier from statblock
  notePath?: string;
  statblockPath?: string; // Path to linked statblock note
  // Player-linked token properties
  playerLinked?: boolean; // Whether this token is linked to a player character
  playerId?: string; // The player ID who owns this character
  playerCharacterId?: string; // The character ID in the player's character sheet
}

/**
 * Union of token entities
 */
export type TokenEntity = Token | Character;

/**
 * Everything about a token except its identity and map position.
 * Saved with encounters so spawning reproduces the exact token state.
 */
export type TokenStateSnapshot = Omit<TokenEntity, 'id' | 'x' | 'y' | 'instanceNumber'>;

/**
 * Structure for tokens as persisted in .atlasmap JSON file
 */
export interface PersistedToken {
  id: string;
  x: number;
  y: number;
  imagePath: string;
  // Add other relevant fields like rotation, size, etc. if needed
}

// Deprecated: use TokenEntity instead
export interface TokenData {
  id: string;
  x: number;
  y: number;
  radius?: number; // Primary dimension for circular tokens (including image-filled)
  width?: number; // Used only if not circular (e.g., future rectangular tokens)
  height?: number; // Used only if not circular
  rotation?: number; // Rotation in degrees
  imagePath?: string; // Path to image file in vault (used for fillPatternImage if circular)
  naturalWidth?: number; // Original image width, stored for correct pattern scaling
  naturalHeight?: number; // Original image height, stored for correct pattern scaling
  label?: string;
  color?: string; // Fallback color (used if imagePath is missing and token is fallback circle)
  stroke?: string; // Outline color
  strokeWidth?: number; // Outline width
  link?: string;
  statblockPath?: string; // Path to linked statblock note (instance-level override)
  hpCurrent?: number;
  hpMax?: number;
  /** Active condition IDs referencing ConditionDefinition.id from collection settings */
  conditions?: string[];
}

/**
 * Text element object for map annotations
 */
export interface TextElement {
  id: string;
  kind: 'text';
  x: number;
  y: number;
  text: string;
  fontSize: number;
  fontFamily: string;
  color: string;
  backgroundColor?: string;
  padding?: number;
  borderRadius?: number;
  opacity?: number;
  width?: number; // Auto-size if not set
  height?: number; // Auto-size if not set
  align?: 'left' | 'center' | 'right';
  bold?: boolean;
  italic?: boolean;
  /** Rotation in degrees (0-360) */
  rotation?: number;
  /** Text scale multiplier (default 1) */
  scale?: number;
}

export interface DrawingStroke {
  id: string;
  kind: 'drawing';
  timestamp: number;
  type: 'pen' | 'eraser' | 'line' | 'rectangle' | 'circle' | 'icon';
  points: Array<{ x: number; y: number }>;
  color: string;
  /** Line width for strokes, footprint size for `icon` stamps */
  width: number;
  opacity: number;
  /** Key into `MAP_ICON_SVG`; only set when `type` is `'icon'` */
  icon?: string;
}

export type ToolMode =
  | 'move'
  | 'pan'
  | 'select'
  | 'fog-paint'
  | 'fog-erase'
  | 'measure'
  | 'measure-circle'
  | 'measure-cone'
  | 'pointer'
  | 'text'
  | 'note-pin'
  | 'dice'
  | 'laser-pointer'
  | 'draw-pen'
  | 'draw-eraser'
  | 'draw-icon'
  | 'draw-line'
  | 'draw-rectangle'
  | 'draw-circle'
  | 'audio';

 