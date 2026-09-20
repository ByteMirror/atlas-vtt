import { Sprite, Texture, Container, Graphics } from 'pixi.js';
import type { Application } from 'pixi.js';
import type { Viewport } from 'pixi-viewport';
import type { StoreApi } from 'zustand';
import type { ViewAtlasState } from '../../storeFactory';
import type { VisionPolygon } from '../../types/visionTypes';
import type { VisionSettings, LightSource } from '../../types/wallTypes';
import { WALLS_AND_LIGHTING_ENABLED } from '../../featureFlags';
import { VisionCompositor } from './VisionCompositor';
import { computeVisibilityPolygon } from '../../vision/radialSweep';
import { collectVisionSources } from '../../vision/visionSources';
import { AssetService } from '../../services/AssetService';
import { computeLightAnimation, clearAllLightAnimState } from './LightAnimation';
import { runInBackground } from '../../utils/backgroundTask';

/**
 * Orchestrates dynamic vision: checks dirty flag each frame,
 * recomputes visibility polygons, composites mask, updates sprite.
 */
export class VisionRenderer {
  private container: Container;
  private viewport: Viewport;
  private store: StoreApi<ViewAtlasState>;
  private obsApp: any; // Obsidian App
  private pixiApp: Application;
  private compositor: VisionCompositor;
  private maskSprite: Sprite | null = null;
  private maskTexture: Texture | null = null;
  private lightIconGraphics: Graphics;
  private colorTintSprite: Sprite | null = null;
  private colorTintTexture: Texture | null = null;
  private colorTintCanvas: HTMLCanvasElement;
  private colorTintCtx: CanvasRenderingContext2D;
  private doorIconContainer: Container;
  private doorOpenTexture: Texture | null = null;
  private doorClosedTexture: Texture | null = null;
  private tickerCallback: (() => void) | null = null;
  private lastAnimationTick: number = 0;
  private hasAnimatedLights: boolean = false;
  private objectsDirty: boolean = false;
  private _isDestroyed: boolean = false;
  private lastPolygons: VisionPolygon[] = [];
  private _unsubscribe?: () => void;

  // Lucide door SVGs — stroke="currentColor" replaced at load time
  private static readonly DOOR_OPEN_SVG = `<svg xmlns="http://www.w3.org/2000/svg" width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M11 20H2"/><path d="M11 4.562v16.157a1 1 0 0 0 1.242.97L19 20V5.562a2 2 0 0 0-1.515-1.94l-4-1A2 2 0 0 0 11 4.561z"/><path d="M11 4H8a2 2 0 0 0-2 2v14"/><path d="M14 12h.01"/><path d="M22 20h-3"/></svg>`;
  private static readonly DOOR_CLOSED_SVG = `<svg xmlns="http://www.w3.org/2000/svg" width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M10 12h.01"/><path d="M18 20V6a2 2 0 0 0-2-2H8a2 2 0 0 0-2 2v14"/><path d="M2 20h20"/></svg>`;
  private static readonly ICON_CANVAS_SIZE = 96; // DPR-aware texture size
  private static readonly BADGE_SIZE = 22; // World-pixel diameter of the circular badge

  /** GM peek state: when true, vision mask is hidden */
  private isPeeking: boolean = false;

  constructor(
    viewport: Viewport,
    pixiApp: Application,
    store: StoreApi<ViewAtlasState>,
    obsApp: any,
  ) {
    this.viewport = viewport;
    this.pixiApp = pixiApp;
    this.store = store;
    this.obsApp = obsApp;
    this.compositor = new VisionCompositor();

    this.container = new Container();
    this.container.zIndex = 900;
    this.container.sortableChildren = true;
    this.container.eventMode = 'none';

    // Always-visible icons rendered above the vision mask
    this.lightIconGraphics = new Graphics();
    this.lightIconGraphics.zIndex = 1050; // Above fog (1000), below wall editor (1100)
    this.lightIconGraphics.eventMode = 'none';

    this.colorTintCanvas = createEl('canvas');
    this.colorTintCtx = this.colorTintCanvas.getContext('2d')!;

    this.doorIconContainer = new Container();
    this.doorIconContainer.zIndex = 1200; // Above fog (1000) and wall editor (1100)
    this.doorIconContainer.eventMode = 'passive'; // Allow children to receive events
    this.doorIconContainer.interactiveChildren = true;

    viewport.addChild(this.container);
    viewport.addChild(this.doorIconContainer);
    viewport.addChild(this.lightIconGraphics);

    // Load door icon textures asynchronously
    runInBackground(this.loadDoorTextures(), 'Loading door icon textures');

    this.tickerCallback = () => this.onTick();
    this.pixiApp.ticker.add(this.tickerCallback);

    // Vision depends only on tokens, walls and lights. Comparing those slices by
    // reference (Immer preserves untouched branches) catches hydration, bulk
    // loads and undo/redo without recomputing on drawing, pin, text or fog edits.
    let prev = store.getState().objects;
    this._unsubscribe = store.subscribe((state) => {
      const objects = state.objects;
      if (objects === prev) return;
      const changed =
        objects.tokens !== prev.tokens ||
        objects.walls !== prev.walls ||
        objects.lights !== prev.lights;
      prev = objects;
      if (changed) this.objectsDirty = true;
    });
  }

  /**
   * Animated lights only need to keep recomputing while the canvas can be seen.
   * Obsidian hides inactive leaves with display:none, so offsetParent is null.
   */
  private isCanvasVisible(): boolean {
    if (document.hidden) return false;
    const canvas = this.pixiApp.canvas;
    return canvas.isConnected && canvas.offsetParent !== null;
  }

  private onTick(): void {
    if (this._isDestroyed) return;

    const now = performance.now();
    const state = this.store.getState();
    let dirty = state.consumeVisionDirty() || this.objectsDirty;
    this.objectsDirty = false;

    // Animated lights: trigger recompute at ~10fps for intensity animation.
    // Since the mask covers the full map (fixed bounds), the recompute cost
    // is constant regardless of zoom — no viewport-dependent resizing.
    if (this.hasAnimatedLights && !dirty && now - this.lastAnimationTick > 100 && this.isCanvasVisible()) {
      dirty = true;
      this.lastAnimationTick = now;
    }

    if (dirty) {
      this.drawDoorIcons(state);

      const visionSettings = this.getVisionSettings();
      if (!WALLS_AND_LIGHTING_ENABLED || !visionSettings?.enabled) {
        this.clearMask();
        return;
      }

      this.recompute(state, visionSettings, now);
    }

    // Animated lights: update orb glow at ~15fps (cheap Graphics redraw)
    if (this.hasAnimatedLights && now - this.lastAnimationTick < 10) {
      this.drawLightOrbs(state, now);
    }
  }

  /**
   * Bind a canvas to a reusable PIXI texture. When the canvas keeps the same
   * object and dimensions — the common case during light animation, since the
   * vision mask covers fixed map bounds — the existing texture's pixels are
   * re-uploaded to the GPU in place via source.update(), allocating nothing.
   * The texture is only (re)created on first bind or when the canvas dimensions
   * change (e.g. the map size changed). Allocating a fresh texture every frame
   * via Texture.from() caused multi-gigabyte GPU churn at ~10fps.
   */
  private syncCanvasTexture(existing: Texture | null, canvas: HTMLCanvasElement): Texture {
    if (
      existing &&
      !existing.destroyed &&
      existing.source.resource === canvas &&
      existing.source.pixelWidth === canvas.width &&
      existing.source.pixelHeight === canvas.height
    ) {
      existing.source.update();
      existing.update();
      return existing;
    }
    if (existing && !existing.destroyed) existing.destroy(true);
    return Texture.from(canvas);
  }

  private recompute(state: ViewAtlasState, visionSettings: VisionSettings, now: number = performance.now()): void {
    const walls = Object.values(state.objects.walls);
    const lights = state.objects.lights;

    this.hasAnimatedLights = false;
    const grid = state.grid;
    const gridSize = grid?.size ?? 70;

    // Read unitDistance from COLLECTION settings (authoritative source),
    // falling back to per-map grid, then default 5.
    const collectionGridDefaults = this.getCollectionGridDefaults();
    const unitDist = collectionGridDefaults?.unitDistance ?? grid?.unitDistance ?? 5;

    const sources = collectVisionSources(
      state.objects.tokens, lights, visionSettings, gridSize, unitDist,
    );

    if (sources.length === 0) {
      this.clearMask();
      return;
    }

    // Compute visibility polygons with animation applied
    const polygons: VisionPolygon[] = [];
    for (const source of sources) {
      const light = lights[source.id];
      let animatedSource = source;

      if (light) {
        const style = light.lightStyle ?? 'torch';
        if (style !== 'steady') this.hasAnimatedLights = true;
        const anim = computeLightAnimation(light.id, style, now);

        // Animate inner radius (bright pool breathes) — outer stays fixed
        animatedSource = {
          ...source,
          innerRadius: source.innerRadius * anim.radiusMul,
        };
      }

      const poly = computeVisibilityPolygon(animatedSource, walls);

      // Set intensity for gradient brightness modulation
      if (light) {
        const anim = computeLightAnimation(light.id, light.lightStyle ?? 'torch', now);
        poly.intensity = anim.intensityMul;
      }

      polygons.push(poly);
    }
    this.lastPolygons = polygons;

    const bounds = this.getWorldBounds();
    const canvas = this.compositor.render(polygons, bounds);
    const offset = this.compositor.getOffset();
    const scale = this.compositor.getScale();

    // Update shadow mask — reuse the texture, re-uploading pixels in place
    this.maskTexture = this.syncCanvasTexture(this.maskTexture, canvas);

    if (!this.maskSprite) {
      this.maskSprite = new Sprite(this.maskTexture);
      this.maskSprite.eventMode = 'none';
      this.container.addChild(this.maskSprite);
    } else {
      this.maskSprite.texture = this.maskTexture;
    }

    this.maskSprite.position.set(offset.x, offset.y);
    this.maskSprite.scale.set(1 / scale);

    // Render color tint overlay for colored lights
    this.renderColorTint(polygons, lights, bounds, offset, scale, now);
    this.maskSprite.visible = !this.isPeeking;
  }

  private getWorldBounds(): { minX: number; minY: number; maxX: number; maxY: number } {
    // Cover the entire map, not just the visible viewport.
    // This ensures the vision mask is complete at every zoom level.
    const vp = this.viewport;
    const margin = 200;
    const worldW = vp.worldWidth || 4000;
    const worldH = vp.worldHeight || 4000;
    return {
      minX: -margin,
      minY: -margin,
      maxX: worldW + margin,
      maxY: worldH + margin,
    };
  }

  private getCollectionGridDefaults(): { unitDistance: number; unitType: string } | undefined {
    const state = this.store.getState();
    const mapPath = state.mapPath;
    if (!mapPath) return undefined;
    const assetService = AssetService.getInstance(this.obsApp);
    const collectionId = assetService.getCollectionForMap(mapPath);
    if (!collectionId) return undefined;
    return assetService.getCollectionSettings(collectionId).gridDefaults;
  }

  private getVisionSettings(): VisionSettings | undefined {
    const state = this.store.getState();
    const mapPath = state.mapPath;
    if (!mapPath) return undefined;
    const assetService = AssetService.getInstance(this.obsApp);
    const collectionId = assetService.getCollectionForMap(mapPath);
    if (!collectionId) return undefined;
    return assetService.getCollectionSettings(collectionId).vision;
  }

  /** Toggle GM peek mode. */
  setPeeking(peeking: boolean): void {
    this.isPeeking = peeking;
    if (this.maskSprite) this.maskSprite.visible = !peeking;
    if (this.colorTintSprite) this.colorTintSprite.visible = !peeking;
  }

  getContainer(): Container {
    return this.container;
  }

  getLastPolygons(): VisionPolygon[] {
    return this.lastPolygons;
  }

  /**
   * Render a color tint overlay for colored light sources.
   * Uses Canvas 2D: for each light with a color, draws a radial gradient
   * in that color clipped to the visibility polygon, composited as a
   * semi-transparent multiply layer.
   */
  private renderColorTint(
    polygons: VisionPolygon[],
    lights: Record<string, LightSource>,
    bounds: { minX: number; minY: number; maxX: number; maxY: number },
    offset: { x: number; y: number },
    scale: number,
    now: number,
  ): void {
    // Check if any lights have colors
    const coloredLights = Object.values(lights).filter(l => l.color);
    if (coloredLights.length === 0) {
      if (this.colorTintSprite) this.colorTintSprite.visible = false;
      return;
    }

    const w = Math.ceil((bounds.maxX - bounds.minX) * scale);
    const h = Math.ceil((bounds.maxY - bounds.minY) * scale);

    // Reuse persistent canvas (resizing clears it without reallocation)
    this.colorTintCanvas.width = w;
    this.colorTintCanvas.height = h;
    const ctx = this.colorTintCtx;

    // For each colored light, draw its tint within its visibility polygon
    for (const light of coloredLights) {
      const poly = polygons.find(p => p.sourceId === light.id);
      if (!poly || !light.color) continue;

      const anim = computeLightAnimation(light.id, light.lightStyle, now);
      const outerR = (light.outerRadius ?? light.innerRadius) * anim.radiusMul * scale;
      const cx = (light.x - bounds.minX) * scale;
      const cy = (light.y - bounds.minY) * scale;

      ctx.save();
      // Clip to visibility polygon
      ctx.beginPath();
      for (let i = 0; i < poly.vertices.length; i++) {
        const v = poly.vertices[i]!;
        const vx = (v.x - bounds.minX) * scale;
        const vy = (v.y - bounds.minY) * scale;
        if (i === 0) ctx.moveTo(vx, vy); else ctx.lineTo(vx, vy);
      }
      ctx.closePath();
      ctx.clip();

      // Radial gradient in the light's color
      const grad = ctx.createRadialGradient(cx, cy, 0, cx, cy, outerR);
      grad.addColorStop(0, light.color + 'aa');    // 67% alpha at center
      grad.addColorStop(0.5, light.color + '55');  // 33% alpha at midpoint
      grad.addColorStop(1, light.color + '00');    // transparent at edge

      ctx.globalCompositeOperation = 'source-over';
      ctx.fillStyle = grad;
      ctx.fillRect(cx - outerR, cy - outerR, outerR * 2, outerR * 2);
      ctx.restore();
    }

    // Update the PIXI sprite — reuse the texture, re-uploading pixels in place
    this.colorTintTexture = this.syncCanvasTexture(this.colorTintTexture, this.colorTintCanvas);

    if (!this.colorTintSprite) {
      this.colorTintSprite = new Sprite(this.colorTintTexture);
      this.colorTintSprite.eventMode = 'none';
      this.colorTintSprite.blendMode = 'multiply';
      this.colorTintSprite.zIndex = 1; // Above mask sprite within container
      this.container.addChild(this.colorTintSprite);
    } else {
      this.colorTintSprite.texture = this.colorTintTexture;
    }

    this.colorTintSprite.position.set(offset.x, offset.y);
    this.colorTintSprite.scale.set(1 / scale);
    this.colorTintSprite.visible = !this.isPeeking;
  }

  /** Draw animated glowing orbs at each light source position. */
  private drawLightOrbs(state: ViewAtlasState, now: number = performance.now()): void {
    const g = this.lightIconGraphics;
    g.clear();

    const lights = state.objects.lights;
    for (const light of Object.values(lights)) {
      const anim = computeLightAnimation(light.id, light.lightStyle, now);
      const color = this.parseLightColor(light.color);
      const glowRadius = 18 * anim.radiusMul;

      // Outer glow (animated size)
      g.circle(light.x, light.y, glowRadius);
      g.fill({ color, alpha: 0.2 * anim.intensityMul });

      // Main orb (animated intensity)
      g.circle(light.x, light.y, 10);
      g.fill({ color, alpha: 0.85 * anim.intensityMul });

      // Bright center
      g.circle(light.x, light.y, 4);
      g.fill({ color: 0xffffff, alpha: 0.7 * anim.intensityMul });
    }
  }

  /** Parse hex color string to number, default warm orange. */
  private parseLightColor(color: string | undefined): number {
    if (!color) return 0xffaa33;
    const hex = color.replace('#', '');
    const parsed = parseInt(hex, 16);
    return isNaN(parsed) ? 0xffaa33 : parsed;
  }

  /** Load door icon SVGs into PIXI Textures (same pattern as TokenResizeUI). */
  private async loadDoorTextures(): Promise<void> {
    const size = VisionRenderer.ICON_CANVAS_SIZE;
    // White icons — same as resize/rotate handles
    const color = '#ffffff';

    this.doorOpenTexture = await this.svgToTexture(
      VisionRenderer.DOOR_OPEN_SVG
        .replace(/stroke="currentColor"/g, `stroke="${color}"`)
        .replace(/width="\d+"/, `width="${size}"`)
        .replace(/height="\d+"/, `height="${size}"`),
      size,
    );
    this.doorClosedTexture = await this.svgToTexture(
      VisionRenderer.DOOR_CLOSED_SVG
        .replace(/stroke="currentColor"/g, `stroke="${color}"`)
        .replace(/width="\d+"/, `width="${size}"`)
        .replace(/height="\d+"/, `height="${size}"`),
      size,
    );

    if (!this._isDestroyed) {
      this.store.getState().markVisionDirty();
    }
  }

  private svgToTexture(svg: string, size: number): Promise<Texture> {
    return new Promise((resolve, reject) => {
      const canvas = createEl('canvas');
      canvas.width = size;
      canvas.height = size;
      const ctx = canvas.getContext('2d');
      if (!ctx) { reject(new Error('No 2d context')); return; }

      const img = new Image();
      img.onload = (): void => {
        ctx.drawImage(img, 0, 0, size, size);
        resolve(Texture.from(canvas));
      };
      img.onerror = reject;
      img.src = `data:image/svg+xml,${encodeURIComponent(svg)}`;
    });
  }

  /**
   * Place door icon badges at the midpoint of each door segment.
   * Each badge is a circular button (matching TokenResizeUI / TokenControlsUI style)
   * with the Lucide door icon inside in white.
   */
  private drawDoorIcons(state: ViewAtlasState): void {
    // Remove old badges
    // Destroy old badges (not just remove — releases Graphics geometry + event listeners)
    for (const child of this.doorIconContainer.children) {
      child.destroy({ children: true });
    }
    this.doorIconContainer.removeChildren();

    if (!this.doorOpenTexture || !this.doorClosedTexture) return;

    const walls = state.objects.walls;
    const isPlayerView = state.isPlayerView;
    const badgeRadius = VisionRenderer.BADGE_SIZE / 2;
    const canvasSize = VisionRenderer.ICON_CANVAS_SIZE;

    // Theme colours — same as TokenResizeUI / TokenControlsUI
    const isDarkMode = document.body.classList.contains('theme-dark');
    const bgColor = isDarkMode ? 0x2a2a2a : 0xe3e3e3;
    const strokeColor = isDarkMode ? 0xffffff : 0x000000;
    const strokeAlpha = isDarkMode ? 0.4 : 0.3;

    for (const wall of Object.values(walls)) {
      if (wall.type !== 'door' && wall.type !== 'secret-door') continue;
      if (wall.type === 'secret-door' && isPlayerView) continue;

      const isOpen = !(wall.closed ?? true);
      const mx = (wall.p1.x + wall.p2.x) / 2;
      const my = (wall.p1.y + wall.p2.y) / 2;

      // Badge container — interactive so players can click to toggle doors
      const badge = new Container();
      badge.position.set(mx, my);
      badge.eventMode = 'static';
      badge.cursor = 'pointer';

      const wallId = wall.id;

      // Circular background (matching resize handle style)
      const bg = new Graphics();
      const drawBg = (hover: boolean, pressed: boolean): void => {
        bg.clear();
        bg.circle(0, 0, pressed ? badgeRadius * 0.92 : badgeRadius);
        bg.fill({ color: hover ? (isDarkMode ? 0x3a3a3a : 0xd0d0d0) : bgColor, alpha: pressed ? 1 : 0.95 });
        bg.stroke({ width: hover ? 1 : 0.5, color: strokeColor, alpha: hover ? strokeAlpha * 2 : strokeAlpha });
      };
      drawBg(false, false);
      badge.addChild(bg);

      // Hover/press effects (same pattern as TokenResizeUI)
      badge.on('pointerover', () => { drawBg(true, false); });
      badge.on('pointerout', () => { drawBg(false, false); });
      badge.on('pointerdown', (e) => {
        e.stopPropagation();
        drawBg(true, true);
        this.store.getState().toggleDoor(wallId);
      });
      badge.on('pointerup', () => { drawBg(true, false); });

      // Icon sprite (white, same as chevron icons)
      const texture = isOpen ? this.doorOpenTexture : this.doorClosedTexture;
      const iconSprite = new Sprite(texture);
      iconSprite.anchor.set(0.5);
      iconSprite.scale.set(VisionRenderer.BADGE_SIZE * 0.6 / canvasSize); // 60% of badge, same ratio as resize handles
      iconSprite.position.set(0, 0);

      // Tint secret doors orange
      if (wall.type === 'secret-door') {
        iconSprite.tint = 0xff8844;
      }

      badge.addChild(iconSprite);
      this.doorIconContainer.addChild(badge);
    }
  }

  /** Update light orb visual intensity at 60fps (just alpha changes, very cheap). */
  private updateOrbGlow(lights: Record<string, LightSource>, now: number): void {
    const g = this.lightIconGraphics;
    g.clear();

    for (const light of Object.values(lights)) {
      const anim = computeLightAnimation(light.id, light.lightStyle, now);
      const color = this.parseLightColor(light.color);
      const glowAlpha = 0.2 * anim.intensityMul;
      const orbAlpha = 0.85 * anim.intensityMul;

      g.circle(light.x, light.y, 18);
      g.fill({ color, alpha: Math.max(0.05, glowAlpha) });

      g.circle(light.x, light.y, 10);
      g.fill({ color, alpha: Math.max(0.3, orbAlpha) });

      g.circle(light.x, light.y, 4);
      g.fill({ color: 0xffffff, alpha: 0.7 * anim.intensityMul });
    }
  }

  private clearMask(): void {
    if (this.maskSprite) {
      this.maskSprite.visible = false;
    }
    if (this.colorTintSprite) {
      this.colorTintSprite.visible = false;
    }
    if (this.maskTexture) {
      this.maskTexture.destroy(true);
      this.maskTexture = null;
    }
    this.lastPolygons = [];
    this.hasAnimatedLights = false; // Stop 30fps timer when vision disabled
  }

  destroy(): void {
    this._isDestroyed = true;
    this._unsubscribe?.();
    clearAllLightAnimState();
    if (this.tickerCallback) {
      this.pixiApp.ticker.remove(this.tickerCallback);
    }
    if (this.maskTexture) {
      this.maskTexture.destroy(true);
    }
    this.compositor.destroy();
    this.lightIconGraphics.destroy();
    this.doorIconContainer.destroy({ children: true });
    if (this.doorOpenTexture) this.doorOpenTexture.destroy(true);
    if (this.doorClosedTexture) this.doorClosedTexture.destroy(true);
    if (this.colorTintTexture) this.colorTintTexture.destroy(true);
    // Release persistent canvas GPU backing stores
    this.colorTintCanvas.width = 0;
    this.colorTintCanvas.height = 0;
    this.container.destroy({ children: true });
  }
}
