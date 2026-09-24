import { EventEmitter } from 'events';
import type { NotePin } from '../types';
import type { ViewAtlasState } from '../storeFactory';
import { App, TFile, type WorkspaceLeaf } from 'obsidian';
import type { StoreApi } from 'zustand';
import { runInBackground } from '../utils/backgroundTask';
import { resolvePinIcon } from '../types/pinIcons';
import { createPinIconPalette, type PinIconPalette } from './pinIconPalette';
import { createPinNoteSearch } from './pinNoteSearch';
import type { PinActionEventDetail } from '../types/atlasWindowEvents';
import { animatePanelIn, animatePanelOutAndRemove } from '../ui/panelMotion';

interface NotePinDropdownResult {
  accepted: boolean;
  notePath?: string;
  icon?: string;
}

/**
 * Implements the Note Pin tool - allows adding pins to the map that link to notes
 */
export class NotePinTool {
  private app: App;
  private obsidianApp: App;
  private isActive = false;
  private pinDropdown: HTMLElement | null = null;
  private iconPalette: PinIconPalette | null = null;
  private store: StoreApi<ViewAtlasState>;
  private currentPreviewIcon: string = 'pin';
  private storeUnsubscribe: (() => void) | null = null;
  private pinActionHandler: ((e: CustomEvent<PinActionEventDetail>) => void) | null = null;
  private outsideClickHandler: ((e: MouseEvent) => void) | null = null;

  constructor(
    private readonly eventBus: EventEmitter,
    app: App,
    store: StoreApi<ViewAtlasState>,
  ) {
    this.app = app;
    this.obsidianApp = app;
    this.store = store;
    
    // Watch the Zustand store so UI that directly mutates it keeps tools in sync
    this.subscribeToStore();
    
    // Listen for tool change events
    this.eventBus.on('tool-changed', (toolMode: string) => {
      const wasActive = this.isActive;
      this.isActive = toolMode === 'note-pin';
      
      if (!wasActive && this.isActive) {
        this.onToolActivated();
      } else if (wasActive && !this.isActive) {
        this.onToolDeactivated();
      }
    });
    
    // Listen for mouse move events to update preview position
    this.eventBus.on('viewport-pointer-move', (e: { worldX: number; worldY: number }) => {
      if (this.isActive && !this.pinDropdown) {
        this.eventBus.emit('pin-preview-update', {
          x: e.worldX,
          y: e.worldY,
          icon: this.currentPreviewIcon
        });
      }
    });
    
    // Listen for canvas click events when the tool is active
    this.eventBus.on('canvas-click', (e: { x: number; y: number; worldX: number; worldY: number }) => {
      if (!this.isActive) return;

      // Don't process if dropdown is already open
      if (this.pinDropdown) {
        return;
      }

      runInBackground(this.placePinAt(e.worldX, e.worldY), 'Placing a note pin', 'Could not place the note pin');
    });
    
    // Listen for pin action events from the PixiRenderer
    this.pinActionHandler = (e): void => {
      const { action, pin } = e.detail;
      
      if (action === 'open') {
        // Explicitly tell NotePreviewUIManager to hide any preview for this pin's notePath
        this.eventBus.emit('close-active-preview', pin.notePath);
        this.openLinkedNote(pin);
      } else if (action === 'edit') {
        // Show the note selection dropdown at the pin's position
        runInBackground(this.showNotePinDropdownForExistingPin(pin), 'Opening the note pin editor');
      }
    };
    window.addEventListener('atlas-pin-action', this.pinActionHandler);
  }
  
  /**
   * Called when the note pin tool becomes active
   */

  private subscribeToStore(): void {
    const syncActiveState = (state: ViewAtlasState): void => {
      const wasActive = this.isActive;
      this.isActive = state.activeTool === 'note-pin';

      if (!wasActive && this.isActive) {
        this.onToolActivated();
      } else if (wasActive && !this.isActive) {
        this.onToolDeactivated();
      }
    };

    this.storeUnsubscribe = this.store.subscribe(syncActiveState);
    syncActiveState(this.store.getState());
  }

  private onToolActivated(): void {
    // Show preview pin
    this.eventBus.emit('pin-preview-show', {
      icon: this.currentPreviewIcon
    });
  }
  
  /**
   * Called when the note pin tool becomes inactive
   */
  private onToolDeactivated(): void {
    // Hide preview pin
    this.eventBus.emit('pin-preview-hide');
    this.closeDropdown();
  }

  /**
   * Displays a dropdown UI for choosing the pin's icon and linked note. For an
   * existing pin, picking an icon applies it at once and keeps the linked note.
   */
  private async showNotePinDropdown(x: number, y: number, editedPin?: NotePin): Promise<NotePinDropdownResult> {
    return new Promise<NotePinDropdownResult>((resolve) => {
      try {
        this.closeDropdown();

      // New pins default to the last used icon so a numbered run needs no re-selection
      let selectedIcon = resolvePinIcon(editedPin?.icon || this.currentPreviewIcon);

      // ── Outer container ──
      const dropdown = createDiv();
      dropdown.id = 'atlas-note-pin-dropdown';
      dropdown.classList.add('atlas-note-pin-dropdown');

      // ── Icon Palette ──
      this.iconPalette = createPinIconPalette(dropdown, {
        selected: selectedIcon,
        onSelect: (icon) => {
          if (editedPin) {
            this.closeDropdown();
            resolve({ accepted: true, notePath: editedPin.notePath, icon });
            return;
          }
          selectedIcon = icon;
          this.currentPreviewIcon = icon;
          this.eventBus.emit('pin-preview-update-icon', { icon });
        },
      });

      // ── Search, results and key hints ──
      const noteSearch = createPinNoteSearch(dropdown, {
        app: this.obsidianApp,
        onPick: (notePath) => {
          this.closeDropdown();
          resolve({ accepted: true, notePath, icon: selectedIcon });
        },
        onCancel: () => {
          this.closeDropdown();
          resolve({ accepted: false });
        },
      });

      // ── Position & mount ──
      document.body.appendChild(dropdown);
      this.pinDropdown = dropdown;

      const viewportEvent = new CustomEvent('get-viewport-position', {
        detail: {
          worldX: x,
          worldY: y,
          callback: (clientX: number, clientY: number) => {
            const rect = dropdown.getBoundingClientRect();
            const gap = 12;
            const margin = 8;
            const spaceRight = window.innerWidth - clientX;
            const spaceLeft = clientX;

            // Open to whichever side has more room
            let left: number;
            if (spaceRight >= rect.width + gap + margin) {
              left = clientX + gap;
            } else if (spaceLeft >= rect.width + gap + margin) {
              left = clientX - rect.width - gap;
            } else {
              // Fallback: whichever side has more space
              left = spaceRight > spaceLeft
                ? Math.min(clientX + gap, window.innerWidth - rect.width - margin)
                : Math.max(margin, clientX - rect.width - gap);
            }

            // Vertically center on click point, clamped to viewport
            let top = clientY - rect.height / 2;
            top = Math.max(margin, Math.min(top, window.innerHeight - rect.height - margin));

            dropdown.style.left = `${left}px`;
            dropdown.style.top = `${top}px`;
            // Grows out of the pin it belongs to
            dropdown.style.transformOrigin = `${clientX - left}px ${clientY - top}px`;
          }
        }
      });
      window.dispatchEvent(viewportEvent);
      animatePanelIn(dropdown);

      window.setTimeout(() => noteSearch.focus(), 10);

      // Outside click handler
      const handleOutsideClick = (e: MouseEvent): void => {
        if (dropdown && !dropdown.contains(e.target as Node)) {
          this.closeDropdown();
          resolve({ accepted: false });
        }
      };
      this.outsideClickHandler = handleOutsideClick;
      window.setTimeout(() => {
        document.addEventListener('mousedown', handleOutsideClick, true);
      }, 100);

      } catch (error) {
        console.error('[NotePinTool] Error in showNotePinDropdown:', error);
        this.closeDropdown();
        resolve({ accepted: false });
      }
    });
  }
  
  /**
   * Closes the note pin dropdown if it's open
   */
  private closeDropdown(): void {
    if (this.pinDropdown) {
      if (this.outsideClickHandler) {
        document.removeEventListener('mousedown', this.outsideClickHandler, true);
        this.outsideClickHandler = null;
      }

      // The palette is torn down once the dropdown has faded out, so it leaves whole.
      const palette = this.iconPalette;
      this.iconPalette = null;
      this.pinDropdown.removeAttribute('id');
      animatePanelOutAndRemove(this.pinDropdown, () => palette?.destroy());
      this.pinDropdown = null;
    }
  }
  
  /**
   * Opens a linked note from a pin
   */
  public openLinkedNote(pin: NotePin): void {
    if (!pin.notePath) return;
    
    // Extract file path and header if present
    const hashIndex = pin.notePath.indexOf('#');
    const filePath = hashIndex !== -1 ? pin.notePath.substring(0, hashIndex) : pin.notePath;
    
    // Check if this is a map file
    const file = this.obsidianApp.vault.getAbstractFileByPath(filePath);
    if (file instanceof TFile && file.extension === 'atlasmap') {
      // Open map in Atlas VTT view
      const leaves = this.obsidianApp.workspace.getLeavesOfType('atlas-vtt');
      if (leaves.length > 0) {
        const leaf = leaves[0];
        if (leaf) {
          this.openMapInLeaf(leaf, filePath);
        }
      } else {
        // Create a new Atlas VTT view if none exists
        const newLeaf = this.obsidianApp.workspace.getLeaf(true);
        if (newLeaf) {
          this.openMapInLeaf(newLeaf, filePath);
        }
      }
    } else {
      // Open the linked note normally - openLinkText handles headers automatically
      runInBackground(this.obsidianApp.workspace.openLinkText(pin.notePath, '', true), `Opening ${pin.notePath}`, 'Could not open the linked note');
    }
  }
  
  /** Asks which note to link and drops a pin for it at the clicked world position. */
  private async placePinAt(worldX: number, worldY: number): Promise<void> {
    const result = await this.showNotePinDropdown(worldX, worldY);

    if (result.accepted && result.notePath) {
      this.store.getState().addNotePin(worldX, worldY, result.notePath, result.icon);
    }

    // Re-show the preview pin once the dropdown has closed, if the tool is still active
    window.setTimeout(() => {
      if (this.isActive) {
        this.eventBus.emit('pin-preview-show', {
          icon: this.currentPreviewIcon
        });
      }
    }, 150);
  }

  private openMapInLeaf(leaf: WorkspaceLeaf, filePath: string): void {
    runInBackground(
      leaf.setViewState({ type: 'atlas-vtt', state: { file: filePath } }),
      `Opening map ${filePath}`,
      'Could not open the linked map',
    );
    this.obsidianApp.workspace.setActiveLeaf(leaf, { focus: true });
  }

  /**
   * Opens a preview of the linked note
   */
  public showNotePreview(pin: NotePin, position: { x: number, y: number }): void {
    if (!pin.notePath) return;
    
    // For now, we'll just open the note directly
    // In the future, this could be enhanced to show a hovering preview window
    runInBackground(this.obsidianApp.workspace.openLinkText(pin.notePath, '', true), `Opening ${pin.notePath}`, 'Could not open the linked note');
  }

  /**
   * Shows the dropdown for an existing pin to change its icon or linked note
   */
  private async showNotePinDropdownForExistingPin(pin: NotePin): Promise<void> {
    const result = await this.showNotePinDropdown(pin.x, pin.y, pin);
    if (!result.accepted || !result.notePath) return;
    // Re-picking what the pin already shows is not an edit, and must not add an undo step
    if (result.notePath === pin.notePath && result.icon === pin.icon) return;

    this.store.getState().updateNotePin(pin.id, {
      notePath: result.notePath,
      ...(result.icon !== undefined && { icon: result.icon }),
    });
  }

  public destroy(): void {
    this.closeDropdown();
    this.eventBus.emit('pin-preview-hide');

    if (this.storeUnsubscribe) {
      this.storeUnsubscribe();
      this.storeUnsubscribe = null;
    }

    if (this.pinActionHandler) {
      window.removeEventListener('atlas-pin-action', this.pinActionHandler);
      this.pinActionHandler = null;
    }
  }
}
