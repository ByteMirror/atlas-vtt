import { App, Notice } from 'obsidian';
import type { ViewAtlasState } from '../storeFactory';
import type { StoreApi } from 'zustand';
import type { AtlasSettings, SettingsService } from './SettingsService';
import { playerWindowStore, resetPlayerWindowStore } from '../stores/playerWindowStore';
import './player-window.scss';
import { PlayerInitiativePanel } from './PlayerInitiativePanel';
import type { PlayerSceneOverlay } from './PlayerSceneOverlay';
import { PlayerWidgetBar } from './PlayerWidgetBar';
import { LocalPlayerView, LOCAL_PLAYER_VIEW_TYPE, type PlayerCameraState } from '../local-player-view';
import { freezeCanvasFrame, type SceneTransition } from '../pixi/sceneTransition';

/** Scopes the rules in `player-window.scss` to the popout document. */
const PLAYER_WINDOW_BODY_CLASS = 'atlas-player-window';
/** Set once frames are being mirrored: swaps the loading message for the canvas. */
const PLAYER_WINDOW_LIVE_CLASS = 'atlas-player-window--live';

/** Identifies a stylesheet node so the same sheet is not added to the popout twice. */
function getStyleNodeKey(node: Element): string {
  return node.instanceOf(HTMLLinkElement) ? `link:${node.href}` : `style:${node.textContent ?? ''}`;
}

/** A DM map canvas that can briefly render itself without DM-only layers. */
export interface PlayerFrameSource {
  canvas: HTMLCanvasElement;
  store?: StoreApi<ViewAtlasState>;
  getCamera?(): PlayerCameraState | undefined;
  /**
   * Runs `capture` while `canvas` holds a frame that is safe to show players,
   * rendered from `camera` when given instead of the DM's camera.
   */
  withPlayerSafeFrame(capture: () => void, settings: AtlasSettings['localPlayerView'], camera?: PlayerCameraState): void;
  /** Renders of `canvas` so far. When given, frames are only mirrored after the canvas changed. */
  getRenderedFrames?(): number | undefined;
}

/**
 * Mirrors a DM map canvas into a popout window for players.
 *
 * The window shows one scene tab at a time (see `playerWindowStore.presentedTabId`).
 * While the DM works on another tab the last frame is held so players never see
 * the DM's navigation; `PlayerWindowPresenter` drives that hold/release cycle.
 * A camera freeze only pins the camera: the scene keeps updating (tokens, fog)
 * while the DM pans and zooms their own view.
 */
export class PlayerWindowService {
  private playerWindow: Window | null = null;
  private playerView: LocalPlayerView | null = null;
  private app: App;
  private store: StoreApi<ViewAtlasState>;
  private settingsService: SettingsService;
  private streamSource: PlayerFrameSource | null = null;
  private animationFrame: number | null = null;
  /** Camera the DM froze players on; the presented scene is still rendered live through it. */
  private frozenCamera: PlayerCameraState | null = null;
  /** Last player frame, shown unchanged while the DM works on another scene tab. */
  private heldFrame: HTMLCanvasElement | null = null;
  /** Crossfade from the previous map, still playing after the DM presented another scene. */
  private mapTransition: SceneTransition | null = null;
  private static instance: PlayerWindowService | null = null;
  private settingsUnsubscribe: (() => void) | null = null;
  /** Widget bar and initiative panel, drawn from the presented scene. */
  private sceneOverlays: PlayerSceneOverlay<object>[] = [];
  private readonly boundHandleWindowResize = (): void => {
    this.handleWindowResize();
  };
  private readonly boundHandleBeforeUnload = (): void => {
    this.cleanup(false);
  };
  private isCleaningUp = false;
  /** Set when the next live frame must be mirrored even if the DM canvas did not render. */
  private isMirrorStale = true;
  /** Identifies the running copy loop; a newer loop ends older ones. */
  private mirrorLoopId = 0;

  constructor(app: App, store: StoreApi<ViewAtlasState>, settingsService: SettingsService) {
    this.app = app;
    this.store = store;
    this.settingsService = settingsService;
    PlayerWindowService.instance = this;
  }

  public static getInstance(): PlayerWindowService | null {
    return PlayerWindowService.instance;
  }

  /** Toggle the DM's camera freeze and return the new frozen state. */
  public toggleCameraFreeze(): boolean {
    if (this.frozenCamera) {
      this.setFrozenCamera(null);
    } else {
      this.freezeCamera();
    }
    new Notice(this.isFrozen() ? 'Player view camera frozen' : 'Player view camera unfrozen');
    return this.isFrozen();
  }

  /**
   * Keep players on `camera`, by default the camera they currently see. Map
   * changes stay visible; only the DM's panning and zooming no longer reach them.
   */
  public freezeCamera(camera?: PlayerCameraState): void {
    this.setFrozenCamera(camera ?? this.playerView?.getState().camera ?? this.streamSource?.getCamera?.() ?? null);
  }

  public isFrozen(): boolean {
    return this.frozenCamera !== null;
  }

  public isWindowOpen(): boolean {
    return this.playerWindow !== null && !this.playerWindow.closed;
  }

  /** The open popout window, or null when there is none. */
  public getWindow(): Window | null {
    return this.isWindowOpen() ? this.playerWindow : null;
  }

  /** Keep players on the current frame while the DM works on another scene tab. */
  public holdCurrentFrame(): void {
    if (!this.isWindowOpen()) return;
    this.sceneOverlays.forEach((overlay) => overlay.hold());
    if (this.heldFrame) return;
    this.heldFrame = this.snapshotPlayerFrame();
    this.updateFreezeIndicator();
  }

  /**
   * Keep players on the last frame and let go of the map view that owns `store`,
   * which is closing. Presenting another scene resumes live mirroring.
   */
  public releaseSource(store: StoreApi<ViewAtlasState>): void {
    if (!this.streamSource || this.streamSource.store !== store) return;
    this.holdCurrentFrame();
    const heldFrame = this.heldFrame ?? createEl('canvas');
    this.streamSource = { canvas: heldFrame, withPlayerSafeFrame: (capture) => capture() };
  }

  /**
   * Resume live mirroring from `source` once the presented scene is rendered again.
   * A camera freeze stays in place, so players return to the same framing.
   */
  public releaseHeldFrame(source: PlayerFrameSource): void {
    if (!this.isWindowOpen()) return;
    this.streamSource = source;
    this.isMirrorStale = true;
    this.presentScene();
    this.heldFrame = null;
    this.updateFreezeIndicator();
  }

  /**
   * Show the scene tab `tabId`, already rendered into `source`, to players.
   * Any freeze is lifted because the DM explicitly chose what players see.
   */
  public presentCanvas(source: PlayerFrameSource, tabId: string, filePath?: string): void {
    if (!this.isWindowOpen()) {
      new Notice('Player window is not open');
      return;
    }
    if (playerWindowStore.getState().presentedTabId !== tabId) this.crossfadeToNextMap();
    this.streamSource = source;
    this.isMirrorStale = true;
    this.presentScene();
    this.heldFrame = null;
    this.setFrozenCamera(null);
    playerWindowStore.setState({ presentedTabId: tabId });
    this.playerView?.updateSession({ tabId, ...(filePath ? { filePath } : {}), frozen: false });
  }

  /** Opens a player window mirroring `source`, which shows the scene tab `tabId`. */
  public async openPlayerWindow(source: PlayerFrameSource, tabId: string, filePath: string): Promise<void> {
    const leaf = this.app.workspace.getLeavesOfType(LOCAL_PLAYER_VIEW_TYPE)[0] ?? this.app.workspace.openPopoutLeaf();
    await leaf.setViewState({ type: LOCAL_PLAYER_VIEW_TYPE, state: { tabId, filePath, frozen: false } });
    if (leaf.view instanceof LocalPlayerView) this.attachToView(leaf.view, source, tabId);
  }

  public ownsView(view: LocalPlayerView): boolean {
    return this.playerView === view;
  }

  public attachToView(view: LocalPlayerView, source: PlayerFrameSource, tabId: string): void {
    this.playerView = view;
    this.playerWindow = view.contentEl.win;
    this.streamSource = source;
    this.isMirrorStale = true;
    playerWindowStore.setState({ presentedTabId: tabId });
    // Bind now: the popout may still be loading, and the DM can switch tabs before it has
    this.destroySceneOverlays();
    this.sceneOverlays = [
      new PlayerWidgetBar(this.settingsService),
      new PlayerInitiativePanel(this.app, this.settingsService),
    ];
    this.presentScene();
    this.setupPlayerWindow();
  }

  private setFrozenCamera(camera: PlayerCameraState | null): void {
    this.frozenCamera = camera ? { ...camera } : null;
    this.isMirrorStale = true;
    this.updateFreezeIndicator();
    playerWindowStore.setState({ isFrozen: this.isFrozen() });
    this.playerView?.updateSession({ frozen: this.isFrozen(), ...(camera ? { camera: { ...camera } } : {}) });
  }

  private updateFreezeIndicator(): void {
    if (!this.playerWindow || this.playerWindow.closed) return;
    const indicator = this.playerWindow.document.getElementById('atlas-player-freeze-indicator');
    if (indicator) {
      indicator.style.display = this.frozenCamera || this.heldFrame ? 'flex' : 'none';
    }
  }

  /** Fades the frame players see into the next scene, the same transition the DM view plays. */
  private crossfadeToNextMap(): void {
    const targetCanvas = this.playerWindow?.document.getElementById('atlas-player-canvas');
    if (!targetCanvas?.instanceOf(HTMLCanvasElement)) return;
    // A 2D canvas keeps its pixels, so the frame on screen can be copied at any time.
    // The player canvas is drawn with crisp-edges, so players get the crossfade without the scale settle.
    this.mapTransition = freezeCanvasFrame(
      targetCanvas, (context) => context.drawImage(targetCanvas, 0, 0), this.mapTransition, { settle: false },
    );
    this.mapTransition?.play();
  }

  /** Copy the frame players currently see so it can be held while the DM is elsewhere. */
  private snapshotPlayerFrame(): HTMLCanvasElement | null {
    if (!this.streamSource || !this.playerWindow || this.playerWindow.closed) return null;

    const targetCanvas = this.playerWindow.document.getElementById('atlas-player-canvas') as HTMLCanvasElement | null;
    if (!targetCanvas) return null;

    // Never attached to a document: it is only a pixel buffer, so it can live in the
    // main window. drawImage works across windows, as the live mirroring relies on.
    const snapshot = createEl('canvas');
    snapshot.width = targetCanvas.width;
    snapshot.height = targetCanvas.height;
    snapshot.getContext('2d')?.drawImage(targetCanvas, 0, 0);
    return snapshot;
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
      
      const content = this.playerView?.contentEl ?? body;
      content.empty();
      
      this.copyMainWindowStyles(doc);
      body.classList.add(PLAYER_WINDOW_BODY_CLASS);
      body.classList.remove(PLAYER_WINDOW_LIVE_CLASS);

      // Create our UI elements
      const loading = content.createDiv();
      loading.id = 'atlas-player-loading';
      loading.textContent = 'Connecting to game session...';

      const canvas = content.createEl('canvas');
      canvas.id = 'atlas-player-canvas';

      this.sceneOverlays.forEach((overlay) => overlay.mount(content));
      this.settingsUnsubscribe?.();
      // Player view settings decide which layers players see
      this.settingsUnsubscribe = this.settingsService.onChange(() => { this.isMirrorStale = true; });

      // Create freeze indicator
      const freezeIndicator = content.createDiv();
      freezeIndicator.id = 'atlas-player-freeze-indicator';
      const freezeIcon = freezeIndicator.createSvg('svg', { attr: {
        width: 16,
        height: 16,
        viewBox: '0 0 24 24',
        fill: 'none',
        stroke: 'currentColor',
        'stroke-width': 2,
        'stroke-linecap': 'round',
        'stroke-linejoin': 'round',
      } });
      freezeIcon.createSvg('line', { attr: { x1: 2, y1: 12, x2: 22, y2: 12 } });
      freezeIcon.createSvg('line', { attr: { x1: 12, y1: 2, x2: 12, y2: 22 } });
      freezeIcon.createSvg('path', { attr: { d: 'M20 16l-4-4 4-4M4 8l4 4-4 4M16 4l-4 4-4-4M8 20l4-4 4 4' } });
      freezeIndicator.createSpan({ text: 'Camera paused' });
      freezeIndicator.style.display = this.frozenCamera || this.heldFrame ? 'flex' : 'none';
      
      // Create title bar container
      const titleBarContainer = content.createDiv();
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

  /** Bind the overlays to the view store that now holds the presented scene. */
  private presentScene(): void {
    const store = this.streamSource?.store ?? this.store;
    this.sceneOverlays.forEach((overlay) => overlay.present(store));
  }

  private destroySceneOverlays(): void {
    this.sceneOverlays.forEach((overlay) => overlay.destroy());
    this.sceneOverlays = [];
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
    
    if (!targetCanvas) return;

    const targetCtx = targetCanvas.getContext('2d');
    if (!targetCtx) return;

    this.playerWindow.document.body.classList.add(PLAYER_WINDOW_LIVE_CLASS);

    let lastHeldFrame: HTMLCanvasElement | null = null;
    let lastDrawnCanvas: HTMLCanvasElement | null = null;
    let lastRenderedFrames: number | undefined;
    const loopId = ++this.mirrorLoopId;
    this.isMirrorStale = true;

    const draw = (source: HTMLCanvasElement): void => {
      if (targetCanvas.width !== source.width || targetCanvas.height !== source.height) {
        targetCanvas.width = source.width;
        targetCanvas.height = source.height;
      }
      targetCtx.clearRect(0, 0, source.width, source.height);
      targetCtx.drawImage(source, 0, 0);
    };

    const copyCanvas = (): void => {
      if (loopId !== this.mirrorLoopId) return;
      if (!this.playerWindow || this.playerWindow.closed || !this.streamSource) {
        this.cleanup();
        return;
      }

      this.animationFrame = this.playerWindow.requestAnimationFrame(copyCanvas);

      try {
        const held = this.heldFrame;
        if (held) {
          // A held frame is static: draw it once, then idle until it changes.
          if (held !== lastHeldFrame) draw(held);
          lastHeldFrame = held;
          return;
        }
        if (lastHeldFrame) this.isMirrorStale = true;
        lastHeldFrame = null;

        // A live frame only changes when the DM canvas rendered something new
        const source = this.streamSource;
        const renderedFrames = source.getRenderedFrames?.();
        const isUnchanged = !this.isMirrorStale && lastDrawnCanvas === source.canvas
          && renderedFrames !== undefined && renderedFrames === lastRenderedFrames;
        if (isUnchanged) return;
        lastDrawnCanvas = source.canvas;
        lastRenderedFrames = renderedFrames;
        this.isMirrorStale = false;

        const frozenCamera = this.frozenCamera ?? undefined;
        source.withPlayerSafeFrame(() => draw(source.canvas), this.settingsService.getLocalPlayerViewSettings(), frozenCamera);
        this.recordPlayerCamera(frozenCamera ?? source.getCamera?.());
      } catch (error) {
        console.error('[PlayerWindowService] Error copying canvas:', error);
      }
    };

    // Start the copy loop
    copyCanvas();
  }

  /** Persist the camera players see so a restored window reopens on the same framing. */
  private recordPlayerCamera(camera: PlayerCameraState | undefined): void {
    const previous = this.playerView?.getState().camera;
    if (camera && (camera.centerX !== previous?.centerX || camera.centerY !== previous.centerY || camera.scale !== previous.scale)) {
      this.playerView?.updateSession({ camera });
    }
  }

  /**
   * Cleanup resources
   */
  private cleanup(closeWindow = true): void {
    if (this.isCleaningUp) {
      return;
    }

    this.isCleaningUp = true;
    this.mirrorLoopId++;

    if (this.animationFrame) {
      this.playerWindow?.cancelAnimationFrame(this.animationFrame);
      this.animationFrame = null;
    }

    this.settingsUnsubscribe?.();
    this.settingsUnsubscribe = null;
    this.destroySceneOverlays();
    this.mapTransition?.cancel();
    this.mapTransition = null;

    if (this.playerWindow) {
      this.playerWindow.removeEventListener('resize', this.boundHandleWindowResize);
      this.playerWindow.removeEventListener('beforeunload', this.boundHandleBeforeUnload);
    }
    
    if (closeWindow && this.playerWindow && !this.playerWindow.closed) {
      this.playerWindow.close();
    }
    
    this.playerWindow = null;
    this.playerView = null;
    this.streamSource = null;
    this.heldFrame = null;
    this.frozenCamera = null;
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
  public destroy(closeWindow = true): void {
    this.cleanup(closeWindow);
  }
}
