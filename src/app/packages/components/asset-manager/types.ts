import { App as ObsidianApp, Modal } from 'obsidian';
import type { TokenStateSnapshot } from '../../../types';
import type { CellCoord, EncounterFormation } from '../../../encounters/encounterFormation';

// ─── Tab / View Constants ───────────────────────────────────────────

export const tabs = ['scenes', 'maps', 'encounters', 'tokens'] as const;
export type Tab = (typeof tabs)[number];

export const getTabDisplayName = (tab: Tab): string => {
  switch (tab) {
    case 'tokens':
      return 'Characters';
    default:
      return tab;
  }
};

export type SortOption = 'name' | 'date' | 'type';
export type SortOrder = 'asc' | 'desc';

// ─── Asset Types ────────────────────────────────────────────────────

export interface Asset {
  id: string;
  name: string;
  type: Tab | 'characters';
  thumbnailUrl?: string;
  filePath?: string;
  folderId?: string | null;
  tags?: string[];
}

export interface ImageAsset extends Asset {
  type: 'maps' | 'scenes';
  imageUrl: string;
  width?: number;
  height?: number;
}

export interface TokenAsset extends Asset {
  type: 'tokens';
  imageUrl: string;
  imagePath?: string;
  size?: number;
  statblockPath?: string;
}

export interface MapAsset extends Asset {
  type: 'maps';
  imageUrl: string;
  gridSize?: number;
  dimensions?: { width: number; height: number };
}

export interface SceneAsset extends Asset {
  type: 'scenes';
  mapId?: string;
  description?: string;
}

export interface CharacterAsset extends Asset {
  type: 'characters';
  tokenImageUrl?: string;
  isStatblock?: boolean;
  notePath?: string;
}

export interface EncounterAsset extends Asset {
  type: 'encounters';
  description?: string;
  tokens: {
    id: string;
    name: string;
    imagePath: string;
    x?: number;
    y?: number;
    statblockPath?: string;
    size?: number;
    /** Cell offset from the encounter's anchor token (see EncounterFormation). */
    cell?: CellCoord;
    /** Pitch-normalised world offset from the anchor token. */
    offset?: { x: number; y: number };
    /** Full token state at save time (HP, conditions, statblock link, ...). Restored verbatim on spawn. */
    state?: TokenStateSnapshot;
  }[];
  /** Grid the token layout was captured on. Absent for encounters saved without positions. */
  formation?: EncounterFormation;
  difficulty?: 'easy' | 'medium' | 'hard' | 'deadly';
  thumbnailUrl?: string;
}

export type AnyAsset =
  | ImageAsset
  | TokenAsset
  | MapAsset
  | SceneAsset
  | CharacterAsset
  | EncounterAsset;

// ─── Folder ─────────────────────────────────────────────────────────

export interface Folder {
  id: string;
  name: string;
  type: Tab;
  parentId?: string | null;
  path: string;
}

// ─── Tag ────────────────────────────────────────────────────────────

export interface Tag {
  id: string;
  name: string;
}

// ─── Constants ──────────────────────────────────────────────────────

export const ATLAS_VTT_DIR = 'atlas-vtt';

// ─── Input Modal State ──────────────────────────────────────────────

export interface InputModalState {
  isOpen: boolean;
  title: string;
  placeholder?: string;
  defaultValue?: string;
  onConfirm: (value: string) => void;
  validation?: (value: string) => string | null;
}

// ─── Component Props ────────────────────────────────────────────────

export interface AssetManagerProps {
  isOpen: boolean;
  onClose: () => void;
  initialTab?: Tab;
}

// ─── Helpers ────────────────────────────────────────────────────────

export async function showConfirmationModal(
  app: ObsidianApp,
  title: string,
  message: string
): Promise<boolean> {
  return new Promise((resolve) => {
    const modal = new (class extends Modal {
      onOpen(): void {
        const { contentEl } = this;
        contentEl.createEl('h2', { text: title });
        contentEl.createEl('p', { text: message });

        const buttonContainer = contentEl.createDiv('modal-button-container');

        const confirmBtn = buttonContainer.createEl('button', {
          text: 'Continue',
          cls: 'mod-cta',
        });
        confirmBtn.addEventListener('click', () => {
          resolve(true);
          this.close();
        });

        const cancelBtn = buttonContainer.createEl('button', {
          text: 'Cancel',
        });
        cancelBtn.addEventListener('click', () => {
          resolve(false);
          this.close();
        });
      }

      onClose(): void {
        resolve(false);
      }
    })(app);

    modal.open();
  });
}
