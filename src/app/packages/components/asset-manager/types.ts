import { App as ObsidianApp, Modal } from 'obsidian';
import type { KeyboardEvent, MouseEvent } from 'react';
import type { CollectionMetadata, EncounterAsset as StoredEncounterAsset } from '../../../services/AssetService';

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
//
// View models of the records stored by AssetService (the source of truth),
// produced by `formatServiceAsset`: `type` is the tab the asset is shown on and
// the `*Url` fields are resolved vault resource URLs.

export interface Asset {
  id: string;
  name: string;
  type: Tab;
  thumbnailUrl?: string;
  filePath?: string;
  folderId?: string | null;
  tags?: string[];
}

export interface TokenAsset extends Asset {
  /** False preserves the whole artwork without an Atlas frame. Defaults to true. */
  showRing?: boolean;
  type: 'tokens';
  imageUrl: string;
  imagePath?: string;
  size?: number;
  statblockPath?: string;
}

export interface MapAsset extends Asset {
  type: 'maps';
  imageUrl: string;
  /** Vault path of the map image. */
  mapFilePath: string;
}

export interface SceneAsset extends Asset {
  type: 'scenes';
}

export interface EncounterTokenPreview {
  url: string;
  showRing?: boolean;
  ringColor?: string;
}

export interface EncounterAsset extends Asset {
  type: 'encounters';
  description?: string;
  tokens: StoredEncounterAsset['tokens'];
  /** Previews of the first tokens: thumbnails where they exist, framed like the spawned token. */
  tokenPreviews: EncounterTokenPreview[];
  /** Grid the token layout was captured on. Absent for encounters saved without positions. */
  formation?: StoredEncounterAsset['formation'];
  difficulty?: StoredEncounterAsset['difficulty'];
}

export type AnyAsset = TokenAsset | MapAsset | SceneAsset | EncounterAsset;

// ─── Folder ─────────────────────────────────────────────────────────

export interface Folder {
  id: string;
  name: string;
  type: Tab;
  parentId?: string | null;
  path: string;
}

// ─── Tag ────────────────────────────────────────────────────────────

/** A collection as the asset manager lists it: selected by id, shown by name, followed across folder renames by uid. */
export type CollectionOption = Pick<CollectionMetadata, 'id' | 'uid' | 'name'>;

export interface Tag {
  id: string;
  name: string;
}

// ─── Constants ──────────────────────────────────────────────────────

export const ATLAS_VTT_DIR = 'atlas-vtt';

// ─── Selection ──────────────────────────────────────────────────────

/** The click or key press that selects an item; only modifier keys and the target are read. */
export type SelectionEvent = MouseEvent | KeyboardEvent;

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
