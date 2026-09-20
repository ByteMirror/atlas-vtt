import { WIDGET_ICON_PATHS, resolveWidgetIcon } from '../types/widgetIcons';
import { App, Notice } from 'obsidian';
import type { ViewAtlasState } from '../storeFactory';
import type { StoreApi } from 'zustand';
import type { AtlasSettings, SettingsService } from './SettingsService';
import { playerWindowStore, resetPlayerWindowStore } from '../stores/playerWindowStore';
import './player-window.scss';

/** The mirrored canvas is capped at 30 fps; players never need more. */
const PLAYER_WINDOW_FRAME_INTERVAL_MS = 1000 / 30;

/** Scopes the rules in `player-window.scss` to the popout document. */
const PLAYER_WINDOW_BODY_CLASS = 'atlas-player-window';
/** Set once frames are being mirrored: swaps the loading message for the canvas. */
const PLAYER_WINDOW_LIVE_CLASS = 'atlas-player-window--live';

/** Identifies a stylesheet node so the same sheet is not added to the popout twice. */
function getStyleNodeKey(node: Element): string {
  return node.instanceOf(HTMLLinkElement) ? `link:${node.href}` : `style:${node.textContent ?? ''}`;
}

const SVG_NAMESPACE = 'http://www.w3.org/2000/svg';

function createSvgElement(doc: Document, tag: string, attributes: Record<string, string>): SVGElement {
  const element = doc.createElementNS(SVG_NAMESPACE, tag);
  Object.entries(attributes).forEach(([name, value]) => element.setAttribute(name, value));
  return element;
}

/** A DM map canvas that can briefly render itself without DM-only layers. */
export interface PlayerFrameSource {
  canvas: HTMLCanvasElement;
  /** Runs `capture` while `canvas` holds a frame that is safe to show players. */
  withPlayerSafeFrame(capture: () => void, settings: AtlasSettings['localPlayerView']): void;
}

/**
 * Mirrors a DM map canvas into a popout window for players.
 *
 * The window shows one scene tab at a time (see `playerWindowStore.presentedTabId`).
 * While the DM works on another tab the last frame is held so players never see
 * the DM's navigation; `PlayerWindowPresenter` drives that hold/release cycle.
 */
export class PlayerWindowService {
  private playerWindow: Window | null = null;
  private app: App;
  private store: StoreApi<ViewAtlasState>;
  private settingsService: SettingsService;
  private streamSource: PlayerFrameSource | null = null;
  private animationFrame: number | null = null;
  private isCameraFrozen: boolean = false;
  /** True when the freeze was started by `holdCurrentFrame` rather than the DM. */
  private isAutoFrozen: boolean = false;
  private frozenCanvas: HTMLCanvasElement | null = null;
  private static instance: PlayerWindowService | null = null;
  private settingsUnsubscribe: (() => void) | null = null;
  private widgetUnsubscribe: (() => void) | null = null;
  private readonly boundHandleWindowResize = (): void => {
    this.handleWindowResize();
  };
  private readonly boundHandleBeforeUnload = (): void => {
    this.cleanup(false);
  };
  private isCleaningUp = false;

  constructor(app: App, store: StoreApi<ViewAtlasState>, settingsService: SettingsService) {
    this.app = app;
    this.store = store;
    this.settingsService = settingsService;
    PlayerWindowService.instance = this;
  }

  public static getInstance(): PlayerWindowService | null {
    return PlayerWindowService.instance;
  }

  /** Toggle the DM's manual camera freeze and return the new frozen state. */
  public toggleCameraFreeze(): boolean {
    this.isAutoFrozen = false;
    this.setCameraFrozen(!this.isCameraFrozen);
    new Notice(this.isCameraFrozen ? 'Player view camera frozen' : 'Player view camera unfrozen');
    return this.isCameraFrozen;
  }

  public isFrozen(): boolean {
    return this.isCameraFrozen;
  }

  public isWindowOpen(): boolean {
    return this.playerWindow !== null && !this.playerWindow.closed;
  }

  /**
   * Keep players on the current frame while the DM works on another scene tab.
   * A freeze the DM started manually is left untouched.
   */
  public holdCurrentFrame(): void {
    if (this.isCameraFrozen || !this.isWindowOpen()) return;
    this.isAutoFrozen = true;
    this.setCameraFrozen(true);
  }

  /**
   * Resume live mirroring from `source` once the presented scene is rendered again.
   * Only a hold started by `holdCurrentFrame` is released; a manual freeze stays.
   */
  public releaseHeldFrame(source: PlayerFrameSource): void {
    if (!this.isWindowOpen()) return;
    this.streamSource = source;
    if (!this.isAutoFrozen) return;
    this.isAutoFrozen = false;
    this.setCameraFrozen(false);
  }

  /**
   * Show the scene tab `tabId`, already rendered into `source`, to players.
   * Any freeze is lifted because the DM explicitly chose what players see.
   */
  public presentCanvas(source: PlayerFrameSource, tabId: string): void {
    if (!this.isWindowOpen()) {
      new Notice('Player window is not open');
      return;
    }
    this.streamSource = source;
    this.isAutoFrozen = false;
    this.setCameraFrozen(false);
    playerWindowStore.setState({ presentedTabId: tabId });
  }

  /** Opens a player window mirroring `source`, which shows the scene tab `tabId`. */
  public openPlayerWindow(source: PlayerFrameSource, tabId: string): void {
    if (this.playerWindow && !this.playerWindow.closed) {
      this.playerWindow.close();
    }
    this.streamSource = source;
    playerWindowStore.setState({ presentedTabId: tabId });
    this.openWindow();
  }

  private setCameraFrozen(frozen: boolean): void {
    if (frozen === this.isCameraFrozen) return;
    this.isCameraFrozen = frozen;
    if (frozen) {
      this.freezeCurrentFrame();
    } else {
      this.frozenCanvas = null;
    }
    this.updateFreezeIndicator();
    playerWindowStore.setState({ isFrozen: frozen });
  }

  private updateFreezeIndicator(): void {
    if (!this.playerWindow || this.playerWindow.closed) return;
    const indicator = this.playerWindow.document.getElementById('atlas-player-freeze-indicator') as HTMLElement | null;
    if (indicator) {
      indicator.style.display = this.isCameraFrozen ? 'flex' : 'none';
    }
  }

  /** Snapshot the frame players currently see so it can be shown while frozen. */
  private freezeCurrentFrame(): void {
    if (!this.streamSource || !this.playerWindow || this.playerWindow.closed) return;

    const doc = this.playerWindow.document;
    const targetCanvas = doc.getElementById('atlas-player-canvas') as HTMLCanvasElement | null;
    if (!targetCanvas) return;

    this.frozenCanvas = doc.createElement('canvas');
    this.frozenCanvas.width = targetCanvas.width;
    this.frozenCanvas.height = targetCanvas.height;
    this.frozenCanvas.getContext('2d')?.drawImage(targetCanvas, 0, 0);
  }

  /**
   * Opens the player window
   */
  private openWindow(): void {
    try {
      let windowCaptured = false;
      
      // Listen for the window-open event to get the actual popout window
      const eventRef = this.app.workspace.on('window-open', (workspaceWindow, window) => {
        windowCaptured = true;
        
        // Store the actual popout window reference
        this.playerWindow = window;
        
        // Unregister the event listener after we've captured the window
        this.app.workspace.offref(eventRef);
        
        // Continue with window setup
        this.setupPlayerWindow();
      });

      // Open the popout leaf - this will trigger the window-open event
      const leaf = this.app.workspace.openPopoutLeaf();
      
      if (!leaf) {
        console.error('[PlayerWindowService] Failed to create popout leaf');
        this.app.workspace.offref(eventRef);
        new Notice("Failed to open player window - could not create popout leaf");
        return;
      }
      
      // Fallback: If window-open event doesn't fire within 1 second, clean up
      window.setTimeout(() => {
        if (!windowCaptured) {
          console.warn('[PlayerWindowService] window-open event did not fire, cleaning up');
          this.app.workspace.offref(eventRef);
          new Notice("Failed to open player window. If you have a popup blocker, please allow popups for Obsidian.");
        }
      }, 1000);

    } catch (error) {
      console.error('[PlayerWindowService] Error opening window:', error);
      new Notice("Failed to open player window");
    }
  }

  /**
   * Mirrors the main window's stylesheets into the popout by cloning the existing
   * `<link>`/`<style>` nodes, skipping the ones Obsidian already placed there.
   */
  private copyMainWindowStyles(doc: Document): void {
    const existing = new Set(
      Array.from(doc.head.querySelectorAll('link[rel="stylesheet"], style')).map(getStyleNodeKey),
    );
    document.head.querySelectorAll('link[rel="stylesheet"], style').forEach((node) => {
      if (existing.has(getStyleNodeKey(node))) return;
      doc.head.appendChild(doc.importNode(node, true));
    });
  }

  /**
   * Sets up the player window after it's been opened
   */
  private setupPlayerWindow(): void {
    if (!this.playerWindow) return;

    try {
      const doc = this.playerWindow.document;
      
      // Wait for the popout window to be fully loaded
      if (doc.readyState !== 'complete') {
        this.playerWindow.addEventListener('load', () => {
          this.setupPlayerWindow();
        }, { once: true });
        return;
      }
      
      // Hide all Obsidian UI elements
      const body = doc.body;
      
      // Double-check we have the right window
      if (this.playerWindow === window) {
        console.error('[PlayerWindowService] ERROR: Player window is the same as main window!');
        new Notice("Error: Player window is the main window");
        return;
      }
      
      body.empty(); // Clear body content
      
      this.copyMainWindowStyles(doc);
      body.classList.add(PLAYER_WINDOW_BODY_CLASS);
      body.classList.remove(PLAYER_WINDOW_LIVE_CLASS);

      // Create our UI elements
      const loading = body.createDiv();
      loading.id = 'atlas-player-loading';
      loading.textContent = 'Connecting to game session...';

      const canvas = body.createEl('canvas');
      canvas.id = 'atlas-player-canvas';

      const info = body.createDiv();
      info.id = 'atlas-player-info';
      info.createDiv({ text: 'Player view - display only' });
      info.createDiv().id = 'atlas-player-fps';
      
      // Create widget container
      const widgetContainer = body.createDiv();
      widgetContainer.id = 'atlas-player-widgets';
      widgetContainer.className = 'atlas-vtt-plugin';
      
      const updateWidgets = (): void => {
        this.widgetUnsubscribe?.();
        this.widgetUnsubscribe = null;
        widgetContainer.replaceChildren();
        if (this.settingsService.getLocalPlayerViewSettings().showWidgets) {
          this.renderWidgets(widgetContainer);
        }
      };
      updateWidgets();
      this.settingsUnsubscribe?.();
      this.settingsUnsubscribe = this.settingsService.onChange(updateWidgets);

      // Create freeze indicator
      const freezeIndicator = body.createDiv();
      freezeIndicator.id = 'atlas-player-freeze-indicator';
      const freezeIcon = createSvgElement(doc, 'svg', {
        width: '16',
        height: '16',
        viewBox: '0 0 24 24',
        fill: 'none',
        stroke: 'currentColor',
        'stroke-width': '2',
        'stroke-linecap': 'round',
        'stroke-linejoin': 'round',
      });
      freezeIcon.append(
        createSvgElement(doc, 'line', { x1: '2', y1: '12', x2: '22', y2: '12' }),
        createSvgElement(doc, 'line', { x1: '12', y1: '2', x2: '12', y2: '22' }),
        createSvgElement(doc, 'path', { d: 'M20 16l-4-4 4-4M4 8l4 4-4 4M16 4l-4 4-4-4M8 20l4-4 4 4' }),
      );
      freezeIndicator.append(freezeIcon);
      freezeIndicator.createSpan({ text: 'Camera paused' });
      freezeIndicator.style.display = this.isCameraFrozen ? 'flex' : 'none';
      
      // Create title bar container
      const titleBarContainer = body.createDiv();
      titleBarContainer.id = 'atlas-player-titlebar-container';
      
      // Create title bar for dragging
      const titleBar = titleBarContainer.createDiv();
      titleBar.id = 'atlas-player-titlebar';
      const titleBarText = titleBar.createDiv();
      titleBarText.id = 'atlas-player-titlebar-text';
      titleBarText.textContent = 'Atlas player view';
      

      // Set window title
      doc.title = 'Atlas player view';

      // Start mirroring
      this.startMirroring();
      playerWindowStore.setState({ isOpen: true });

      // Handle window resize
      this.playerWindow.addEventListener('resize', this.boundHandleWindowResize);

      // Cleanup on close
      this.playerWindow.addEventListener('beforeunload', this.boundHandleBeforeUnload);

    } catch (error) {
      console.error('[PlayerWindowService] Error setting up player window:', error);
      new Notice("Failed to set up player window");
    }
  }


  /**
   * Renders widgets in the player window
   */
  private renderWidgets(container: HTMLElement): void {
    this.widgetUnsubscribe?.();
    this.widgetUnsubscribe = null;

    const state = this.store.getState();
    const widgetSettings = state.widgetSettings;
    
    if (!widgetSettings || !widgetSettings.globalVisible) return;
    
    // Filter widgets visible to players
    const visibleWidgets = Object.values(widgetSettings.widgets)
      .filter(w => w.visible && w.visibleToPlayers)
      .sort((a, b) => a.order - b.order);
      
    if (visibleWidgets.length === 0) return;
    
    // Create widget bar
    const widgetBar = container.createDiv();
    widgetBar.className = `atlas-widget-bar atlas-widget-bar-${widgetSettings.position}`;
    
    const widgetContainer = widgetBar.createDiv({ cls: 'atlas-widget-container' });
    widgetContainer.style.transform = `scale(${widgetSettings.scale || 1})`;
    
    // Render each widget
    visibleWidgets.forEach(widget => {
      const widgetEl = this.createWidgetElement(container.ownerDocument, widget);
      if (widgetEl) {
        widgetContainer.appendChild(widgetEl);
      }
    });
    
    
    // Subscribe to store changes to update widgets
    this.widgetUnsubscribe = this.store.subscribe((state: ViewAtlasState) => {
      const widgetSettings = state.widgetSettings;
      if (widgetSettings && widgetSettings.widgets) {
        Object.values(widgetSettings.widgets).forEach((widget: any) => {
          const valueEl = container.ownerDocument.getElementById(`atlas-widget-value-${widget.id}`);
          if (valueEl) {
            valueEl.textContent = String(state.widgetValues?.[widget.id] ?? widget.value);
          }
        });
      }
    });
  }
  
  /**
   * Creates a widget element
   */
  private createWidgetElement(doc: Document, widget: any): HTMLElement | null {
    if (widget.type !== 'counter') return null; // For now, only support counter widgets
    
    const widgetEl = doc.createElement('div');
    widgetEl.className = 'atlas-widget atlas-widget-counter';
    
    const color: string = widget.color || '#ffc107';
    widgetEl.style.setProperty('--widget-color', color);
    const iconWrapper = widgetEl.createDiv({ cls: 'atlas-widget-icon-wrapper' });
    const icon = createSvgElement(doc, 'svg', { viewBox: '0 0 512 512', fill: 'currentColor' });
    icon.appendChild(createSvgElement(doc, 'path', { d: WIDGET_ICON_PATHS[resolveWidgetIcon(widget.icon)] }));
    iconWrapper.appendChild(icon);
    
    // Content wrapper
    const content = widgetEl.createDiv({ cls: 'atlas-widget-content' });
    
    // Value row
    const valueRow = content.createDiv({ cls: 'atlas-widget-value-row' });
    
    const value = valueRow.createSpan();
    value.id = `atlas-widget-value-${widget.id}`;
    value.className = 'atlas-widget-value';
    value.textContent = String(this.store.getState().widgetValues?.[widget.id] ?? widget.value);
    
    // Label
    const label = content.createDiv({ cls: 'atlas-widget-label' });
    label.textContent = widget.label;
    
    
    
    return widgetEl;
  }

  /**
   * Handle window resize
   */
  private handleWindowResize(): void {
    // No need to do anything - canvas maintains its aspect ratio with object-fit: contain
  }

  /**
   * Starts mirroring the canvas content
   */
  private startMirroring(): void {
    if (!this.playerWindow || !this.streamSource) return;

    const targetCanvas = this.playerWindow.document.getElementById('atlas-player-canvas') as HTMLCanvasElement;
    const fpsDisplay = this.playerWindow.document.getElementById('atlas-player-fps') as HTMLElement | null;
    
    if (!targetCanvas) return;

    const targetCtx = targetCanvas.getContext('2d');
    if (!targetCtx) return;

    this.playerWindow.document.body.classList.add(PLAYER_WINDOW_LIVE_CLASS);

    let lastTime = performance.now();
    let frameCount = 0;
    let lastCopyAt = 0;
    let lastDrawnSource: HTMLCanvasElement | null = null;

    const copyCanvas = (frameTime: number = performance.now()) => {
      if (!this.playerWindow || this.playerWindow.closed || !this.streamSource) {
        this.cleanup();
        return;
      }

      this.animationFrame = window.requestAnimationFrame(copyCanvas);

      // The player window never needs more than 30 fps; skip in-between frames.
      if (frameTime - lastCopyAt < PLAYER_WINDOW_FRAME_INTERVAL_MS) return;
      lastCopyAt = frameTime;

      try {
        const frozen = this.isCameraFrozen ? this.frozenCanvas : null;
        const source = frozen ?? this.streamSource.canvas;

        // A frozen frame is static: draw it once, then idle until it changes.
        if (source === this.frozenCanvas && lastDrawnSource === source) return;
        lastDrawnSource = source;

        const sourceWidth = source.width;
        const sourceHeight = source.height;
        if (targetCanvas.width !== sourceWidth || targetCanvas.height !== sourceHeight) {
          targetCanvas.width = sourceWidth;
          targetCanvas.height = sourceHeight;
        }

        const draw = (): void => {
          targetCtx.clearRect(0, 0, sourceWidth, sourceHeight);
          targetCtx.drawImage(source, 0, 0);
        };
        if (frozen) {
          draw();
        } else {
          this.streamSource.withPlayerSafeFrame(draw, this.settingsService.getLocalPlayerViewSettings());
        }
        frameCount++;

        if (frameTime - lastTime >= 1000) {
          if (fpsDisplay) {
            fpsDisplay.textContent = `FPS: ${frameCount}`;
          }
          frameCount = 0;
          lastTime = frameTime;
        }
      } catch (error) {
        console.error('[PlayerWindowService] Error copying canvas:', error);
      }
    };

    // Start the copy loop
    copyCanvas();
  }

  /**
   * Cleanup resources
   */
  private cleanup(closeWindow = true): void {
    if (this.isCleaningUp) {
      return;
    }

    this.isCleaningUp = true;

    if (this.animationFrame) {
      window.cancelAnimationFrame(this.animationFrame);
      this.animationFrame = null;
    }

    this.widgetUnsubscribe?.();
    this.widgetUnsubscribe = null;
    this.settingsUnsubscribe?.();
    this.settingsUnsubscribe = null;

    if (this.playerWindow) {
      this.playerWindow.removeEventListener('resize', this.boundHandleWindowResize);
      this.playerWindow.removeEventListener('beforeunload', this.boundHandleBeforeUnload);
    }
    
    if (closeWindow && this.playerWindow && !this.playerWindow.closed) {
      this.playerWindow.close();
    }
    
    this.playerWindow = null;
    this.streamSource = null;
    this.frozenCanvas = null;
    this.isCameraFrozen = false;
    this.isAutoFrozen = false;
    resetPlayerWindowStore();
    // The window is gone: drop the singleton so the next present binds to the presenting view's store.
    if (PlayerWindowService.instance === this) {
      PlayerWindowService.instance = null;
    }
    this.isCleaningUp = false;
  }

  /**
   * Destroy the service
   */
  public destroy(): void {
    this.cleanup();
  }
}
