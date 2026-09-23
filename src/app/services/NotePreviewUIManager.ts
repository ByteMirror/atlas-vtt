import { App, WorkspaceLeaf, TFile, EventRef } from 'obsidian';
import { EventEmitter } from 'events';
import type { FederatedPointerEvent } from 'pixi.js';
import type { NotePin } from '../types';
import type { TokenVitals } from './statblockVitalsSync';
import { NotePreviewWindow } from './NotePreviewWindow';
import { StatblockPreviewWindow } from './StatblockPreviewWindow';
import { findCreatureForNotePath } from './FantasyStatblocksService';
import { MapLinkPreview } from './MapLinkPreview';
import { runInBackground } from '../utils/backgroundTask';

/**
 * A hovered token presented to the preview system like a pin on its linked
 * statblock note. The vitals travel with it so the statblock preview can mirror them.
 */
export interface TokenPreviewAnchor extends TokenVitals {
  id: string;
  notePath: string;
  x: number;
  y: number;
  type: 'token';
}

/** What a hover preview is anchored to: a map pin or a token. */
export type PreviewAnchor = NotePin | TokenPreviewAnchor;

// Common interface for preview windows
interface IPreviewWindow {
  notePath: string;
  element: HTMLElement | null;
  originatingPin?: PreviewAnchor | null;
  setPosition(x: number, y: number): void;
  getIsPinned(): boolean;
  hide(force?: boolean): void;
}

/** Preview windows cycle below this so they stay under the asset manager (50). */
const MAX_PREVIEW_Z_INDEX = 45;

/** Hover and pin events a map view's event bus sends to the preview manager. */
interface PinHoverEvent {
  pin: PreviewAnchor;
  screenX: number;
  screenY: number;
  pixiEvent?: FederatedPointerEvent;
  sourceLeaf?: WorkspaceLeaf | null;
}

/** Views whose activation keeps hover previews open. */
const ATLAS_MAP_VIEW_TYPES = new Set(['atlas-vtt', 'atlas-vtt-player']);

/**
 * Owns every CMD/Ctrl+hover preview window. One instance lives for the whole
 * plugin, so pinned previews survive scene tab switches and a closed map;
 * each map view only connects its event bus while it is open.
 */
export class NotePreviewUIManager {
  private app: App;
  private activePreviews: Map<string, IPreviewWindow> = new Map();
  private isModifierKeyDown = false;
  private lastHoveredPinId: string | null = null;
  /** Element under the pointer, kept until it leaves; replayed on each CMD/Ctrl press. */
  private currentHover: {
    pin: PreviewAnchor;
    screenX: number;
    screenY: number;
    sourceLeaf: WorkspaceLeaf | null;
  } | null = null;
  private boundHideAllUnpinnedPreviewsOnBlur!: () => void;
  private boundHandleKeyDown!: (e: KeyboardEvent) => void;
  private boundHandleKeyUp!: (e: KeyboardEvent) => void;
  private boundHandleFocus!: () => void;
  private activeLeafChangeRef: EventRef | null = null;
  private zIndexCounter = 5; // stay below asset manager (50) and Obsidian overlays (~1000)

  constructor(app: App) {
    this.app = app;

    // Styles are loaded via styles/main.scss → note-preview-window.scss
    this.boundHideAllUnpinnedPreviewsOnBlur = () => this.hideAllUnpinnedPreviews();
    this.initializeGlobalListeners();
  }

  /**
   * Routes a map view's hover and pin events to this manager. The returned
   * function disconnects the view and closes its unpinned previews; pinned
   * previews stay open until the user closes them.
   */
  public connect(eventBus: EventEmitter): () => void {
    const onHover = (data: PinHoverEvent): void => {
      // Always update last hovered ID for proper cleanup
      this.lastHoveredPinId = data.pin.id;

      // Check the actual key state from the event if available, otherwise fall back to tracked state
      let modifierKeyDown = this.isModifierKeyDown;
      if (data.pixiEvent) {
        modifierKeyDown = data.pixiEvent.metaKey || data.pixiEvent.ctrlKey;
      }

      // Hover events only fire when the hovered element changes, so remember
      // the hover: every later modifier press replays it.
      this.currentHover = { pin: data.pin, screenX: data.screenX, screenY: data.screenY, sourceLeaf: data.sourceLeaf ?? null };
      if (modifierKeyDown) {
        this.showPreviewFor(this.currentHover);
      }
    };

    const onHide = (data: { pin: PreviewAnchor }): void => {
      if (this.lastHoveredPinId === data.pin.id) {
        this.lastHoveredPinId = null; // Clear last hovered if mouse moves off it
      }
      if (this.currentHover?.pin.id === data.pin.id) {
        this.currentHover = null;
      }
      // Only hide if not pinned and modifier is not down.
      // If modifier is still down, a new 'pin-hover-preview' will trigger for the new element.
      if (!this.isModifierKeyDown) {
        this.hidePreview(data.pin.id, false); // false = don't force if pinned
      }
    };

    const onClose = (notePath: string): void => {
      this.hidePreview(notePath, true); // true to force hide even if pinned
    };

    eventBus.on('pin-hover-preview', onHover);
    eventBus.on('pin-hide-preview', onHide);
    eventBus.on('close-active-preview', onClose);

    return () => {
      eventBus.off('pin-hover-preview', onHover);
      eventBus.off('pin-hide-preview', onHide);
      eventBus.off('close-active-preview', onClose);
      this.currentHover = null;
      this.lastHoveredPinId = null;
      this.hideAllUnpinnedPreviews();
      // The view may close while its asset manager has the previews suspended
      this.resumePreviews();
    };
  }

  private initializeGlobalListeners(): void {
    // Bind methods to preserve 'this' context
    this.boundHandleKeyDown = this.handleKeyDown.bind(this);
    this.boundHandleKeyUp = this.handleKeyUp.bind(this);
    this.boundHandleFocus = () => {
      this.isModifierKeyDown = false;
    };

    document.addEventListener('keydown', this.boundHandleKeyDown);
    document.addEventListener('keyup', this.boundHandleKeyUp);
    window.addEventListener('blur', this.boundHideAllUnpinnedPreviewsOnBlur);

    // Reset modifier key state when window gains focus to avoid stuck state
    window.addEventListener('focus', this.boundHandleFocus);

    // Leaving the map closes hover previews; pinned ones float on over the workspace
    this.activeLeafChangeRef = this.app.workspace.on('active-leaf-change', (leaf: WorkspaceLeaf | null) => {
      if (!leaf) return;
      const viewType = leaf.view?.getViewType?.();
      if (!viewType || !ATLAS_MAP_VIEW_TYPES.has(viewType)) {
        this.hideAllUnpinnedPreviews();
      }
    });
  }

  private showPreviewFor(hover: NonNullable<typeof this.currentHover>): void {
    runInBackground(
      this.showOrCreatePreview(hover.pin, hover.screenX, hover.screenY, hover.sourceLeaf),
      'Showing note preview',
    );
  }

  private handleKeyDown(e: KeyboardEvent): void {
    if (e.metaKey || e.ctrlKey) {
      const justPressed = !this.isModifierKeyDown;
      this.isModifierKeyDown = true;
      if (justPressed && this.currentHover) {
        this.showPreviewFor(this.currentHover);
      }
    } else if (e.key === 'Escape') {
        this.hideAllUnpinnedPreviews(); // Or all previews including pinned ones
    }
  }

  private handleKeyUp(e: KeyboardEvent): void {
    if (!e.metaKey && !e.ctrlKey) {
      this.isModifierKeyDown = false;
      // Always hide all unpinned previews when modifier is released
      this.hideAllUnpinnedPreviews();
    }
  }
  
  public handlePreviewClosed(notePath: string, originatingPin?: PreviewAnchor): void {
    // Find and remove the specific preview instance
    if (originatingPin) {
      // We need to use the original pin.notePath (with header) for the key
      const key = `${originatingPin.notePath}::${originatingPin.id}`;
      if (this.activePreviews.has(key)) {
        this.activePreviews.delete(key);
      }
    } else {
      // Fallback: remove any preview with this note path
      for (const [key, preview] of this.activePreviews.entries()) {
        if (preview.notePath === notePath) {
          this.activePreviews.delete(key);
        }
      }
    }
  }
  
  public async showOrCreatePreview(
    pin: PreviewAnchor,
    screenX: number,
    screenY: number,
    sourceLeaf?: WorkspaceLeaf | null,
  ): Promise<void> {

    // First, check if we already have a preview for this exact pin
    const existingPreviewForPin = Array.from(this.activePreviews.values()).find(
      p => p.originatingPin?.id === pin.id
    );
    
    if (existingPreviewForPin) {
      // If it's unpinned, update its position
      if (!existingPreviewForPin.getIsPinned()) {
        existingPreviewForPin.setPosition(screenX, screenY);
        this.raiseZIndex(existingPreviewForPin);
      } else {
        // If it's pinned, just bring it to front without moving
        this.raiseZIndex(existingPreviewForPin);
      }
      return;
    }

    // Hide all unpinned previews before creating a new one
    this.hideAllUnpinnedPreviews();
    
    // Extract the base file path without header
    const hashIndex = pin.notePath.indexOf('#');
    const baseNotePath = hashIndex !== -1 ? pin.notePath.substring(0, hashIndex) : pin.notePath;
    
    // Check file type for specialized previews
    const file = this.app.vault.getAbstractFileByPath(baseNotePath);
    if (file instanceof TFile) {
      // Atlas map files → lightweight tooltip with thumbnail + "Open Map" button
      if (file.extension === 'atlasmap') {
        const mapPreview = new MapLinkPreview(
          this.app,
          file,
          pin,
          this,
          { x: screenX, y: screenY }
        );

        if (mapPreview.element) {
          const previewKey = `${pin.notePath}::${pin.id}`;
          this.activePreviews.set(previewKey, mapPreview);
          this.raiseZIndex(mapPreview);
        }
        return;
      }

      // Notes backed by a Fantasy Statblocks creature → rich statblock preview for tokens
      const isStatblock = findCreatureForNotePath(file.path) !== null;

      if (isStatblock && 'type' in pin && pin.type === 'token') {
        const statblockPreview = new StatblockPreviewWindow(
          this.app, 
          pin.notePath, 
          pin,
          this, 
          { x: screenX, y: screenY }
        );
        
        if (statblockPreview.element) {
          const previewKey = `${pin.notePath}::${pin.id}`;
          this.activePreviews.set(previewKey, statblockPreview);
          this.raiseZIndex(statblockPreview);
          statblockPreview.element.addEventListener('mousedown', () => this.raiseZIndex(statblockPreview));
        } else {
          console.warn('[NotePreviewUIManager] Statblock preview element is null');
        }
        return;
      }
    }
    
    // Create a normal note preview window
    const newPreview = new NotePreviewWindow(
      this.app,
      pin.notePath,
      pin,
      this,
      { x: screenX, y: screenY },
      sourceLeaf ?? null,
    );
    
    // Check if the preview was actually created
    if (newPreview.element) {
      // Use a unique key that includes both the note path and pin ID to allow multiple previews
      const previewKey = `${pin.notePath}::${pin.id}`;
      this.activePreviews.set(previewKey, newPreview);
      this.raiseZIndex(newPreview);
      newPreview.element.addEventListener('mousedown', () => this.raiseZIndex(newPreview));
    }
  }

  /**
   * Incremental z-index raise so the focused preview stays on top
   */
  private raiseZIndex(preview: IPreviewWindow): void {
    this.zIndexCounter = (this.zIndexCounter + 1) % MAX_PREVIEW_Z_INDEX;
    if (this.zIndexCounter < 5) this.zIndexCounter = 5; // maintain minimum

    if (preview.element) {
      preview.element.style.zIndex = `${this.zIndexCounter}`;
    }
  }

  public hidePreview(notePathOrPinId: string, force: boolean = false): void {
    // Try to find the preview by pin ID or note path
    let preview: IPreviewWindow | undefined;
    
    for (const [key, p] of this.activePreviews.entries()) {
      if (p.originatingPin?.id === notePathOrPinId || p.notePath === notePathOrPinId || key === notePathOrPinId) {
        preview = p;
        break;
      }
    }
    
    if (preview) {
      if (!preview.getIsPinned() || force) {
        preview.hide();
        // Note: The preview will call handlePreviewClosed which will remove it from the map
      }
    }
  }

  public hideAllUnpinnedPreviews(excludeNotePath?: string | null): void {
    this.activePreviews.forEach((preview) => {
      if (preview.notePath === excludeNotePath && this.isModifierKeyDown) return; // Don't hide if it's the current hover target & mod down
      if (!preview.getIsPinned()) {
        preview.hide();
      }
    });
  }
  
  /**
   * Clears previews out of the way while the asset manager covers the map:
   * hover previews close, pinned ones are only hidden until `resumePreviews`.
   */
  public suspendPreviews(): void {
    this.hideAllUnpinnedPreviews();
    this.activePreviews.forEach((preview) => preview.element?.hide());
  }

  /** Shows the pinned previews hidden by `suspendPreviews` again. */
  public resumePreviews(): void {
    this.activePreviews.forEach((preview) => preview.element?.show());
  }

  public destroy(): void {
    document.removeEventListener('keydown', this.boundHandleKeyDown);
    document.removeEventListener('keyup', this.boundHandleKeyUp);
    window.removeEventListener('blur', this.boundHideAllUnpinnedPreviewsOnBlur);
    window.removeEventListener('focus', this.boundHandleFocus);
    if (this.activeLeafChangeRef) {
      this.app.workspace.offref(this.activeLeafChangeRef);
      this.activeLeafChangeRef = null;
    }
    this.activePreviews.forEach(preview => preview.hide(true));
    this.activePreviews.clear();
  }
} 
