import { EventEmitter } from 'events';
import type { NotePin } from '../types';
import type { ViewAtlasState } from '../storeFactory';
import { App, TFile, setIcon, type WorkspaceLeaf } from 'obsidian';
import type { StoreApi } from 'zustand';
import { runInBackground } from '../utils/backgroundTask';

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
  private store: StoreApi<ViewAtlasState>;
  private currentPreviewIcon: string = 'pin';
  private storeUnsubscribe: (() => void) | null = null;
  private pinActionHandler: EventListener | null = null;

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
    this.pinActionHandler = ((e: Event) => {
      const { action, pin } = (e as CustomEvent).detail;
      
      if (action === 'open') {
        // Explicitly tell NotePreviewUIManager to hide any preview for this pin's notePath
        this.eventBus.emit('close-active-preview', pin.notePath);
        this.openLinkedNote(pin);
      } else if (action === 'edit') {
        // Show the note selection dropdown at the pin's position
        runInBackground(this.showNotePinDropdownForExistingPin(pin), 'Opening the note pin editor');
      }
    });
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
   * Displays a dropdown UI for selecting a note to link to the pin
   */
  private async showNotePinDropdown(x: number, y: number, existingIcon?: string): Promise<NotePinDropdownResult> {
    return new Promise<NotePinDropdownResult>((resolve) => {
      try {
        this.closeDropdown();

      // Icon definitions
      // Ids are Lucide icon names unless the option carries a text `label`
      const iconOptions: Array<{ id: string; name: string; color: string; label?: string }> = [
        { id: 'pin', name: 'Pin', color: '#ef4444' },
        { id: 'scroll', name: 'Note', color: '#3b82f6' },
        { id: 'coins', name: 'Treasure', color: '#eab308' },
        { id: 'swords', name: 'Combat', color: '#dc2626' },
        { id: 'skull', name: 'Boss', color: '#7c3aed' },
        { id: 'info', name: 'Info', color: '#06b6d4' },
        { id: 'alert-triangle', name: 'Warning', color: '#f97316' },
        { id: 'map-pin', name: 'Location', color: '#10b981' },
        { id: 'flag', name: 'Objective', color: '#6366f1' },
        { id: 'star', name: 'Important', color: '#f59e0b' },
        { id: 'heart', name: 'NPC', color: '#ec4899' },
        { id: 'eye', name: 'Hidden', color: '#6b7280' },
        // Enumerated pins: the store assigns the next free label of the sequence on placement
        { id: 'number', name: 'Numbered (1, 2, 3…)', color: 'var(--text-normal)', label: '1' },
        { id: 'letter', name: 'Lettered (A, B, C…)', color: 'var(--text-normal)', label: 'A' },
      ];

      // New pins default to the last used icon so a numbered run needs no re-selection
      let selectedIcon = existingIcon || this.currentPreviewIcon;

      // ── Outer container ──
      const dropdown = createDiv();
      dropdown.id = 'atlas-note-pin-dropdown';
      dropdown.classList.add('atlas-note-pin-dropdown');

      // ── Icon Palette ──
      const iconRow = dropdown.createDiv({ cls: 'pin-icon-row' });
      iconRow.setAttribute('role', 'radiogroup');
      iconRow.setAttribute('aria-label', 'Pin icon');

      const updateIconSelection = (iconId: string): void => {
        iconRow.querySelectorAll<HTMLButtonElement>('.pin-icon-btn').forEach(btn => {
          const isSelected = btn.dataset.icon === iconId;
          btn.classList.toggle('is-selected', isSelected);
          btn.setAttribute('aria-checked', String(isSelected));
        });
      };

      iconOptions.forEach(option => {
        const btn = iconRow.createEl('button');
        btn.type = 'button';
        btn.classList.add('pin-icon-btn');
        btn.dataset.icon = option.id;
        btn.setAttribute('role', 'radio');
        btn.setAttribute('aria-label', option.name);
        btn.title = option.name;
        btn.style.setProperty('--pin-color', option.color);
        if (option.label) {
          btn.createSpan({ cls: 'pin-icon-label', text: option.label });
        } else {
          setIcon(btn, option.id);
        }

        btn.onclick = () => {
          selectedIcon = option.id;
          this.currentPreviewIcon = option.id;
          updateIconSelection(option.id);
          this.eventBus.emit('pin-preview-update-icon', { icon: option.id });
        };
      });
      updateIconSelection(selectedIcon);

      // ── Search ──
      const searchWrapper = dropdown.createDiv({ cls: 'pin-search-wrapper' });

      const searchIcon = searchWrapper.createDiv({ cls: 'pin-search-icon' });
      setIcon(searchIcon, 'search');

      const search = searchWrapper.createEl('input', { cls: 'pin-search-input' });
      search.type = 'text';
      search.placeholder = 'Search notes and maps...';

      // Results container
      const results = dropdown.createDiv({ cls: 'pin-results' });

      // Footer hints
      const footer = dropdown.createDiv({ cls: 'pin-footer' });
      const footerHints: Array<[key: string, label: string]> = [['Esc', 'cancel'], ['Enter', 'select']];
      footerHints.forEach(([key, label]) => {
        const hint = footer.createSpan({ cls: 'pin-footer-hint' });
        hint.createEl('kbd', { text: key });
        hint.appendText(label);
      });

      // ── File data ──
      const allFiles = this.obsidianApp.vault.getAllLoadedFiles();
      const files = allFiles.filter((f): f is TFile =>
        f instanceof TFile && (f.extension === 'md' || f.extension === 'atlasmap')
      );
      let filteredFiles = files;

      // ── Render results ──
      const renderResults = (filter = ''): void => {
        results.empty();

        // Header search mode (file#header)
        const hashIndex = filter.indexOf('#');
        if (hashIndex !== -1) {
          const fileNamePart = filter.substring(0, hashIndex);
          const headerQuery = filter.substring(hashIndex + 1).toLowerCase();

          let targetFile: TFile | null = null;
          targetFile = files.find(f => f.basename.toLowerCase() === fileNamePart.toLowerCase()) || null;
          if (!targetFile) {
            const matches = files.filter(f => f.basename.toLowerCase().includes(fileNamePart.toLowerCase()));
            if (matches.length === 1) targetFile = matches[0] ?? null;
          }

          if (targetFile) {
            const cache = this.obsidianApp.metadataCache.getFileCache(targetFile);
            if (cache?.headings && cache.headings.length > 0) {
              // "Entire note" option at the top
              if (headerQuery === '') {
                const entireItem = results.createDiv({ cls: 'pin-result-item pin-header-item' });

                const icon = entireItem.createDiv({ cls: 'pin-result-icon' });
                setIcon(icon, 'file');

                entireItem.createSpan({ cls: 'pin-result-name', text: 'Entire note' });

                const fileBadge = entireItem.createSpan({ cls: 'pin-header-file' });
                fileBadge.textContent = targetFile.basename;

                entireItem.onclick = () => {
                  this.closeDropdown();
                  resolve({ accepted: true, notePath: targetFile.path, icon: selectedIcon });
                };
              }

              const matchingHeaders = cache.headings.filter(h =>
                h.heading.toLowerCase().includes(headerQuery)
              );

              if (matchingHeaders.length > 0) {
                matchingHeaders.forEach(header => {
                  const item = results.createDiv({ cls: 'pin-result-item pin-header-item' });

                  const level = item.createSpan({ cls: 'pin-header-level' });
                  level.textContent = `H${header.level}`;

                  const name = item.createSpan({ cls: 'pin-result-name' });
                  name.textContent = header.heading;

                  const file = item.createSpan({ cls: 'pin-header-file' });
                  file.textContent = targetFile.basename;

                  item.onclick = () => {
                    this.closeDropdown();
                    resolve({ accepted: true, notePath: `${targetFile.path}#${header.heading}`, icon: selectedIcon });
                  };

                });
              } else {
                results.createDiv({ cls: 'pin-empty-state', text: 'No matching headers found' });
              }
            } else {
              // File has no headers — offer direct link to entire note
              const entireItem = results.createDiv({ cls: 'pin-result-item pin-header-item' });

              const icon = entireItem.createDiv({ cls: 'pin-result-icon' });
              setIcon(icon, 'file');

              entireItem.createSpan({ cls: 'pin-result-name', text: 'Pin to entire note' });

              const fileBadge = entireItem.createSpan({ cls: 'pin-header-file' });
              fileBadge.textContent = targetFile.basename;

              entireItem.onclick = () => {
                this.closeDropdown();
                resolve({ accepted: true, notePath: targetFile.path, icon: selectedIcon });
              };
            }
          } else {
            results.createDiv({ cls: 'pin-empty-state', text: 'File not found' });
          }
          return;
        }

        // Normal file search
        filteredFiles = files.filter(f =>
          f.basename.toLowerCase().includes(filter.toLowerCase())
        );

        if (filteredFiles.length === 0) {
          results.createDiv({ cls: 'pin-empty-state', text: 'No notes found' });
        } else {
          filteredFiles.slice(0, 30).forEach(file => {
            const item = results.createDiv({ cls: 'pin-result-item' });

            // File icon
            const icon = item.createDiv({ cls: 'pin-result-icon' });
            if (file.extension === 'atlasmap') {
              setIcon(icon, 'map');
            } else {
              setIcon(icon, 'file');
            }

            const name = item.createSpan({ cls: 'pin-result-name' });
            name.textContent = file.basename;

            if (file.extension === 'atlasmap') {
              item.createSpan({ cls: 'pin-result-badge is-map', text: 'Map' });
            }

            item.onclick = () => {
              const cache = this.obsidianApp.metadataCache.getFileCache(file);
              if (cache?.headings && cache.headings.length > 0) {
                search.value = file.basename + '#';
                search.focus();
                search.setSelectionRange(search.value.length, search.value.length);
                search.dispatchEvent(new Event('input'));
              } else {
                this.closeDropdown();
                resolve({ accepted: true, notePath: file.path, icon: selectedIcon });
              }
            };

          });
        }
      };

      renderResults();
      search.oninput = () => renderResults(search.value);

      search.onkeydown = (e) => {
        e.stopPropagation();
        if (e.key === 'Escape') {
          this.closeDropdown();
          resolve({ accepted: false });
        } else if (e.key === 'Enter') {
          const hashIdx = search.value.indexOf('#');
          if (hashIdx !== -1) return;
          const topFile = filteredFiles[0];
          if (topFile) {
            const cache = this.obsidianApp.metadataCache.getFileCache(topFile);
            if (cache?.headings && cache.headings.length > 0) {
              search.value = topFile.basename + '#';
              search.dispatchEvent(new Event('input'));
            } else {
              this.closeDropdown();
              resolve({ accepted: true, notePath: topFile.path, icon: selectedIcon });
            }
          }
        }
      };

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
          }
        }
      });
      window.dispatchEvent(viewportEvent);

      window.setTimeout(() => search.focus(), 10);

      // Outside click handler
      const handleOutsideClick = (e: MouseEvent): void => {
        if (dropdown && !dropdown.contains(e.target as Node)) {
          this.closeDropdown();
          resolve({ accepted: false });
        }
      };
      (dropdown as any)._outsideClickHandler = handleOutsideClick;
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
      // Remove any outside click handlers
      const handlers = (this.pinDropdown as any)._outsideClickHandler;
      if (handlers) {
        document.removeEventListener('mousedown', handlers, true);
        delete (this.pinDropdown as any)._outsideClickHandler;
      }
      
      this.pinDropdown.remove();
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
   * Shows the dropdown for an existing pin to edit its linked note
   */
  private async showNotePinDropdownForExistingPin(pin: NotePin): Promise<void> {
    const result = await this.showNotePinDropdown(pin.x, pin.y, pin.icon);
    
    if (result.accepted && result.notePath) {
      // Update the pin in the store
      this.store.getState().updateNotePin(pin.id, { 
        notePath: result.notePath,
        ...(result.icon !== undefined && { icon: result.icon }),
      });
    }
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
