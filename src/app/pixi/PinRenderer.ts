import { Container, Graphics, FederatedPointerEvent, Circle, Text, Sprite, Texture, TextStyle } from "pixi.js";
import { Viewport } from "pixi-viewport";
import { App as ObsidianApp, TFile } from 'obsidian';
import { EventEmitter } from 'events';
import type { NotePin } from "../types";
import { createLucideIconTexture } from "./utils/lucideIconTexture";
import { isHandled } from "./utils/handledEvents";
import type { ViewAtlasState, ViewAtlasStore } from '../storeFactory';
import { beginHistoryTransaction, endHistoryTransaction } from '../stores/history';
import { openContextMenuGlobal } from '../react/root/ContextMenuContext';
import { pinSize } from '../styles/designTokens';
import { isPinLabelKind, nextPinLabel } from '../tools/pinLabels';

export class PinRenderer {
  private obsApp: ObsidianApp;
  private viewport: Viewport;
  private eventBus: EventEmitter;
  private pinContainer: Container;
  private pinSprites: Record<string, Container> = {};
  private _unsubscribeFromStore?: () => void;
  private _notePinToolViewportListener: ((e: FederatedPointerEvent) => void) | null = null;
  private _viewportPinClickListener: ((e: FederatedPointerEvent) => void) | null = null;
  private isPlayerView: boolean;
  private store: ViewAtlasStore;
  private iconTextureCache: Map<string, Texture> = new Map();
  private themeObserver: MutationObserver | null = null;
  private _viewportZoomHandler?: () => void;
  private previewPin: Container | null = null;
  private previewIcon: string = 'pin';
  private _viewportPointerMoveHandler?: (e: FederatedPointerEvent) => void;
  private pinPreviewShowHandler: ((data: { icon: string }) => void) | null = null;
  private pinPreviewHideHandler: (() => void) | null = null;
  private pinPreviewUpdateHandler: ((data: { x: number; y: number; icon: string }) => void) | null = null;
  private pinPreviewUpdateIconHandler: ((data: { icon: string }) => void) | null = null;
  
  // Lucide icon SVG data (stroke-based, matching the modal icons)
  private iconData: Record<string, { svg: string; color: { light: string; dark: string } }> = {
    'pin': {
      svg: '<path d="M12 17v5"/><path d="M9 10.76a2 2 0 0 1-1.11 1.79l-1.78.9A2 2 0 0 0 5 15.24V16a1 1 0 0 0 1 1h12a1 1 0 0 0 1-1v-.76a2 2 0 0 0-1.11-1.79l-1.78-.9A2 2 0 0 1 15 10.76V7a1 1 0 0 0-1-1h-1a3 3 0 0 0 0-6H11a3 3 0 0 0 0 6h-1a1 1 0 0 0-1 1z"/>',
      color: { light: '#dc2626', dark: '#ef4444' }
    },
    'scroll': {
      svg: '<path d="M8 21h12a2 2 0 0 0 2-2v-2H10v2a2 2 0 1 1-4 0V5a2 2 0 1 0-4 0v3h4"/><path d="M19 17V5a2 2 0 0 0-2-2H4"/><path d="M9 3v18"/>',
      color: { light: '#2563eb', dark: '#3b82f6' }
    },
    'coins': {
      svg: '<circle cx="8" cy="8" r="6"/><path d="M18.09 10.37A6 6 0 1 1 10.34 18"/><path d="M7 6h1v4"/><path d="m16.71 13.88.7.71-2.82 2.82"/>',
      color: { light: '#ca8a04', dark: '#eab308' }
    },
    'swords': {
      svg: '<polyline points="14.5 17.5 3 6 3 3 6 3 17.5 14.5"/><line x1="13" x2="19" y1="19" y2="13"/><line x1="16" x2="20" y1="16" y2="20"/><line x1="19" x2="21" y1="21" y2="19"/><polyline points="14.5 6.5 18 3 21 3 21 6 17.5 9.5"/><line x1="5" x2="9" y1="14" y2="18"/><line x1="7" x2="4" y1="17" y2="20"/><line x1="3" x2="5" y1="19" y2="21"/>',
      color: { light: '#dc2626', dark: '#ef4444' }
    },
    'skull': {
      svg: '<circle cx="9" cy="12" r="1"/><circle cx="15" cy="12" r="1"/><path d="M8 20v2h8v-2"/><path d="m12.5 17-.5-1-.5 1h1z"/><path d="M16 20a2 2 0 0 0 1.56-3.25 8 8 0 1 0-11.12 0A2 2 0 0 0 8 20"/>',
      color: { light: '#7c3aed', dark: '#a78bfa' }
    },
    'info': {
      svg: '<circle cx="12" cy="12" r="10"/><path d="M12 16v-4"/><path d="M12 8h.01"/>',
      color: { light: '#0891b2', dark: '#06b6d4' }
    },
    'alert-triangle': {
      svg: '<path d="m21.73 18-8-14a2 2 0 0 0-3.48 0l-8 14A2 2 0 0 0 4 21h16a2 2 0 0 0 1.73-3"/><path d="M12 9v4"/><path d="M12 17h.01"/>',
      color: { light: '#ea580c', dark: '#f97316' }
    },
    'map-pin': {
      svg: '<path d="M20 10c0 4.993-5.539 10.193-7.399 11.799a1 1 0 0 1-1.202 0C9.539 20.193 4 14.993 4 10a8 8 0 0 1 16 0"/><circle cx="12" cy="10" r="3"/>',
      color: { light: '#059669', dark: '#10b981' }
    },
    'flag': {
      svg: '<path d="M4 15s1-1 4-1 5 2 8 2 4-1 4-1V3s-1 1-4 1-5-2-8-2-4 1-4 1z"/><line x1="4" x2="4" y1="22" y2="15"/>',
      color: { light: '#4f46e5', dark: '#6366f1' }
    },
    'star': {
      svg: '<polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"/>',
      color: { light: '#d97706', dark: '#f59e0b' }
    },
    'heart': {
      svg: '<path d="M19 14c1.49-1.46 3-3.21 3-5.5A5.5 5.5 0 0 0 16.5 3c-1.76 0-3 .5-4.5 2-1.5-1.5-2.74-2-4.5-2A5.5 5.5 0 0 0 2 8.5c0 2.3 1.5 4.05 3 5.5l7 7z"/>',
      color: { light: '#db2777', dark: '#ec4899' }
    },
    'eye': {
      svg: '<path d="M2.062 12.348a1 1 0 0 1 0-.696 10.75 10.75 0 0 1 19.876 0 1 1 0 0 1 0 .696 10.75 10.75 0 0 1-19.876 0"/><circle cx="12" cy="12" r="3"/>',
      color: { light: '#4b5563', dark: '#6b7280' }
    }
  };

  constructor(obsApp: ObsidianApp, viewport: Viewport, eventBus: EventEmitter, store: ViewAtlasStore, isPlayerView: boolean = false) {
    this.obsApp = obsApp;
    this.viewport = viewport;
    this.eventBus = eventBus;
    this.store = store;
    this.isPlayerView = isPlayerView;
    
    // Initialize icon textures
    this.initializeIconTextures().catch(err => {
      console.error('[PinRenderer] Failed to initialize icon textures:', err);
    });

    this.pinContainer = new Container();
    this.pinContainer.label = 'pins';
    this.pinContainer.sortableChildren = true;
    this.pinContainer.eventMode = 'none'; // Viewport-level dispatch handles pin interactions
    this.pinContainer.interactiveChildren = false;
    this.viewport.addChild(this.pinContainer);
    const unsubscribePins = this.store.subscribe(
      (state: ViewAtlasState) => state.objects.pins,
      this.syncPins.bind(this),
      { fireImmediately: true }
    );
    // The player window mirrors this canvas, so pins must vanish with the GM view
    const unsubscribeGMView = this.store.subscribe(
      (state: ViewAtlasState) => state.isGMView,
      () => { this.pinContainer.visible = !this.arePinsHidden(); },
      { fireImmediately: true }
    );
    this._unsubscribeFromStore = () => {
      unsubscribePins();
      unsubscribeGMView();
    };
    this._notePinToolViewportListener = (e: FederatedPointerEvent) => {
      // Skip if already handled by viewport-level dispatch (e.g. pin click)
      if (isHandled(e)) return;

      const activeTool = this.store.getState().activeTool;
      if (activeTool === 'fog' || activeTool === 'eraser') return;

      if (activeTool === 'note-pin' && e.button === 0) {
        const worldPos = this.viewport.toWorld(e.global);
        this.eventBus.emit('canvas-click', {
          x: e.global.x, y: e.global.y,
          worldX: worldPos.x, worldY: worldPos.y
        });
      }
    };
    // Set viewport to be interactive
    this.viewport.interactive = true;
    this.viewport.on('pointerdown', this._notePinToolViewportListener, this);
    
    // Set up theme observer
    this.setupThemeObserver();
    
    // Set up viewport zoom listener
    this.setupViewportListeners();
    
    // Set up preview pin event listeners
    this.setupPreviewPinListeners();
  }
  
  private async initializeIconTextures(): Promise<void> {
    const svgSize = 48; // Higher resolution for better quality
    const icons = Object.keys(this.iconData);

    for (const iconType of icons) {
      const iconInfo = this.iconData[iconType];
      if (!iconInfo) continue;
      for (const theme of ['light', 'dark'] as const) {
        const key = `${iconType}-${theme}`;
        try {
          const texture = await createLucideIconTexture(iconInfo.svg, iconInfo.color[theme], svgSize);
          this.iconTextureCache.set(key, texture);
        } catch (err) {
          console.error(`[PinRenderer] Failed to create texture for ${key}:`, err);
        }
      }
    }
  }
  
  private setupThemeObserver(): void {
    this.themeObserver = new MutationObserver((mutations) => {
      for (const mutation of mutations) {
        if (mutation.type === 'attributes' && mutation.attributeName === 'class') {
          // Theme changed, redraw all pins
          this.redrawAllPins();
        }
      }
    });
    
    // Start observing
    this.themeObserver.observe(document.body, {
      attributes: true,
      attributeFilter: ['class']
    });
  }
  
  private setupViewportListeners(): void {
    // Update pins on viewport zoom for consistent size
    this._viewportZoomHandler = () => {
      this.updatePinScales();
    };
    
    this.viewport.on('zoomed', this._viewportZoomHandler);
    this.viewport.on('zoomed-end', this._viewportZoomHandler);
  }
  
  private setupPreviewPinListeners(): void {
    this.pinPreviewShowHandler = (data: { icon: string }) => {
      this.showPreviewPin(data.icon);
    };
    this.pinPreviewHideHandler = () => {
      this.hidePreviewPin();
    };
    this.pinPreviewUpdateHandler = (data: { x: number; y: number; icon: string }) => {
      this.updatePreviewPin(data.x, data.y, data.icon);
    };
    this.pinPreviewUpdateIconHandler = (data: { icon: string }) => {
      this.updatePreviewPinIcon(data.icon);
    };

    // Listen for pin preview events
    this.eventBus.on('pin-preview-show', this.pinPreviewShowHandler);
    this.eventBus.on('pin-preview-hide', this.pinPreviewHideHandler);
    this.eventBus.on('pin-preview-update', this.pinPreviewUpdateHandler);
    this.eventBus.on('pin-preview-update-icon', this.pinPreviewUpdateIconHandler);
    
    // Set up viewport pointer move handler for preview position updates
    this._viewportPointerMoveHandler = (e: FederatedPointerEvent) => {
      if (this.previewPin && this.store.getState().activeTool === 'note-pin') {
        const worldPos = this.viewport.toWorld(e.global);
        this.eventBus.emit('viewport-pointer-move', {
          worldX: worldPos.x,
          worldY: worldPos.y
        });
      }
    };
    
    this.viewport.on('pointermove', this._viewportPointerMoveHandler);
  }
  
  private updatePinScales(): void {
    const scale = this.getPinScale();
    
    for (const pinId in this.pinSprites) {
      const pinGroup = this.pinSprites[pinId];
      if (pinGroup) {
        pinGroup.scale.set(scale);
      }
    }
    
    if (this.previewPin) {
      this.previewPin.scale.set(scale);
    }
  }

  /**
   * Compute world-space scale so pins maintain (or exceed) a readable screen size.
   * - Above zoom 0.5: pure 1/zoom → constant screen size.
   * - Below zoom 0.5: power curve (exponent 1.35) so pins grow larger on screen
   *   the further you zoom out, keeping them prominent on big maps.
   * - Floor of 0.15 prevents pins from vanishing when zoomed very far in.
   */
  private getPinScale(): number {
    const zoom = this.viewport.scale.x;
    const inverseScale = 1 / zoom;

    // Below this zoom level, pins start growing beyond constant screen-size
    const boostThreshold = 0.2;

    if (zoom >= boostThreshold) {
      return Math.max(0.15, inverseScale);
    }

    // Super-linear: pins grow faster than 1/zoom when zoomed out past threshold
    const thresholdInverse = 1 / boostThreshold; // 2
    const excess = inverseScale / thresholdInverse; // how far past the threshold (1 = at threshold)
    return thresholdInverse * Math.pow(excess, 1.21);
  }
  
  private redrawAllPins(): void {
    const pins = this.store.getState().objects.pins;
    for (const pinId in pins) {
      const pin = pins[pinId];
      const pinGroup = this.pinSprites[pinId];
      if (pin && pinGroup) {
        // Force redraw by removing and recreating the pin graphics
        this.clearPinGraphics(pinGroup);
        
        const iconType = pin.icon || 'pin';
        const iconContainer = this.createPinGraphics(iconType, pin);
        pinGroup.addChild(iconContainer);
      }
    }
  }

  public getPinContainer(): Container {
    return this.pinContainer;
  }

  /** Pins are DM-only: hidden in player views and whenever the DM previews the player perspective. */
  private arePinsHidden(): boolean {
    return this.isPlayerView || !this.store.getState().isGMView;
  }

  /** Geometry-based hit test: returns the pinId at (worldX, worldY), or null. */
  public hitTestPins(worldX: number, worldY: number): string | null {
    if (this.arePinsHidden()) return null;

    const pins = this.store.getState().objects.pins;
    const hitRadius = 20 * this.getPinScale();

    for (const [id, pin] of Object.entries(pins)) {
      if (!pin) continue;
      const dx = worldX - pin.x;
      const dy = worldY - pin.y;
      if (dx * dx + dy * dy <= hitRadius * hitRadius) {
        return id;
      }
    }
    return null;
  }

  /** Handles a viewport-routed click on a pin (drag or context menu). */
  public handleViewportPinPointerDown(pinId: string, e: FederatedPointerEvent): void {
    const pin = this.store.getState().objects.pins[pinId];
    if (!pin) return;

    if (e.button === 2) {
      const originalEvent = e.originalEvent;
      const pos = originalEvent instanceof MouseEvent
        ? { x: originalEvent.clientX, y: originalEvent.clientY }
        : { x: e.global.x, y: e.global.y };
      this.showPinContextMenu(pin, pos);
      return;
    }

    if (e.button === 0) {
      // Left-click: start drag (same logic as inline handler)
      let isDragging = false;
      let hasMoved = false;
      const dragThreshold = 5;
      const startPos = { x: e.global.x, y: e.global.y };
      const worldStartPos = this.viewport.toWorld(e.global);
      const initialPinPos = { x: pin.x, y: pin.y };

      const onPointerMove = (moveEvent: FederatedPointerEvent): void => {
        const dx = moveEvent.global.x - startPos.x;
        const dy = moveEvent.global.y - startPos.y;
        const distance = Math.sqrt(dx * dx + dy * dy);

        if (!isDragging && distance > dragThreshold) {
          isDragging = true;
          hasMoved = true;
          this.viewport.plugins.pause('drag');
          this.store.getState().setPersistenceEnabled(false);
          // Live pin updates below collapse into one undo step
          beginHistoryTransaction(this.store);
        }

        if (isDragging) {
          const worldPos = this.viewport.toWorld(moveEvent.global);
          const worldDx = worldPos.x - worldStartPos.x;
          const worldDy = worldPos.y - worldStartPos.y;
          this.store.getState().updateNotePin(pinId, {
            x: initialPinPos.x + worldDx,
            y: initialPinPos.y + worldDy,
          });
        }
      };

      const onPointerUp = (): void => {
        this.viewport.off('pointermove', onPointerMove);
        this.viewport.off('pointerup', onPointerUp);
        this.viewport.off('pointerupoutside', onPointerUp);

        if (isDragging) {
          this.store.getState().setPersistenceEnabled(true);
          const currentPin = this.store.getState().objects.pins[pinId];
          if (currentPin) {
            this.store.getState().updateNotePin(pinId, { x: currentPin.x, y: currentPin.y });
          }
          endHistoryTransaction(this.store);
          this.viewport.plugins.resume('drag');
        } else if (!hasMoved) {
          this.dispatchPinAction('open', pin);
        }
      };

      this.viewport.on('pointermove', onPointerMove);
      this.viewport.on('pointerup', onPointerUp);
      this.viewport.on('pointerupoutside', onPointerUp);
    }
  }
  
  private getThemeColors(): { background: number; stroke: number; status: { success: number } } {
    // Check if we're in dark mode
    const isDarkMode = document.body.classList.contains('theme-dark');
    
    // Use appropriate colors based on theme - matching token UI badge style
    if (isDarkMode) {
      return {
        background: 0x2a2a2a, // Same as token HP bar background
        stroke: 0xffffff, // White stroke
        status: { success: 0x10b981 }
      };
    } else {
      return {
        background: 0xe3e3e3, // Same as token HP bar background
        stroke: 0x000000, // Black stroke
        status: { success: 0x059669 }
      };
    }
  }
  
  /** Removes and destroys a pin's graphics; cached icon textures survive (no `texture` flag). */
  private clearPinGraphics(pinGroup: Container): void {
    for (const child of pinGroup.removeChildren()) {
      child.destroy({ children: true });
    }
  }

  /** Graphics for the placement preview, labelled with what the next placed pin would get. */
  private createPreviewGraphics(icon: string): Container {
    const previewPin: NotePin = { id: 'preview', kind: 'pin', x: 0, y: 0, icon, notePath: '' };
    if (isPinLabelKind(icon)) {
      previewPin.label = nextPinLabel(this.store.getState().objects.pins, icon);
    }
    return this.createPinGraphics(icon, previewPin);
  }

  private createPinGraphics(iconType: string, pin: NotePin): Container {
    const container = new Container();
    
    // Get theme colors
    const colors = this.getThemeColors();
    const isDarkMode = document.body.classList.contains('theme-dark');
    
    // Create the circular badge background using design tokens
    const bgGraphics = new Graphics();
    const badgeRadius = pinSize.badgeRadius;
    
    // Draw circular background
    bgGraphics.circle(0, 0, badgeRadius);
    bgGraphics.fill({ color: colors.background, alpha: 0.95 });
    
    // Add subtle border
    bgGraphics.circle(0, 0, badgeRadius);
    bgGraphics.stroke({ width: 0.5, color: colors.stroke, alpha: isDarkMode ? 0.4 : 0.3 });
    
    // Check if this pin links to a map file and add a green border
    let isMapLink = false;
    if (pin.notePath) {
      const file = this.obsApp.vault.getAbstractFileByPath(pin.notePath);
      isMapLink = file instanceof TFile && file.extension === 'atlasmap';
    }
    
    if (isMapLink) {
      // Add green border for map links
      bgGraphics.circle(0, 0, badgeRadius);
      bgGraphics.stroke({ width: 2, color: colors.status.success, alpha: 1 });
    }
    
    container.addChild(bgGraphics);
    
    // Get icon texture
    const theme = isDarkMode ? 'dark' : 'light';
    const textureKey = `${iconType}-${theme}`;
    const iconTexture = this.iconTextureCache.get(textureKey);
    
    if (isPinLabelKind(iconType)) {
      const labelText = new Text({
        text: pin.label ?? '',
        style: new TextStyle({
          fill: colors.stroke,
          fontSize: badgeRadius,
          fontWeight: 'bold',
          fontFamily: 'Arial, sans-serif',
        }),
        resolution: 8,
      });
      labelText.anchor.set(0.5);
      // Longer labels ("12", "AB") shrink to stay inside the badge
      labelText.scale.set(Math.min(1, (badgeRadius * 1.5) / labelText.width));
      container.addChild(labelText);
    } else if (iconTexture) {
      // Create icon sprite centered in badge using design tokens
      const iconSprite = new Sprite(iconTexture);
      iconSprite.anchor.set(0.5);
      iconSprite.scale.set(pinSize.iconScale);
      iconSprite.position.set(0, 0);
      container.addChild(iconSprite);
    } else {
      // Fallback: create a simple colored dot if texture not loaded
      const iconDataEntry = this.iconData[iconType];
      if (iconDataEntry) {
        const iconColor = isDarkMode ? iconDataEntry.color.dark : iconDataEntry.color.light;
        const fallbackIcon = new Graphics();
        fallbackIcon.circle(0, 0, badgeRadius * 0.3);
        fallbackIcon.fill({ color: parseInt(iconColor.replace('#', '0x'), 16), alpha: 1 });
        container.addChild(fallbackIcon);
      }
    }
    
    // Add map indicator badge if this is a map link
    if (isMapLink) {
      const mapIndicator = new Container();
      
      // Position at bottom-right of main badge using design tokens
      const indicatorRadius = pinSize.indicatorRadius;
      const indicatorX = badgeRadius * 0.7;
      const indicatorY = badgeRadius * 0.7;
      mapIndicator.position.set(indicatorX, indicatorY);
      
      // Create small circular badge
      const indicatorBg = new Graphics();
      indicatorBg.circle(0, 0, indicatorRadius);
      indicatorBg.fill({ color: colors.status.success, alpha: 1 });
      
      // Add white border
      indicatorBg.circle(0, 0, indicatorRadius);
      indicatorBg.stroke({ width: 2, color: isDarkMode ? 0x1f2937 : 0xffffff, alpha: 1 });
      
      mapIndicator.addChild(indicatorBg);
      
      // Add small map icon (simplified)
      const mapIcon = new Graphics();
      mapIcon.fill({ color: 0xffffff, alpha: 1 });
      // Draw a simple rectangle to represent a map
      mapIcon.rect(-4, -3, 8, 6);
      mapIcon.fill();
      mapIndicator.addChild(mapIcon);
      
      container.addChild(mapIndicator);
    }
    
    return container;
  }
  

  private showPinContextMenu(pin: NotePin, pos: { x: number; y: number }): void {
    openContextMenuGlobal(
      [
        { type: 'item', label: 'Open Note', icon: 'file-text', onClick: () => this.dispatchPinAction('open', pin) },
        { type: 'item', label: 'Edit Pin', icon: 'edit', onClick: () => this.dispatchPinAction('edit', pin) },
        { type: 'separator' },
        { type: 'item', label: 'Duplicate', icon: 'files', onClick: () => this.store.getState().duplicatePins([pin.id]) },
        { type: 'separator' },
        { type: 'item', label: 'Delete', icon: 'trash', destructive: true, onClick: () => this.store.getState().deleteMapObject('pin', pin.id) },
      ],
      pos,
    );
  }

  private dispatchPinAction(action: 'open' | 'edit', pin: NotePin): void {
    const event = new CustomEvent('atlas-pin-action', { detail: { action, pin } });
    window.dispatchEvent(event);
  }

  private syncPins = (
    pinsRecord: Record<string, NotePin>,
    prevPinsRecord: Record<string, NotePin> | undefined
  ) => {
    if (!this.pinContainer) {
        console.error('[PinRenderer] syncPins called but pinContainer is null!');
        return;
    }
    
    // Hide all pins in player view
    if (this.isPlayerView) {
      this.pinContainer.visible = false;
      return;
    }
    
    const container = this.pinContainer;
    const prevIds = new Set(Object.keys(prevPinsRecord || {}));
    const newIds = new Set(Object.keys(pinsRecord));

    for (const id of prevIds) {
      if (!newIds.has(id)) {
        const pinGroup = this.pinSprites[id];
        if (pinGroup) {
          container.removeChild(pinGroup);
          pinGroup.destroy({children: true});
          delete this.pinSprites[id];
        }
      }
    }

    for (const id of newIds) {
      const pin = pinsRecord[id];
      if (!pin) continue;
      
      let pinGroup = this.pinSprites[id];
      if (pinGroup) {
        pinGroup.position.set(pin.x, pin.y);
        pinGroup.visible = true; 
        
        // Update icon if it changed
        const iconType = pin.icon || 'pin';
        
        this.clearPinGraphics(pinGroup);
        
        // Create new pin graphics
        const iconContainer = this.createPinGraphics(iconType, pin);
        pinGroup.addChild(iconContainer);
        
        pinGroup.scale.set(this.getPinScale());
        
        continue;
      }

      pinGroup = new Container();
      pinGroup.label = `pin-${id}`;
      pinGroup.position.set(pin.x, pin.y);
      pinGroup.visible = true; 
      
      // Create pin graphics
      const iconType = pin.icon || 'pin';
      const iconContainer = this.createPinGraphics(iconType, pin);
      
      pinGroup.addChild(iconContainer);
      
      pinGroup.interactive = false;
      pinGroup.eventMode = 'none'; // Viewport-level dispatch handles pin interactions
      pinGroup.hitArea = new Circle(0, 0, 20); // Kept for reference; actual hit-test is geometry-based
      
      pinGroup.scale.set(this.getPinScale());

      // Pin interactions are handled via viewport-level dispatch (handleViewportPinPointerDown)

      container.addChild(pinGroup);
      this.pinSprites[id] = pinGroup;
    }
  };

  private showPreviewPin(icon: string): void {
    if (this.previewPin) {
      this.hidePreviewPin();
    }
    
    this.previewIcon = icon;
    this.previewPin = new Container();
    this.previewPin.label = 'preview-pin';
    this.previewPin.alpha = 0.7; // Make it slightly transparent to indicate it's a preview
    
    this.previewPin.addChild(this.createPreviewGraphics(icon));
    
    this.previewPin.scale.set(this.getPinScale());
    
    // Position at cursor (will be updated by mouse move)
    this.previewPin.position.set(0, 0);
    
    // Add to pin container
    this.pinContainer.addChild(this.previewPin);
  }
  
  private hidePreviewPin(): void {
    if (this.previewPin) {
      this.pinContainer.removeChild(this.previewPin);
      this.previewPin.destroy({ children: true });
      this.previewPin = null;
    }
  }
  
  private updatePreviewPin(x: number, y: number, icon: string): void {
    if (!this.previewPin) {
      this.showPreviewPin(icon);
    }
    
    if (this.previewPin) {
      this.previewPin.position.set(x, y);
      
      // Update icon if it changed
      if (icon !== this.previewIcon) {
        this.updatePreviewPinIcon(icon);
      }
    }
  }
  
  private updatePreviewPinIcon(icon: string): void {
    if (!this.previewPin) return;
    
    this.previewIcon = icon;
    
    this.clearPinGraphics(this.previewPin);
    this.previewPin.addChild(this.createPreviewGraphics(icon));
  }

  public destroy(): void {
    this._unsubscribeFromStore?.();
    if (this._notePinToolViewportListener && this.viewport) {
        this.viewport.off('pointerdown', this._notePinToolViewportListener);
        this._notePinToolViewportListener = null;
    }
    if (this._viewportPinClickListener && this.viewport) {
        this.viewport.off('pointerdown', this._viewportPinClickListener);
        this._viewportPinClickListener = null;
    }
    
    // Clean up theme observer
    if (this.themeObserver) {
      this.themeObserver.disconnect();
      this.themeObserver = null;
    }
    
    // Clean up viewport listeners
    if (this._viewportZoomHandler && this.viewport) {
      this.viewport.off('zoomed', this._viewportZoomHandler);
      this.viewport.off('zoomed-end', this._viewportZoomHandler);
      delete this._viewportZoomHandler;
    }
    
    // Clean up pointer move handler
    if (this._viewportPointerMoveHandler && this.viewport) {
      this.viewport.off('pointermove', this._viewportPointerMoveHandler);
      delete this._viewportPointerMoveHandler;
    }
    
    // Clean up preview pin
    this.hidePreviewPin();
    
    // Clean up preview pin event listeners
    if (this.pinPreviewShowHandler) {
      this.eventBus.off('pin-preview-show', this.pinPreviewShowHandler);
      this.pinPreviewShowHandler = null;
    }
    if (this.pinPreviewHideHandler) {
      this.eventBus.off('pin-preview-hide', this.pinPreviewHideHandler);
      this.pinPreviewHideHandler = null;
    }
    if (this.pinPreviewUpdateHandler) {
      this.eventBus.off('pin-preview-update', this.pinPreviewUpdateHandler);
      this.pinPreviewUpdateHandler = null;
    }
    if (this.pinPreviewUpdateIconHandler) {
      this.eventBus.off('pin-preview-update-icon', this.pinPreviewUpdateIconHandler);
      this.pinPreviewUpdateIconHandler = null;
    }
    
    // Destroy cached textures
    for (const texture of this.iconTextureCache.values()) {
      if (texture && !texture.destroyed) {
        texture.destroy(true);
      }
    }
    this.iconTextureCache.clear();
    
    if (this.pinContainer) {
        this.pinContainer.destroy({ children: true, texture: true });
    }
    this.pinSprites = {};
  }
} 
